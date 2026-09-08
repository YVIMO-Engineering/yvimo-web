create table if not exists public.mes_order_delivery_delays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  customer_id uuid not null references public.mes_customers(id) on delete cascade,
  production_order_id uuid not null references public.mes_production_orders(id) on delete cascade,
  original_due_date date not null,
  new_due_date date not null,
  reason text not null check (length(btrim(reason)) > 0),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  reported_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (new_due_date >= original_due_date)
);

create index if not exists mes_order_delivery_delays_order_idx
  on public.mes_order_delivery_delays (production_order_id, status, created_at desc);

create index if not exists mes_order_delivery_delays_customer_idx
  on public.mes_order_delivery_delays (organization_id, customer_id, status);

alter table public.mes_order_delivery_delays enable row level security;

drop policy if exists "Members can read order delivery delays" on public.mes_order_delivery_delays;
create policy "Members can read order delivery delays"
  on public.mes_order_delivery_delays
  for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create order delivery delays" on public.mes_order_delivery_delays;
create policy "Members can create order delivery delays"
  on public.mes_order_delivery_delays
  for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update order delivery delays" on public.mes_order_delivery_delays;
create policy "Members can update order delivery delays"
  on public.mes_order_delivery_delays
  for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete order delivery delays" on public.mes_order_delivery_delays;
create policy "Admins can delete order delivery delays"
  on public.mes_order_delivery_delays
  for delete
  using (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Portal users can read assigned delivery delays" on public.mes_order_delivery_delays;
create policy "Portal users can read assigned delivery delays"
  on public.mes_order_delivery_delays
  for select
  using (public.customer_portal_has_permission(organization_id, customer_id, 'orders'));

grant select, insert, update, delete on public.mes_order_delivery_delays to authenticated;

alter table public.mes_order_delivery_delays replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mes_order_delivery_delays'
  ) then
    alter publication supabase_realtime
      add table public.mes_order_delivery_delays;
  end if;
end;
$$;
