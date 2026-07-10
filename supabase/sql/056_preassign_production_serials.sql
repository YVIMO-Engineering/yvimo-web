alter table public.mes_production_serials
  add column if not exists tool_id text;

alter table public.mes_production_serials
  alter column result drop not null;

alter table public.mes_production_serials
  alter column reported_at drop not null;

do $$
declare
  v_constraint_name text;
begin
  select conname
    into v_constraint_name
  from pg_constraint
  where conrelid = 'public.mes_production_serials'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%result%'
    and pg_get_constraintdef(oid) like '%good%'
    and pg_get_constraintdef(oid) like '%scrap%'
  limit 1;

  if v_constraint_name is not null then
    execute format('alter table public.mes_production_serials drop constraint %I', v_constraint_name);
  end if;
end;
$$;

alter table public.mes_production_serials
  add constraint mes_production_serials_result_check
  check (result is null or result in ('good', 'scrap'));

drop policy if exists "Members can update MES production serials" on public.mes_production_serials;
create policy "Members can update MES production serials"
  on public.mes_production_serials
  for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

grant update on public.mes_production_serials to authenticated;

create or replace function public.mes_operator_report_serialized_production(
  p_order_id uuid,
  p_organization_id uuid,
  p_station_code text,
  p_serial_number text,
  p_result text,
  p_reason text default null,
  p_comment text default null,
  p_shift text default null,
  p_traceability jsonb default '{}'::jsonb
)
returns public.mes_production_orders
language plpgsql
security invoker
as $$
declare
  v_order public.mes_production_orders%rowtype;
  v_serial text;
  v_station_code text;
  v_piece_sequence integer;
  v_tool_id text;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'Organization access denied.';
  end if;

  v_serial = btrim(coalesce(p_serial_number, ''));
  if v_serial = '' then
    raise exception using errcode = '22023', message = 'A serial number is required.';
  end if;

  if p_result not in ('good', 'scrap') then
    raise exception using errcode = '22023', message = 'Unsupported production result.';
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

  v_piece_sequence = coalesce(nullif(p_traceability -> 'payload' ->> 'piece_sequence', '')::integer, v_order.completed_quantity + v_order.scrap_quantity + 1);
  if v_piece_sequence > v_order.planned_quantity then
    raise exception using errcode = '22023', message = 'The planned quantity has already been reported.';
  end if;

  insert into public.mes_production_serials (
    organization_id,
    production_order_id,
    serial_number,
    piece_sequence,
    tool_id,
    result,
    ready_for_quality
  )
  values (
    p_organization_id,
    v_order.id,
    v_serial,
    v_piece_sequence,
    nullif(p_traceability ->> 'tool_id', ''),
    p_result,
    true
  )
  on conflict (production_order_id, piece_sequence)
  do update set
    serial_number = excluded.serial_number,
    tool_id = coalesce(excluded.tool_id, public.mes_production_serials.tool_id),
    result = excluded.result,
    ready_for_quality = true,
    reported_at = now()
  where public.mes_production_serials.result is null
  returning tool_id into v_tool_id;

  if not found then
    raise exception using errcode = '23505', message = format('Part %s has already been reported within this work order.', v_piece_sequence);
  end if;

  update public.mes_production_orders
  set completed_quantity = completed_quantity + case when p_result = 'good' then 1 else 0 end,
      scrap_quantity = scrap_quantity + case when p_result = 'scrap' then 1 else 0 end,
      status = case when status = 'completed' then 'completed' else 'running' end
  where id = v_order.id
  returning * into v_order;

  v_station_code = coalesce(nullif(p_station_code, ''), v_order.assigned_station);

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
    case when p_result = 'good' then 'production-good' else 'production-scrap' end,
    1,
    case when p_result = 'scrap' then p_reason else null end,
    p_comment,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'part_number', v_order.part_number,
      'part_name', v_order.part_name,
      'serial_number', v_serial,
      'tool_id', v_tool_id,
      'piece_sequence', v_piece_sequence,
      'reported_total', v_order.completed_quantity + v_order.scrap_quantity,
      'scrap_quantity', v_order.scrap_quantity,
      'shift', p_shift
    )
  );

  perform public.mes_operator_save_traceability(
    v_order.id,
    p_organization_id,
    v_station_code,
    coalesce(nullif(p_traceability ->> 'template_id', ''), 'sharpening'),
    nullif(p_traceability ->> 'part_label', ''),
    coalesce(nullif(p_traceability ->> 'tool_id', ''), v_tool_id),
    v_serial,
    coalesce(nullif(p_traceability ->> 'dimensions_unit', ''), 'in'),
    nullif(p_traceability ->> 'before_notch', '')::numeric,
    nullif(p_traceability ->> 'before_tooth_length', '')::numeric,
    array(select jsonb_array_elements_text(coalesce(p_traceability -> 'damage_codes', '[]'::jsonb))),
    nullif(p_traceability ->> 'damage_image_url', ''),
    nullif(p_traceability ->> 'stock_to_remove', '')::numeric,
    nullif(p_traceability ->> 'after_tooth_length', '')::numeric,
    coalesce(p_traceability -> 'payload', '{}'::jsonb)
  );

  update public.mes_work_center_stations
  set current_job = v_order.order_number,
      status = 'running',
      last_event = case when p_result = 'scrap' then 'Scrap reported' else 'Production reported' end
  where organization_id = p_organization_id
    and code = v_station_code;

  return v_order;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = format('Serial number "%s" is already assigned within this work order.', v_serial);
end;
$$;

grant execute on function public.mes_operator_report_serialized_production(uuid, uuid, text, text, text, text, text, text, jsonb) to authenticated;
