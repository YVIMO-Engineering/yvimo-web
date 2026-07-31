create table if not exists public.mes_customer_reception_vouchers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  customer_id uuid not null references public.mes_customers(id) on delete restrict,
  voucher_number text not null,
  customer_reference text not null default '',
  packing_slip text not null default '',
  carrier text not null default '',
  part_number text not null,
  description text not null default '',
  lot_serial text not null default '',
  quantity_expected integer not null check (quantity_expected > 0),
  quantity_received integer not null default 0 check (quantity_received >= 0),
  status text not null default 'expected'
    check (status in ('expected', 'arrived', 'counted', 'inspection', 'received', 'discrepancy')),
  expected_date date,
  received_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, voucher_number)
);

create index if not exists mes_customer_reception_vouchers_org_status_idx
  on public.mes_customer_reception_vouchers (organization_id, status, created_at desc);

create index if not exists mes_customer_reception_vouchers_customer_idx
  on public.mes_customer_reception_vouchers (customer_id, created_at desc);

alter table public.mes_customer_reception_vouchers enable row level security;

create policy "Members can manage customer reception vouchers"
  on public.mes_customer_reception_vouchers for all
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

grant select, insert, update, delete on public.mes_customer_reception_vouchers to authenticated;

