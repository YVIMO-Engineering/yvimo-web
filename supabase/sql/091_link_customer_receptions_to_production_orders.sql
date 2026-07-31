alter table public.mes_customer_reception_vouchers
  add column if not exists production_order_id uuid references public.mes_production_orders(id) on delete set null,
  add column if not exists production_order_number text not null default '';

alter table public.mes_customer_reception_vouchers
  alter column part_number set default '';

alter table public.mes_customer_reception_vouchers
  drop constraint if exists mes_customer_reception_vouchers_status_check;

update public.mes_customer_reception_vouchers
set status = case
  when status = 'received' then 'waiting-delivery'
  when status in ('expected', 'arrived', 'counted') then 'reception'
  when status = 'inspection' then 'quality-inspection'
  else status
end;

alter table public.mes_customer_reception_vouchers
  add constraint mes_customer_reception_vouchers_status_check
  check (status in ('reception', 'manufacturing', 'quality-inspection', 'waiting-delivery', 'sent', 'discrepancy'));

alter table public.mes_customer_reception_vouchers
  alter column status set default 'reception';

create index if not exists mes_customer_reception_vouchers_production_order_idx
  on public.mes_customer_reception_vouchers (production_order_id)
  where production_order_id is not null;
