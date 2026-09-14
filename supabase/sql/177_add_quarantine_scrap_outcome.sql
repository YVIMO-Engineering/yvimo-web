-- A quarantine hold now has two possible outcomes instead of one.
--
-- Until now a held piece could only be released back into the normal manufacturing
-- flow. The other real outcome is that the piece is lost: the decision taken while
-- it was held is to scrap it. That scrap is Generated Scrap, exactly like a scrap
-- reported at the Operator Terminal (End of Life is declared during Production Order
-- intake and is never decided here), so it is written as a 'production-scrap' event
-- and the piece result becomes 'scrap'.

alter table public.mes_production_quarantine
  add column if not exists scrapped_at timestamptz,
  add column if not exists scrapped_by uuid references auth.users(id) on delete set null,
  add column if not exists scrap_reason text not null default '';

comment on column public.mes_production_quarantine.scrap_reason is
  'Operator Terminal scrap reason chosen when the held piece was scrapped from quarantine.';

alter table public.mes_production_quarantine
  drop constraint if exists mes_production_quarantine_status_check;

alter table public.mes_production_quarantine
  add constraint mes_production_quarantine_status_check
  check (status in ('open', 'released', 'scrapped'));

create or replace function public.mes_scrap_production_piece_from_quarantine(
  p_quarantine_id uuid,
  p_organization_id uuid,
  p_reason text,
  p_comment text default ''
)
returns public.mes_production_quarantine
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quarantine public.mes_production_quarantine%rowtype;
  v_serial public.mes_production_serials%rowtype;
  v_previous_result text;
  v_order public.mes_production_orders%rowtype;
  v_reception_item_id uuid;
  v_good_count integer;
  v_scrap_count integer;
  v_event_id uuid;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'Organization access denied.';
  end if;

  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception using errcode = '22023', message = 'A scrap reason is required.';
  end if;

  select * into v_quarantine
  from public.mes_production_quarantine
  where id = p_quarantine_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Quarantine record not found.';
  end if;

  if v_quarantine.status <> 'open' then
    raise exception using errcode = '22023', message = 'This quarantine hold was already closed.';
  end if;

  select * into v_serial
  from public.mes_production_serials
  where id = v_quarantine.production_serial_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Production piece not found.';
  end if;

  if v_serial.result = 'scrap' then
    raise exception using errcode = '22023', message = 'This piece is already scrapped.';
  end if;

  v_previous_result := v_serial.result;

  select * into v_order
  from public.mes_production_orders
  where id = v_quarantine.production_order_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Production order not found.';
  end if;

  -- The piece leaves quarantine with scrap as its outcome.
  update public.mes_production_quarantine
  set status = 'scrapped',
      scrapped_at = now(),
      scrapped_by = auth.uid(),
      scrap_reason = btrim(p_reason),
      release_notes = btrim(coalesce(p_comment, ''))
  where id = v_quarantine.id
  returning * into v_quarantine;

  update public.mes_production_serials
  set result = 'scrap',
      ready_for_quality = true,
      reported_at = coalesce(reported_at, now()),
      quarantined = false,
      quarantined_at = null
  where id = v_serial.id;

  -- A piece reported GOOD before the hold keeps its traceability capture, but the
  -- capture must stop claiming the piece was produced.
  if v_serial.traceability_id is not null then
    update public.mes_operator_terminal_traceability
    set payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{report_type}', '"scrap"'::jsonb, true),
        updated_at = now()
    where id = v_serial.traceability_id
      and organization_id = p_organization_id;
  end if;

  if v_previous_result = 'good' then
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
          comment = concat_ws(' ', nullif(comment, ''), '[Scrapped from quarantine; no longer counted as produced.]')
      where id = v_event_id;
    end if;

    -- A GOOD piece may already be following its sub-reception through coating and
    -- delivery. A scrapped piece ships nothing, so it stops gating that voucher.
    select item.id into v_reception_item_id
    from public.mes_customer_reception_items item
    where item.organization_id = p_organization_id
      and item.production_order_id = v_order.id
    limit 1;

    if v_reception_item_id is not null then
      delete from public.mes_customer_reception_serial_progress
      where reception_item_id = v_reception_item_id
        and production_serial_id = v_serial.id;
      perform public.recalculate_customer_reception_progress(v_reception_item_id);
    end if;
  end if;

  -- Order counters are rebuilt from the pieces themselves, so the move from GOOD to
  -- scrap (or from pending to scrap) always lands on the real numbers.
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
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  -- Generated Scrap is read from 'production-scrap' events, so the cost trackers see
  -- this piece the same way they see a scrap reported at the Operator Terminal.
  insert into public.mes_operator_terminal_events (
    organization_id, production_order_id, work_center_code, station_code,
    event_type, quantity, reason, comment, payload
  ) values (
    p_organization_id, v_order.id, v_order.assigned_work_center,
    coalesce(nullif(v_serial.assigned_station, ''), nullif(v_order.assigned_station, ''), 'UNASSIGNED'),
    'production-scrap', 1, btrim(p_reason),
    nullif(btrim(coalesce(p_comment, '')), ''),
    jsonb_build_object(
      'order_number', v_order.order_number,
      'part_number', v_order.part_number,
      'part_name', v_order.part_name,
      'client_name', v_order.client_name,
      'serial_number', v_quarantine.serial_number,
      'tool_id', v_quarantine.tool_id,
      'piece_sequence', v_quarantine.piece_sequence,
      'reported_total', v_good_count + v_scrap_count,
      'scrap_quantity', v_scrap_count,
      'scrap_source', 'quarantine',
      'previous_result', v_previous_result,
      'quarantine_id', v_quarantine.id,
      'scrapped_by', auth.uid()
    )
  );

  return v_quarantine;
end;
$$;

revoke all on function public.mes_scrap_production_piece_from_quarantine(uuid, uuid, text, text) from public;
grant execute on function public.mes_scrap_production_piece_from_quarantine(uuid, uuid, text, text) to authenticated;
