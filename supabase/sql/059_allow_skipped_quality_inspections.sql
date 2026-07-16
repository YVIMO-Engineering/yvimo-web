alter table public.mes_quality_serial_inspections
  drop constraint if exists mes_quality_serial_inspections_result_check;

alter table public.mes_quality_serial_inspections
  add constraint mes_quality_serial_inspections_result_check
  check (result in ('ok', 'approach', 'nok', 'skipped'));

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
      'quality-inspection-skipped',
      'measurement-corrected',
      'adjustment'
    )
  );

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

  if p_result not in ('ok', 'approach', 'nok', 'skipped') then
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
    case
      when p_result = 'skipped' then 'quality-inspection-skipped'
      else 'quality-inspection-saved'
    end,
    1,
    upper(p_result),
    case
      when p_result = 'skipped' then format('Quality inspection skipped for serial %s.', v_serial)
      else format('Quality inspection saved for serial %s.', v_serial)
    end,
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
