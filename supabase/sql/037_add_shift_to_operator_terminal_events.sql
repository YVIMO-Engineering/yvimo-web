create or replace function public.mes_operator_report_production(
  p_order_id uuid,
  p_organization_id uuid,
  p_station_code text,
  p_good_delta integer default 0,
  p_scrap_delta integer default 0,
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
  v_next_completed integer;
  v_next_scrap integer;
  v_station_code text;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'Organization access denied.';
  end if;

  if p_good_delta < 0 or p_scrap_delta < 0 then
    raise exception 'Production deltas must be positive.';
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

  v_station_code = coalesce(nullif(p_station_code, ''), v_order.assigned_station);
  v_next_completed = least(v_order.planned_quantity, v_order.completed_quantity + p_good_delta);
  v_next_scrap = least(v_order.planned_quantity, v_order.scrap_quantity + p_scrap_delta);

  update public.mes_production_orders
  set completed_quantity = v_next_completed,
      scrap_quantity = v_next_scrap,
      status = case when v_order.status = 'completed' then 'completed' else 'running' end
  where id = v_order.id
  returning * into v_order;

  if p_good_delta > 0 then
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
      v_order.assigned_work_center,
      v_station_code,
      'production-good',
      p_good_delta,
      p_comment,
      jsonb_build_object('shift', p_shift)
    );
  end if;

  if p_scrap_delta > 0 then
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
      v_order.assigned_work_center,
      v_station_code,
      'production-scrap',
      p_scrap_delta,
      p_reason,
      p_comment,
      jsonb_build_object(
        'order_number', v_order.order_number,
        'part_number', v_order.part_number,
        'part_name', v_order.part_name,
        'reported_total', v_order.completed_quantity + v_order.scrap_quantity,
        'scrap_quantity', v_order.scrap_quantity,
        'shift', p_shift
      )
    );
  end if;

  update public.mes_work_center_stations
  set current_job = v_order.order_number,
      status = case when v_order.status = 'completed' then 'idle' else 'running' end,
      last_event = case
        when p_scrap_delta > 0 then 'Scrap reported'
        when p_good_delta > 0 then 'Production reported'
        else last_event
      end
  where organization_id = p_organization_id
    and code = v_station_code;

  return v_order;
end;
$$;

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

  v_station_code = coalesce(nullif(p_station_code, ''), v_order.assigned_station);
  v_previous_status = v_order.status;

  update public.mes_production_orders
  set status = case when p_state = 'down' then 'paused' else p_state end
  where id = v_order.id
  returning * into v_order;

  v_event_type = case
    when p_state = 'running' and v_previous_status in ('paused', 'running') then 'job-resumed'
    when p_state = 'running' then 'job-started'
    when p_state = 'paused' then 'job-paused'
    when p_state = 'down' then 'downtime-started'
    when p_state = 'completed' then 'operation-completed'
    else 'job-resumed'
  end;

  v_station_status = case
    when p_state = 'down' then 'down'
    when p_state = 'paused' then 'idle'
    when p_state = 'completed' then 'idle'
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
    jsonb_build_object('shift', p_shift)
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
  set current_job = case when p_state in ('completed') then null else v_order.order_number end,
      status = v_station_status,
      last_event = case
        when p_state = 'running' then 'Job running'
        when p_state = 'paused' then 'Job paused'
        when p_state = 'down' then 'Downtime reported'
        when p_state = 'completed' then 'Operation completed'
        else last_event
      end
  where organization_id = p_organization_id
    and code = v_station_code;

  return v_order;
