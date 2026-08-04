create table if not exists public.mes_quotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  quotation_number text not null,
  customer_id uuid references public.mes_customers(id) on delete set null,
  client_name text not null,
  part_type text not null,
  tool_id text not null,
  serial_number text not null,
  length_mm numeric not null check (length_mm > 0),
  diameter_mm numeric not null check (diameter_mm > 0),
  damage_inches numeric not null default 0 check (damage_inches >= 0),
  measurement_unit text not null default 'mm' check (measurement_unit in ('in', 'mm')),
  coating_type text not null,
  design text not null,
  work_center text not null,
  machine_time_minutes integer not null check (machine_time_minutes > 0 and machine_time_minutes % 30 = 0),
  coating_price numeric(12,2) not null default 0,
  machine_price numeric(12,2) not null default 0,
  damage_surcharge numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0,
  pricing_status text not null default 'calculated' check (pricing_status in ('calculated', 'manual-review')),
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved')),
  valid_until date not null default (current_date + 30),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, quotation_number)
);

alter table public.mes_quotations
  add column if not exists measurement_unit text not null default 'mm';

alter table public.mes_quotations enable row level security;
grant select, insert, update, delete on public.mes_quotations to authenticated;

drop policy if exists "Members can read mes_quotations" on public.mes_quotations;
create policy "Members can read mes_quotations" on public.mes_quotations for select
using (public.is_manufacturing_organization_member(organization_id));
drop policy if exists "Members can create mes_quotations" on public.mes_quotations;
create policy "Members can create mes_quotations" on public.mes_quotations for insert
with check (public.is_manufacturing_organization_member(organization_id));
drop policy if exists "Members can update mes_quotations" on public.mes_quotations;
create policy "Members can update mes_quotations" on public.mes_quotations for update
using (public.is_manufacturing_organization_member(organization_id))
with check (public.is_manufacturing_organization_member(organization_id));
drop policy if exists "Admins can delete mes_quotations" on public.mes_quotations;
create policy "Admins can delete mes_quotations" on public.mes_quotations for delete
using (public.is_manufacturing_organization_admin(organization_id));

create index if not exists mes_quotations_organization_created_idx
on public.mes_quotations (organization_id, created_at desc);

drop trigger if exists set_mes_quotations_updated_at on public.mes_quotations;
create trigger set_mes_quotations_updated_at before update on public.mes_quotations
for each row execute function public.set_updated_at();
