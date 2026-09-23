-- Display currency for the Operation Cost Tracker.
--
-- Money reaches the tracker in whatever currency it was recorded in: supplies priced in
-- MXN on the item card, downtime valued in USD by the work center rate, manual entries in
-- whichever currency the expense was paid. Until now every subtotal kept its own currency
-- and the KPI read "MX$8,008.00 + $409.31", which is not a number anybody can act on.
--
-- The plant picks one currency and the whole tracker -- every KPI and every row of the
-- event table -- is converted to it at the market rate. The choice belongs to the
-- organization, not to the person looking at the screen: the plant reports its operating
-- cost in one currency, so whoever opens the tracker sees the same one.

create table if not exists public.mes_profit_leak_settings (
  organization_id uuid primary key references public.manufacturing_organizations(id) on delete cascade,
  display_currency text not null default 'USD',
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mes_profit_leak_settings_display_currency_check
    check (display_currency in ('MXN', 'USD', 'EUR', 'JPY', 'GBP'))
);

comment on column public.mes_profit_leak_settings.display_currency is
  'Currency every Operation Cost Tracker KPI and event row is converted to. Conversion is for reading only: recorded amounts keep the currency they were captured in.';

alter table public.mes_profit_leak_settings enable row level security;

grant select, insert, update on public.mes_profit_leak_settings to authenticated;

drop policy if exists "Members can read profit leak settings" on public.mes_profit_leak_settings;
create policy "Members can read profit leak settings"
  on public.mes_profit_leak_settings for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create profit leak settings" on public.mes_profit_leak_settings;
create policy "Members can create profit leak settings"
  on public.mes_profit_leak_settings for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update profit leak settings" on public.mes_profit_leak_settings;
create policy "Members can update profit leak settings"
  on public.mes_profit_leak_settings for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop trigger if exists set_mes_profit_leak_settings_updated_at on public.mes_profit_leak_settings;
create trigger set_mes_profit_leak_settings_updated_at
before update on public.mes_profit_leak_settings
for each row execute function public.set_updated_at();

-- The currency is shared, so changing it reaches every open tracker.
alter table public.mes_profit_leak_settings replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mes_profit_leak_settings'
  ) then
    alter publication supabase_realtime
      add table public.mes_profit_leak_settings;
  end if;
end;
$$;
