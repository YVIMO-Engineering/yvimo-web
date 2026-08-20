create table if not exists public.mes_order_risk_settings (
  organization_id uuid primary key references public.manufacturing_organizations(id) on delete cascade,
  day_count_mode text not null default 'calendar' check (day_count_mode in ('calendar', 'business')),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mes_order_risk_settings enable row level security;

grant select, insert, update on public.mes_order_risk_settings to authenticated;

drop policy if exists "Members can read order risk settings" on public.mes_order_risk_settings;
create policy "Members can read order risk settings"
  on public.mes_order_risk_settings for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create order risk settings" on public.mes_order_risk_settings;
create policy "Members can create order risk settings"
  on public.mes_order_risk_settings for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update order risk settings" on public.mes_order_risk_settings;
create policy "Members can update order risk settings"
  on public.mes_order_risk_settings for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop trigger if exists set_mes_order_risk_settings_updated_at on public.mes_order_risk_settings;
create trigger set_mes_order_risk_settings_updated_at
before update on public.mes_order_risk_settings
for each row execute function public.set_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.mes_order_risk_settings;
exception when duplicate_object then null;
end $$;
