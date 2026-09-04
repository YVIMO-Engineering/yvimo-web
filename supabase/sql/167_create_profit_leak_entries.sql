create table if not exists public.mes_profit_leak_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  category text not null check (category in ('external-supplier', 'manufacturing-transfer', 'warranty')),
  title text not null check (length(btrim(title)) > 0),
  party text not null default '',
  description text not null default '',
  reference text not null default '',
  work_center_id uuid references public.mes_work_centers(id) on delete set null,
  quantity integer not null default 1 check (quantity > 0),
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  currency text not null default 'USD' check (length(btrim(currency)) > 0),
  incurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mes_profit_leak_entries is
  'Manually logged Profit Leak events that do not already flow through another MES table: external supplier services (water, HVAC/general maintenance, coating, etc.), manufacturing transfers sent out without a full Supplier Operations checkout, and warranties given to clients outside a traced scrap event.';
comment on column public.mes_profit_leak_entries.category is
  'Which Profit Leak KPI this entry adds to: external-supplier, manufacturing-transfer, or warranty.';
comment on column public.mes_profit_leak_entries.title is
  'Category-specific classification: service purchased, external process, or warranty reason.';
comment on column public.mes_profit_leak_entries.party is
  'Supplier name for external-supplier and manufacturing-transfer entries; client name for warranty entries.';
comment on column public.mes_profit_leak_entries.quantity is
  'Pieces sent (manufacturing-transfer) or pieces under warranty (warranty). Always 1 for external-supplier.';
comment on column public.mes_profit_leak_entries.incurred_at is
  'Date the entry belongs to. Profit Leak filters its period by this column, not by created_at.';

create index if not exists mes_profit_leak_entries_organization_date_idx
  on public.mes_profit_leak_entries (organization_id, category, incurred_at desc);

alter table public.mes_profit_leak_entries enable row level security;

drop policy if exists "Members can read profit leak entries" on public.mes_profit_leak_entries;
create policy "Members can read profit leak entries" on public.mes_profit_leak_entries
  for select using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create profit leak entries" on public.mes_profit_leak_entries;
create policy "Members can create profit leak entries" on public.mes_profit_leak_entries
  for insert with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update profit leak entries" on public.mes_profit_leak_entries;
create policy "Members can update profit leak entries" on public.mes_profit_leak_entries
  for update using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can delete profit leak entries" on public.mes_profit_leak_entries;
create policy "Members can delete profit leak entries" on public.mes_profit_leak_entries
  for delete using (public.is_manufacturing_organization_member(organization_id));

grant select, insert, update, delete on public.mes_profit_leak_entries to authenticated;

drop trigger if exists set_mes_profit_leak_entries_updated_at on public.mes_profit_leak_entries;
create trigger set_mes_profit_leak_entries_updated_at
before update on public.mes_profit_leak_entries
for each row execute function public.set_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.mes_profit_leak_entries;
exception when duplicate_object then null;
end $$;
