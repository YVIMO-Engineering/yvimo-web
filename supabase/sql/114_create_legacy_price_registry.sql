create table if not exists public.mes_legacy_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  customer_id uuid references public.mes_customers(id) on delete set null,
  client_name text not null default '',
  tool_id text not null,
  serial_number text not null,
  identity_key text generated always as (lower(btrim(tool_id)) || '|' || lower(btrim(serial_number))) stored,
  price numeric(14,2) not null check (price >= 0),
  currency text not null default 'USD',
  is_active boolean not null default true,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, identity_key),
  check (btrim(tool_id) <> '' and btrim(serial_number) <> '' and btrim(currency) <> '')
);

alter table public.mes_production_serials
  add column if not exists legacy_price_id uuid references public.mes_legacy_prices(id) on delete set null;

create index if not exists mes_legacy_prices_lookup_idx
  on public.mes_legacy_prices (organization_id, lower(tool_id), lower(serial_number));
create index if not exists mes_production_serials_legacy_price_idx
  on public.mes_production_serials (legacy_price_id) where legacy_price_id is not null;

alter table public.mes_legacy_prices enable row level security;
grant select, insert, update, delete on public.mes_legacy_prices to authenticated;
create policy "Members read legacy prices" on public.mes_legacy_prices for select
  using (public.is_manufacturing_organization_member(organization_id));
create policy "Members create legacy prices" on public.mes_legacy_prices for insert
  with check (public.is_manufacturing_organization_member(organization_id));
create policy "Members update legacy prices" on public.mes_legacy_prices for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));
create policy "Admins delete legacy prices" on public.mes_legacy_prices for delete
  using (public.is_manufacturing_organization_admin(organization_id));

drop trigger if exists set_mes_legacy_prices_updated_at on public.mes_legacy_prices;
create trigger set_mes_legacy_prices_updated_at before update on public.mes_legacy_prices
for each row execute function public.set_updated_at();

create or replace function public.touch_mes_legacy_price_usage()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.legacy_price_id is not null and (tg_op = 'INSERT' or new.legacy_price_id is distinct from old.legacy_price_id) then
    update public.mes_legacy_prices
    set usage_count = usage_count + 1, last_used_at = now(), updated_by = auth.uid()
    where id = new.legacy_price_id and organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

drop trigger if exists touch_mes_legacy_price_usage on public.mes_production_serials;
create trigger touch_mes_legacy_price_usage after insert or update of legacy_price_id
on public.mes_production_serials for each row execute function public.touch_mes_legacy_price_usage();

alter publication supabase_realtime add table public.mes_legacy_prices;
