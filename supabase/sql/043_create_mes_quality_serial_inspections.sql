create table if not exists public.mes_quality_serial_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  production_order_id uuid not null references public.mes_production_orders(id) on delete cascade,
  serial_number text not null,
  result text not null check (result in ('ok', 'approach', 'nok')),
  inspected_by uuid references auth.users(id) on delete set null default auth.uid(),
  inspected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (production_order_id, serial_number)
);

create index if not exists mes_quality_serial_inspections_order_idx
  on public.mes_quality_serial_inspections (production_order_id, inspected_at desc);

alter table public.mes_quality_serial_inspections enable row level security;

drop policy if exists "Members can read MES quality serial inspections" on public.mes_quality_serial_inspections;
create policy "Members can read MES quality serial inspections"
  on public.mes_quality_serial_inspections
  for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create MES quality serial inspections" on public.mes_quality_serial_inspections;
create policy "Members can create MES quality serial inspections"
  on public.mes_quality_serial_inspections
  for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update MES quality serial inspections" on public.mes_quality_serial_inspections;
create policy "Members can update MES quality serial inspections"
  on public.mes_quality_serial_inspections
  for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete MES quality serial inspections" on public.mes_quality_serial_inspections;
create policy "Admins can delete MES quality serial inspections"
  on public.mes_quality_serial_inspections
  for delete
  using (public.is_manufacturing_organization_admin(organization_id));

grant select, insert, update, delete on public.mes_quality_serial_inspections to authenticated;