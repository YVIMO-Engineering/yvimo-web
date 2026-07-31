create or replace function public.admin_release_mes_production_piece(
  p_serial_id uuid,
  p_organization_id uuid,
  p_confirmation_code text
)
returns public.mes_production_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_serial public.mes_production_serials%rowtype;
  v_order public.mes_production_orders%rowtype;
  v_good_count integer;
  v_scrap_count integer;
  v_event_id uuid;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'Organization access denied.';
  end if;

  if coalesce(p_confirmation_code, '') <> '1590' then
    raise exception using errcode = '22023', message = 'Invalid confirmation code.';
  end if;

  select * into v_serial
  from public.mes_production_serials
  where id = p_serial_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Production piece not found.';
  end if;

  if v_serial.result <> 'good' then
    raise exception using errcode = '22023', message = 'Only a completed GOOD piece can be released.';
  end if;

  select * into v_order
  from public.mes_production_orders
  where id = v_serial.production_order_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Production order not found.';
  end if;

  if exists (
    select 1
    from public.mes_quality_serial_inspections inspection
    where inspection.organization_id = p_organization_id
      and inspection.production_order_id = v_order.id
      and lower(btrim(inspection.serial_number)) = lower(btrim(v_serial.serial_number))
  ) then
    raise exception using errcode = '22023', message = 'This piece already has a Quality Inspection and cannot be released.';
  end if;

  if v_serial.traceability_id is not null then
    update public.mes_operator_terminal_traceability
    set payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{report_type}', '"reverted"'::jsonb, true),
        updated_at = now()
    where id = v_serial.traceability_id
      and organization_id = p_organization_id;
  end if;

  update public.mes_production_serials
  set result = null,
      ready_for_quality = false,
      reported_at = null,
      traceability_id = null
  where id = v_serial.id;

  select
    count(*) filter (where result = 'good'),
    count(*) filter (where result = 'scrap')
  into v_good_count, v_scrap_count
  from public.mes_production_serials
  where organization_id = p_organization_id
    and production_order_id = v_order.id;

  update public.mes_production_orders
  set completed_quantity = v_good_count,
      scrap_quantity = v_scrap_count,
      status = case
        when status in ('completed', 'waiting-inspection') then 'paused'
        else status
      end,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  select event.id into v_event_id
  from public.mes_operator_terminal_events event
  where event.organization_id = p_organization_id
    and event.production_order_id = v_order.id
    and event.event_type = 'production-good'
    and event.quantity > 0
    and (
      nullif(event.payload ->> 'piece_sequence', '')::integer = v_serial.piece_sequence
      or lower(btrim(event.payload ->> 'serial_number')) = lower(btrim(v_serial.serial_number))
    )
  order by event.created_at desc
  limit 1;

  if v_event_id is not null then
    update public.mes_operator_terminal_events
    set quantity = 0,
        comment = concat_ws(' ', nullif(comment, ''), '[Administratively released; no longer counted as produced.]')
    where id = v_event_id;
  end if;

  insert into public.mes_operator_terminal_events (
    organization_id, production_order_id, work_center_code, station_code,
    event_type, quantity, reason, comment, payload
  ) values (
    p_organization_id, v_order.id, v_order.assigned_work_center,
    coalesce(nullif(v_serial.assigned_station, ''), nullif(v_order.assigned_station, ''), 'UNASSIGNED'),
    'adjustment', -1, 'Production piece released',
    'GOOD production result reverted through Production Order Details.',
    jsonb_build_object(
      'adjustment_type', 'production-good-reverted',
      'order_number', v_order.order_number,
      'serial_number', v_serial.serial_number,
      'tool_id', v_serial.tool_id,
      'piece_sequence', v_serial.piece_sequence,
      'released_by', auth.uid()
    )
  );

  return v_order;
end;
$$;

revoke all on function public.admin_release_mes_production_piece(uuid, uuid, text) from public;
grant execute on function public.admin_release_mes_production_piece(uuid, uuid, text) to authenticated;
