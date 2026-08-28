create table if not exists public.customer_portal_accesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  customer_id uuid not null references public.mes_customers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  access_profile text not null default 'standard' check (access_profile in ('standard', 'admin', 'documents')),
  permissions jsonb not null default '{"orders":true,"tools":true,"documents":true,"shipments":true,"notifications":true}'::jsonb,
  status text not null default 'active' check (status in ('active', 'disabled')),
  must_change_password boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, customer_id, user_id)
);

alter table public.customer_portal_accesses enable row level security;
grant select, insert, update, delete on public.customer_portal_accesses to authenticated;

create or replace function public.is_customer_portal_user(
  p_organization_id uuid,
  p_customer_id uuid default null,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.customer_portal_accesses access
    where access.organization_id = p_organization_id
      and access.user_id = p_user_id
      and access.status = 'active'
      and (p_customer_id is null or access.customer_id = p_customer_id)
  );
$$;

drop policy if exists "Portal users and admins can read portal accesses" on public.customer_portal_accesses;
create policy "Portal users and admins can read portal accesses"
on public.customer_portal_accesses for select
using (
  user_id = auth.uid()
  or public.is_manufacturing_organization_admin(organization_id)
);

drop policy if exists "Admins can create portal accesses" on public.customer_portal_accesses;
create policy "Admins can create portal accesses"
on public.customer_portal_accesses for insert
with check (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Admins can update portal accesses" on public.customer_portal_accesses;
create policy "Admins can update portal accesses"
on public.customer_portal_accesses for update
using (public.is_manufacturing_organization_admin(organization_id))
with check (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Admins can delete portal accesses" on public.customer_portal_accesses;
create policy "Admins can delete portal accesses"
on public.customer_portal_accesses for delete
using (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Portal users can read their supplier organization" on public.manufacturing_organizations;
create policy "Portal users can read their supplier organization"
on public.manufacturing_organizations for select
using (public.is_customer_portal_user(id));

drop policy if exists "Portal users can read their assigned customer" on public.mes_customers;
create policy "Portal users can read their assigned customer"
on public.mes_customers for select
using (public.is_customer_portal_user(organization_id, id));

create index if not exists customer_portal_accesses_user_idx
  on public.customer_portal_accesses (user_id, status, organization_id, customer_id);
create index if not exists customer_portal_accesses_org_customer_idx
  on public.customer_portal_accesses (organization_id, customer_id, status, created_at desc);

drop trigger if exists set_customer_portal_accesses_updated_at on public.customer_portal_accesses;
create trigger set_customer_portal_accesses_updated_at
before update on public.customer_portal_accesses
for each row execute function public.set_updated_at();