end;
$$;

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
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'Organization access denied.';
  end if;

  select *
    into v_order
  from public.mes_production_orders
  where id = p_order_id
    and organization_id = p_organization_id
    and manufacturing_type = 'single-operation'
    and status in ('released', 'running', 'paused')
  for update;

  if not found then
    raise exception 'Production order not found.';
  end if;

  v_station_code = coalesce(nullif(p_station_code, ''), v_order.assigned_station);

  update public.mes_production_orders
  set status = 'paused'
  where organization_id = p_organization_id
    and id <> v_order.id
    and manufacturing_type = 'single-operation'
    and assigned_work_center = v_order.assigned_work_center
    and assigned_station = v_station_code
    and status = 'running';

  update public.mes_production_orders
  set status = 'running'
  where id = v_order.id
  returning * into v_order;

  insert into public.mes_operator_terminal_events (
    organization_id,
    production_order_id,
    work_center_code,
    station_code,
    event_type,
    comment,
    payload
  )
  values (
    p_organization_id,
    v_order.id,
    v_order.assigned_work_center,
    v_station_code,
    'job-resumed',
    p_comment,
    jsonb_build_object('action', 'active-order-switch', 'shift', p_shift)
  );

  update public.mes_work_center_stations
  set current_job = v_order.order_number,
      status = 'running',
      last_event = 'Active order changed'
  where organization_id = p_organization_id
    and code = v_station_code;

  return v_order;
end;
$$;

create or replace function public.mes_operator_save_traceability(
  p_order_id uuid,
  p_organization_id uuid,
  p_station_code text,
  p_template_id text,
  p_part_label text default null,
  p_tool_id text default null,
  p_serial_number text default null,
  p_dimensions_unit text default 'in',
  p_before_notch numeric default null,
  p_before_tooth_length numeric default null,
  p_damage_codes text[] default '{}',
  p_damage_image_url text default null,
  p_stock_to_remove numeric default null,
  p_after_tooth_length numeric default null,
  p_payload jsonb default '{}'::jsonb
)
returns public.mes_operator_terminal_traceability
language plpgsql
security invoker
as $$
declare
  v_order public.mes_production_orders%rowtype;
  v_capture public.mes_operator_terminal_traceability%rowtype;
  v_station_code text;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'Organization access denied.';
  end if;

  select *
    into v_order
  from public.mes_production_orders
  where id = p_order_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Production order not found.';
  end if;

  v_station_code = coalesce(nullif(p_station_code, ''), v_order.assigned_station);

  insert into public.mes_operator_terminal_traceability (
    organization_id,
    production_order_id,
    work_center_code,
    station_code,
    template_id,
    part_label,
    tool_id,
    serial_number,
    dimensions_unit,
    before_notch,
    before_tooth_length,
    damage_codes,
    damage_image_url,
    stock_to_remove,
    after_tooth_length,
    payload
  )
  values (
    p_organization_id,
    v_order.id,
    v_order.assigned_work_center,
    v_station_code,
    coalesce(nullif(p_template_id, ''), 'sharpening'),
    p_part_label,
    p_tool_id,
    p_serial_number,
    coalesce(nullif(p_dimensions_unit, ''), 'in'),
    p_before_notch,
    p_before_tooth_length,
    coalesce(p_damage_codes, '{}'),
    p_damage_image_url,
    p_stock_to_remove,
    p_after_tooth_length,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning * into v_capture;

  insert into public.mes_operator_terminal_events (
    organization_id,
    production_order_id,
    work_center_code,
    station_code,
    event_type,
    payload
  )
  values (
    p_organization_id,
    v_order.id,
    v_order.assigned_work_center,
    v_station_code,
    'traceability-saved',
    jsonb_build_object('traceability_id', v_capture.id, 'shift', p_payload ->> 'shift')
  );

  return v_capture;
end;
$$;

grant execute on function public.mes_operator_report_production(uuid, uuid, text, integer, integer, text, text, text) to authenticated;
grant execute on function public.mes_operator_set_state(uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.mes_operator_switch_active_order(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.mes_operator_save_traceability(uuid, uuid, text, text, text, text, text, text, numeric, numeric, text[], text, numeric, numeric, jsonb) to authenticated;
