create or replace function public.get_customer_portal_production_tracking(
  p_organization_id uuid,
  p_customer_id uuid
)
returns table (
  production_order_id uuid,
  order_number text,
  received_at timestamptz,
  piece_type text,
  part_number text,
  order_status text,
  production_serial_id uuid,
  piece_sequence integer,
  tool_id text,
  serial_number text,
  before_notch numeric,
  before_tooth_length numeric,
  stock_to_remove numeric,
  after_tooth_length numeric,
  machine text,
  reported_at timestamptz,
  result text,
  reception_status text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    production_order.id,
    production_order.order_number,
    reception.received_at,
    production_order.piece_type,
    production_order.part_number,
    production_order.status,
    serial.id,
    serial.piece_sequence,
    coalesce(nullif(btrim(serial.tool_id), ''), nullif(btrim(traceability.tool_id), '')),
    coalesce(nullif(btrim(serial.serial_number), ''), nullif(btrim(traceability.serial_number), '')),
    serial.before_notch,
    serial.before_tooth_length,
    serial.stock_to_remove,
    traceability.after_tooth_length,
    coalesce(station.name, nullif(btrim(serial.assigned_station), ''), nullif(btrim(production_order.assigned_station), '')),
    serial.reported_at,
    serial.result,
    case
      when reception.sent_at is not null then 'sent'
      when reception.coating_returned_at is not null then 'waiting-delivery'
      when reception.coating_sent_at is not null then 'coating'
      when serial.result = 'good' then 'quality-inspection'
      when reception.reception_item_id is null then 'not-linked'
      else 'manufacturing'
    end
  from public.mes_production_orders production_order
  left join public.mes_production_serials serial
    on serial.production_order_id = production_order.id
   and serial.organization_id = production_order.organization_id
  left join lateral (
    select trace.tool_id, trace.serial_number, trace.after_tooth_length
    from public.mes_operator_terminal_traceability trace
    where trace.organization_id = production_order.organization_id
      and trace.production_order_id = production_order.id
      and (trace.id = serial.traceability_id
        or lower(btrim(trace.serial_number)) = lower(btrim(serial.serial_number)))
    order by (trace.id = serial.traceability_id) desc, trace.created_at desc
    limit 1
  ) traceability on true
  left join public.mes_work_center_stations station
    on station.organization_id = production_order.organization_id
   and station.code = coalesce(nullif(btrim(serial.assigned_station), ''), nullif(btrim(production_order.assigned_station), ''))
  left join lateral (
    select
      item.id as reception_item_id,
      coalesce(voucher.received_at, voucher.created_at) as received_at,
      coalesce(progress.coating_sent_at, item.coating_sent_at) as coating_sent_at,
      coalesce(progress.coating_returned_at, item.coating_returned_at) as coating_returned_at,
      coalesce(progress.sent_at, item.sent_at) as sent_at
    from public.mes_customer_reception_items item
    join public.mes_customer_reception_vouchers voucher on voucher.id = item.reception_voucher_id
    left join public.mes_customer_reception_serial_progress progress
      on progress.reception_item_id = item.id
     and progress.production_serial_id = serial.id
    where item.production_order_id = production_order.id
    order by progress.updated_at desc nulls last, item.created_at desc
    limit 1
  ) reception on true
  where production_order.organization_id = p_organization_id
    and production_order.customer_id = p_customer_id
    and public.customer_portal_has_permission(p_organization_id, p_customer_id, 'orders')
  order by coalesce(reception.received_at, production_order.created_at) desc,
    production_order.order_number desc, serial.piece_sequence;
$$;

revoke all on function public.get_customer_portal_production_tracking(uuid, uuid) from public;
grant execute on function public.get_customer_portal_production_tracking(uuid, uuid) to authenticated;
