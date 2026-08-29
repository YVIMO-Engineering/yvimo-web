create or replace function public.get_customer_portal_order_serial_summary(
  p_organization_id uuid,
  p_customer_id uuid
)
returns table (
  production_order_id uuid,
  serial_count bigint,
  tool_ids text[]
)
language sql
security definer
stable
set search_path = public
as $$
  select
    production_order.id as production_order_id,
    count(distinct serial.id) as serial_count,
    coalesce(
      array_agg(distinct btrim(serial.tool_id) order by btrim(serial.tool_id))
        filter (where nullif(btrim(serial.tool_id), '') is not null),
      array[]::text[]
    ) as tool_ids
  from public.mes_production_orders production_order
  left join public.mes_production_serials serial
    on serial.production_order_id = production_order.id
   and serial.organization_id = production_order.organization_id
  where production_order.organization_id = p_organization_id
    and production_order.customer_id = p_customer_id
    and public.customer_portal_has_permission(
      production_order.organization_id,
      production_order.customer_id,
      'orders'
    )
  group by production_order.id;
$$;

revoke all on function public.get_customer_portal_order_serial_summary(uuid, uuid) from public;
grant execute on function public.get_customer_portal_order_serial_summary(uuid, uuid) to authenticated;
