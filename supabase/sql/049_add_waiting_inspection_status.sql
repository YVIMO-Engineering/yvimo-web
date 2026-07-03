alter table public.mes_production_orders
  drop constraint if exists mes_production_orders_status_check;

alter table public.mes_production_orders
  add constraint mes_production_orders_status_check
  check (status in ('planned', 'released', 'running', 'paused', 'waiting-inspection', 'completed', 'cancelled'));

update public.mes_production_orders production_order
set status = 'waiting-inspection'
where production_order.status = 'completed'
  and production_order.quality_checks_enabled
  and exists (
    select 1
    from public.mes_production_serials serial
    where serial.production_order_id = production_order.id
      and serial.result = 'good'
      and serial.ready_for_quality
      and not exists (
        select 1
        from public.mes_quality_serial_inspections inspection
        where inspection.production_order_id = serial.production_order_id
          and lower(btrim(inspection.serial_number)) = lower(btrim(serial.serial_number))
      )
  );

alter table public.mes_operator_terminal_events
  drop constraint if exists mes_operator_terminal_events_event_type_check;

alter table public.mes_operator_terminal_events
  add constraint mes_operator_terminal_events_event_type_check
  check (
    event_type in (
      'job-started',
      'job-resumed',
      'job-paused',
      'downtime-started',
      'production-good',
      'production-scrap',
      'manufacturing-completed',
      'operation-completed',
      'traceability-saved',
      'quality-inspection-saved',
      'adjustment'
    )
  );

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

  if p_state = 'completed'
    and v_order.completed_quantity + v_order.scrap_quantity < v_order.planned_quantity then
    raise exception 'The planned quantity has not been fully reported.';
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

create or replace function public.mes_quality_save_serial_inspection(
  p_organization_id uuid,
  p_order_id uuid,
  p_serial_number text,
  p_result text,
  p_event_payload jsonb default '{}'::jsonb
)
returns public.mes_quality_serial_inspections
language plpgsql
security invoker
as $$
declare
  v_order public.mes_production_orders%rowtype;
  v_inspection public.mes_quality_serial_inspections%rowtype;
  v_serial text;
  v_required_count integer;
  v_inspected_count integer;
  v_final_status text;
  v_order_completed boolean := false;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'Organization access denied.';
  end if;

  if p_result not in ('ok', 'approach', 'nok') then
    raise exception 'Unsupported Quality result: %', p_result;
  end if;

  v_serial = btrim(coalesce(p_serial_number, ''));

  select *
    into v_order
  from public.mes_production_orders
  where id = p_order_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Production order not found.';
  end if;

  if not exists (
    select 1
    from public.mes_production_serials serial
    where serial.production_order_id = v_order.id
      and lower(btrim(serial.serial_number)) = lower(v_serial)
      and serial.result = 'good'
      and serial.ready_for_quality
  ) then
    raise exception 'This serial number is not available for Quality inspection.';
  end if;

  insert into public.mes_quality_serial_inspections (
    organization_id,
    production_order_id,
    serial_number,
    result,
    inspected_at
  )
  values (
    p_organization_id,
    v_order.id,
    v_serial,
    p_result,
    now()
  )
  on conflict (production_order_id, serial_number)
  do update set
    result = excluded.result,
    inspected_by = auth.uid(),
    inspected_at = excluded.inspected_at
  returning * into v_inspection;

  select count(*)
    into v_required_count
  from public.mes_production_serials serial
  where serial.production_order_id = v_order.id
    and serial.result = 'good'
    and serial.ready_for_quality;

  select count(distinct serial.id)
    into v_inspected_count
  from public.mes_production_serials serial
  join public.mes_quality_serial_inspections inspection
    on inspection.production_order_id = serial.production_order_id
    and lower(btrim(inspection.serial_number)) = lower(btrim(serial.serial_number))
  where serial.production_order_id = v_order.id
    and serial.result = 'good'
    and serial.ready_for_quality;

  v_final_status = v_order.status;
  if v_order.status = 'waiting-inspection'
    and v_required_count > 0
    and v_inspected_count >= v_required_count then
    update public.mes_production_orders
    set status = 'completed'
    where id = v_order.id;
    v_final_status = 'completed';
    v_order_completed = true;
  end if;

  insert into public.mes_operator_terminal_events (
    organization_id,
    production_order_id,
    work_center_code,
    station_code,
    event_type,
    quantity,
    reason,
    comment,
    payload
  )
  values (
    p_organization_id,
    v_order.id,
    coalesce(nullif(v_order.assigned_work_center, ''), 'QUALITY'),
    coalesce(nullif(v_order.assigned_station, ''), 'QUALITY'),
    'quality-inspection-saved',
    1,
    upper(p_result),
    format('Quality inspection saved for serial %s.', v_serial),
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object(
      'source', 'quality',
      'serial_number', v_serial,
      'result', p_result,
      'order_status', v_final_status
    )
  );

  if v_order_completed then
    insert into public.mes_operator_terminal_events (
      organization_id,
      production_order_id,
      work_center_code,
      station_code,
      event_type,
      quantity,
      comment,
      payload
    )
    values (
      p_organization_id,
      v_order.id,
      coalesce(nullif(v_order.assigned_work_center, ''), 'QUALITY'),
      coalesce(nullif(v_order.assigned_station, ''), 'QUALITY'),
      'operation-completed',
      1,
      'All required Quality inspections are complete.',
      jsonb_build_object(
        'source', 'quality',
        'serial_number', v_serial,
        'order_status', 'completed'
      )
    );
  end if;

  return v_inspection;
end;
$$;

grant execute on function public.mes_quality_save_serial_inspection(uuid, uuid, text, text, jsonb) to authenticated;
