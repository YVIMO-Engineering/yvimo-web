alter table public.mes_production_orders
  add column if not exists customer_id uuid references public.mes_customers(id) on delete restrict;

update public.mes_production_orders as production_order
set customer_id = customer.id
from public.mes_customers as customer
where production_order.customer_id is null
  and production_order.organization_id = customer.organization_id
  and lower(trim(production_order.client_name)) = lower(trim(customer.customer_name));

create index if not exists mes_production_orders_organization_customer_idx
on public.mes_production_orders (organization_id, customer_id);
