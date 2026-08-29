drop function if exists public.get_customer_portal_order_serial_summary(uuid, uuid);

create function public.get_customer_portal_order_serial_summary(
  p_organization_id uuid,
  p_customer_id uuid
)
returns table (
  production_order_id uuid,
  serial_count bigint,
  tool_ids text[],
  serial_numbers text[]
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
      array_agg(
        distinct btrim(coalesce(nullif(serial.tool_id, ''), traceability.tool_id))
        order by btrim(coalesce(nullif(serial.tool_id, ''), traceability.tool_id))
      ) filter (
        where nullif(btrim(coalesce(nullif(serial.tool_id, ''), traceability.tool_id)), '') is not null
      ),
      array[]::text[]
    ) as tool_ids,
    coalesce(
      array_agg(distinct btrim(serial.serial_number) order by btrim(serial.serial_number))
        filter (where nullif(btrim(serial.serial_number), '') is not null),
      array[]::text[]
    ) as serial_numbers
  from public.mes_production_orders production_order
  left join public.mes_production_serials serial
    on serial.production_order_id = production_order.id
   and serial.organization_id = production_order.organization_id
  left join lateral (
    select trace.tool_id
    from public.mes_operator_terminal_traceability trace
    where trace.organization_id = production_order.organization_id
      and trace.production_order_id = production_order.id
      and nullif(btrim(trace.tool_id), '') is not null
      and (
        trace.id = serial.traceability_id
        or lower(btrim(trace.serial_number)) = lower(btrim(serial.serial_number))
      )
    order by (trace.id = serial.traceability_id) desc, trace.created_at desc
    limit 1
  ) traceability on true
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
