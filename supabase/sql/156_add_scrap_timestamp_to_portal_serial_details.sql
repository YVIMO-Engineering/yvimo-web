drop function if exists public.get_customer_portal_order_serial_details(uuid, uuid);

create function public.get_customer_portal_order_serial_details(
  p_organization_id uuid,
  p_customer_id uuid
)
returns table (
  production_order_id uuid,
  production_serial_id uuid,
  piece_sequence integer,
  serial_number text,
  tool_id text,
  result text,
  reported_at timestamptz,
  voucher_number text,
  coating_sent_at timestamptz,
  coating_returned_at timestamptz,
  delivered_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    production_order.id,
    serial.id,
    serial.piece_sequence,
    coalesce(nullif(btrim(serial.serial_number), ''), nullif(btrim(traceability.serial_number), ''), ''),
    coalesce(nullif(btrim(serial.tool_id), ''), nullif(btrim(traceability.tool_id), ''), ''),
    serial.result,
    serial.reported_at,
    reception.voucher_number,
    reception.coating_sent_at,
    reception.coating_returned_at,
    reception.sent_at
  from public.mes_production_orders production_order
  join public.mes_production_serials serial
    on serial.production_order_id = production_order.id
   and serial.organization_id = production_order.organization_id
  left join lateral (
    select trace.tool_id, trace.serial_number
    from public.mes_operator_terminal_traceability trace
    where trace.organization_id = production_order.organization_id
      and trace.production_order_id = production_order.id
      and (
        trace.id = serial.traceability_id
        or lower(btrim(trace.serial_number)) = lower(btrim(serial.serial_number))
      )
    order by (trace.id = serial.traceability_id) desc, trace.created_at desc
    limit 1
  ) traceability on true
  left join lateral (
    select voucher.voucher_number, progress.coating_sent_at,
      progress.coating_returned_at, progress.sent_at
    from public.mes_customer_reception_serial_progress progress
    join public.mes_customer_reception_items item
      on item.id = progress.reception_item_id
     and item.production_order_id = production_order.id
    join public.mes_customer_reception_vouchers voucher
      on voucher.id = item.reception_voucher_id
    where progress.production_serial_id = serial.id
    order by progress.updated_at desc
    limit 1
  ) reception on true
  where production_order.organization_id = p_organization_id
    and production_order.customer_id = p_customer_id
    and public.customer_portal_has_permission(
      production_order.organization_id,
      production_order.customer_id,
      'orders'
    )
  order by production_order.updated_at desc, serial.piece_sequence;
$$;

revoke all on function public.get_customer_portal_order_serial_details(uuid, uuid) from public;
grant execute on function public.get_customer_portal_order_serial_details(uuid, uuid) to authenticated;
