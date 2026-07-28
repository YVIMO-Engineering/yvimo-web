create or replace function public.mes_operator_set_state(
  p_order_id uuid,
  p_organization_id uuid,
  p_station_code text,
  p_state text,
  p_reason text default null,
  p_comment text default null,
  p_shift text default null
)
returns public.mes_production_orders
language plpgsql
security invoker
as $$
declare
  v_order public.mes_production_orders%rowtype;
  v_event_type text;
  v_station_status text;
  v_station_code text;
  v_previous_status text;
  v_target_status text;
  v_has_pending_quality_parts boolean;
  v_serial_count integer;
  v_good_count integer;
  v_scrap_count integer;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'Organization access denied.';
  end if;

  if p_state not in ('running', 'paused', 'down', 'completed') then
    raise exception 'Unsupported operator state: %', p_state;
  end if;

  select *
    into v_order
  from public.mes_production_orders
  where id = p_order_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Production order not found.';
  end if;

  if p_state = 'completed' then
    select
      count(*) filter (where serial.result is not null),
      count(*) filter (where serial.result = 'good'),
      count(*) filter (where serial.result = 'scrap')
    into v_serial_count, v_good_count, v_scrap_count
    from public.mes_production_serials serial
    where serial.production_order_id = v_order.id
      and serial.organization_id = p_organization_id;

    if v_serial_count > 0 then
      update public.mes_production_orders
      set completed_quantity = v_good_count,
          scrap_quantity = v_scrap_count
      where id = v_order.id
      returning * into v_order;
    end if;

    if v_order.completed_quantity + v_order.scrap_quantity < v_order.planned_quantity then
      raise exception 'The planned quantity has not been fully reported (% of %).',
        v_order.completed_quantity + v_order.scrap_quantity,
        v_order.planned_quantity;
    end if;
  end if;

  select exists (
    select 1
    from public.mes_production_serials serial
    where serial.production_order_id = v_order.id
      and serial.result = 'good'
      and serial.ready_for_quality
      and not exists (
        select 1
        from public.mes_quality_serial_inspections inspection
        where inspection.production_order_id = serial.production_order_id
          and lower(btrim(inspection.serial_number)) = lower(btrim(serial.serial_number))
      )
  )
  into v_has_pending_quality_parts;

  v_station_code = coalesce(nullif(p_station_code, ''), v_order.assigned_station);
  v_previous_status = v_order.status;
  v_target_status = case
    when p_state = 'down' then 'paused'
    when p_state = 'completed'
      and v_order.quality_checks_enabled
      and v_has_pending_quality_parts then 'waiting-inspection'
    else p_state
  end;

  update public.mes_production_orders
  set status = v_target_status
  where id = v_order.id
  returning * into v_order;

  v_event_type = case
    when p_state = 'running' and v_previous_status in ('paused', 'running') then 'job-resumed'
    when p_state = 'running' then 'job-started'
    when p_state = 'paused' then 'job-paused'
    when p_state = 'down' then 'downtime-started'
    when p_state = 'completed' and v_target_status = 'waiting-inspection' then 'manufacturing-completed'
    when p_state = 'completed' then 'operation-completed'
    else 'job-resumed'
  end;

  v_station_status = case
    when p_state in ('down', 'paused', 'completed') then 'idle'
    else 'running'
  end;

  insert into public.mes_operator_terminal_events (
    organization_id,
    production_order_id,
    work_center_code,
    station_code,
    event_type,
    reason,
    comment,
    payload
  )
  values (
    p_organization_id,
    v_order.id,
    v_order.assigned_work_center,
    v_station_code,
    v_event_type,
    p_reason,
    p_comment,
    jsonb_build_object(
      'shift', p_shift,
      'order_status', v_target_status
    )
  );

  if p_state = 'down' then
    insert into public.mes_operator_terminal_downtime (
      organization_id,
      production_order_id,
      work_center_code,
      station_code,
      reason,
      comment
    )
    values (
      p_organization_id,
      v_order.id,
      v_order.assigned_work_center,
      v_station_code,
      p_reason,
      p_comment
    );
  end if;

  update public.mes_work_center_stations
  set current_job = case when p_state = 'completed' then null else v_order.order_number end,
      status = v_station_status,
      last_event = case
        when p_state = 'running' then 'Job running'
        when p_state = 'paused' then 'Job paused'
        when p_state = 'down' then 'Downtime reported'
        when v_target_status = 'waiting-inspection' then 'Manufacturing completed - waiting inspection'
        when p_state = 'completed' then 'Operation completed'
        else last_event
      end
  where organization_id = p_organization_id
    and code = v_station_code;

  return v_order;
end;
$$;

grant execute on function public.mes_operator_set_state(uuid, uuid, text, text, text, text, text) to authenticated;
