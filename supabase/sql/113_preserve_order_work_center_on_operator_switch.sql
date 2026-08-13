-- Station codes are unique inside a Work Center, not across the organization.
-- Selecting a job must therefore resolve the station within the Work Center
-- already assigned to the production order and must never move the order.
create or replace function public.mes_operator_switch_active_order(
  p_order_id uuid,
  p_organization_id uuid,
  p_station_code text,
  p_comment text default null,
  p_shift text default null
)
returns public.mes_production_orders
language plpgsql
security invoker
as $$
declare
  v_order public.mes_production_orders%rowtype;
  v_station_code text;
  v_station_id uuid;
  v_work_center_id uuid;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'Organization access denied.';
  end if;

  select * into v_order
  from public.mes_production_orders
  where id = p_order_id
    and organization_id = p_organization_id
    and status in ('released', 'running', 'paused')
  for update;

  if not found then raise exception 'Production order not found.'; end if;

  v_station_code = coalesce(nullif(p_station_code, ''), v_order.assigned_station);

  select station.id, station.work_center_id
  into v_station_id, v_work_center_id
  from public.mes_work_center_stations station
  join public.mes_work_centers work_center on work_center.id = station.work_center_id
  where station.organization_id = p_organization_id
    and station.code = v_station_code
    and work_center.organization_id = p_organization_id
    and work_center.code = v_order.assigned_work_center
  limit 1;

  if v_station_id is null then
    raise exception 'The selected station does not belong to the production order Work Center.';
  end if;

  if v_order.manufacturing_type = 'multi-step' and not exists (
    select 1
    from public.mes_production_serials serial
    where serial.organization_id = p_organization_id
      and serial.production_order_id = v_order.id
      and serial.result is null
      and (
        serial.assigned_station = v_station_code
        or v_station_code = any(serial.compatible_stations)
      )
  ) then
    raise exception 'This Multi-step order has no pending pieces compatible with the selected station.';
  end if;

  update public.mes_production_orders
  set status = 'paused'
  where organization_id = p_organization_id
    and id <> v_order.id
    and manufacturing_type = 'single-operation'
    and assigned_work_center = v_order.assigned_work_center
    and assigned_station = v_station_code
    and status = 'running';

  update public.mes_production_orders
  set status = 'paused',
      assigned_station = case
        when manufacturing_type = 'multi-step' then assigned_station
        else v_station_code
      end
  where id = v_order.id
  returning * into v_order;

  insert into public.mes_operator_terminal_events (
    organization_id, production_order_id, work_center_code, station_code,
    event_type, comment, payload
  ) values (
    p_organization_id, v_order.id, v_order.assigned_work_center, v_station_code,
    'job-paused', p_comment,
    jsonb_build_object('action', 'active-order-selected', 'awaiting_operator_start', true,
      'shift', p_shift, 'manufacturing_type', v_order.manufacturing_type)
  );

  update public.mes_work_center_stations
  set current_job = v_order.order_number,
      status = 'idle',
      last_event = 'Order selected - awaiting operator start'
  where id = v_station_id
    and organization_id = p_organization_id
    and work_center_id = v_work_center_id;

  return v_order;
end;
$$;

grant execute on function public.mes_operator_switch_active_order(uuid, uuid, text, text, text)
  to authenticated;
