create table if not exists public.mes_external_supplier_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  service_type text not null check (length(btrim(service_type)) > 0),
  supplier text not null default '',
  description text not null default '',
  reference text not null default '',
  work_center_id uuid references public.mes_work_centers(id) on delete set null,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  currency text not null default 'USD' check (length(btrim(currency)) > 0),
  incurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mes_external_supplier_expenses is
  'Services purchased from external suppliers that reduce profit: water supply, HVAC and general maintenance, coating, waste disposal, and similar recurring services.';
comment on column public.mes_external_supplier_expenses.service_type is
  'Service purchased from the external supplier, for example "AC maintenance" or "Coating service".';
comment on column public.mes_external_supplier_expenses.incurred_at is
  'Date the expense belongs to. Profit Leak filters its period by this column, not by created_at.';

create index if not exists mes_external_supplier_expenses_organization_date_idx
  on public.mes_external_supplier_expenses (organization_id, incurred_at desc);

alter table public.mes_external_supplier_expenses enable row level security;

drop policy if exists "Members can read external supplier expenses" on public.mes_external_supplier_expenses;
create policy "Members can read external supplier expenses" on public.mes_external_supplier_expenses
  for select using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create external supplier expenses" on public.mes_external_supplier_expenses;
create policy "Members can create external supplier expenses" on public.mes_external_supplier_expenses
  for insert with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update external supplier expenses" on public.mes_external_supplier_expenses;
create policy "Members can update external supplier expenses" on public.mes_external_supplier_expenses
  for update using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can delete external supplier expenses" on public.mes_external_supplier_expenses;
create policy "Members can delete external supplier expenses" on public.mes_external_supplier_expenses
  for delete using (public.is_manufacturing_organization_member(organization_id));

grant select, insert, update, delete on public.mes_external_supplier_expenses to authenticated;

drop trigger if exists set_mes_external_supplier_expenses_updated_at on public.mes_external_supplier_expenses;
create trigger set_mes_external_supplier_expenses_updated_at
before update on public.mes_external_supplier_expenses
for each row execute function public.set_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.mes_external_supplier_expenses;
exception when duplicate_object then null;
end $$;
