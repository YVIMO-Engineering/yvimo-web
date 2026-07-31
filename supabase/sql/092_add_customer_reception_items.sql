alter table public.mes_customer_reception_vouchers
  alter column customer_id drop not null;

alter table public.mes_customer_reception_vouchers
  drop constraint if exists mes_customer_reception_vouchers_status_check;

update public.mes_customer_reception_vouchers
set status = 'assign-orders'
where status = 'reception';

alter table public.mes_customer_reception_vouchers
  add constraint mes_customer_reception_vouchers_status_check
  check (status in ('reception', 'assign-orders', 'manufacturing', 'quality-inspection', 'waiting-delivery', 'sent', 'discrepancy'));

alter table public.mes_customer_reception_vouchers
  alter column status set default 'assign-orders';

create table if not exists public.mes_customer_reception_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  reception_voucher_id uuid not null references public.mes_customer_reception_vouchers(id) on delete cascade,
  customer_id uuid not null references public.mes_customers(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  production_order_id uuid references public.mes_production_orders(id) on delete set null,
  production_order_number text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mes_customer_reception_items_voucher_idx
  on public.mes_customer_reception_items (reception_voucher_id, created_at);

create index if not exists mes_customer_reception_items_order_idx
  on public.mes_customer_reception_items (production_order_id)
  where production_order_id is not null;

alter table public.mes_customer_reception_items enable row level security;

create policy "Members can manage customer reception items"
  on public.mes_customer_reception_items for all
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

grant select, insert, update, delete on public.mes_customer_reception_items to authenticated;

insert into public.mes_customer_reception_items (
  organization_id,
  reception_voucher_id,
  customer_id,
  quantity,
  production_order_id,
  production_order_number
)
select
  organization_id,
  id,
  customer_id,
  quantity_expected,
  production_order_id,
  production_order_number
from public.mes_customer_reception_vouchers
where customer_id is not null
  and not exists (
    select 1
    from public.mes_customer_reception_items item
    where item.reception_voucher_id = mes_customer_reception_vouchers.id
  );

