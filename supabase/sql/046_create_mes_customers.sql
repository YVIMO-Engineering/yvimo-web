create table if not exists public.mes_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  customer_name text not null,
  legal_name text not null,
  tax_id text,
  contact_name text not null,
  email text not null,
  phone text not null,
  address text not null,
  payment_terms text not null,
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, customer_name)
);

alter table public.mes_customers enable row level security;

grant select, insert, update, delete on public.mes_customers to authenticated;

drop policy if exists "Members can read mes_customers" on public.mes_customers;
create policy "Members can read mes_customers"
on public.mes_customers for select
using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create mes_customers" on public.mes_customers;
create policy "Members can create mes_customers"
on public.mes_customers for insert
with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update mes_customers" on public.mes_customers;
create policy "Members can update mes_customers"
on public.mes_customers for update
using (public.is_manufacturing_organization_member(organization_id))
with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete mes_customers" on public.mes_customers;
create policy "Admins can delete mes_customers"
on public.mes_customers for delete
using (public.is_manufacturing_organization_admin(organization_id));

create index if not exists mes_customers_organization_status_name_idx
on public.mes_customers (organization_id, status, customer_name);

drop trigger if exists set_mes_customers_updated_at on public.mes_customers;
create trigger set_mes_customers_updated_at
before update on public.mes_customers
for each row execute function public.set_updated_at();
