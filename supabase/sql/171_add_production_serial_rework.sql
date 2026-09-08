-- Rework of individual serialized pieces.
--
-- A piece can be rejected at quality inspection, at coating, or right before it
-- ships. When that happens the piece is closed out of its original sub-reception
-- (it already counts as produced in its production order, exactly like a scrap)
-- and it must be reassigned to a production order that will actually rework it:
-- either a brand new RW- order or an order of the same customer still running.

alter table public.mes_customer_reception_serial_progress
  add column if not exists reworked_at timestamptz,
  add column if not exists reworked_by uuid references auth.users(id) on delete set null;

comment on column public.mes_customer_reception_serial_progress.reworked_at is
  'Set when the piece left this sub-reception to be reworked. Reworked rows no longer gate coating or delivery.';

alter table public.mes_customer_reception_items
  add column if not exists is_rework boolean not null default false,
  add column if not exists rework_source_serial_id uuid references public.mes_production_serials(id) on delete set null;

comment on column public.mes_customer_reception_items.is_rework is
  'True for the single-piece sub-reception opened to follow a reworked piece through coating and delivery.';

create table if not exists public.mes_production_serial_reworks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  reception_voucher_id uuid not null references public.mes_customer_reception_vouchers(id) on delete cascade,
  source_reception_item_id uuid not null references public.mes_customer_reception_items(id) on delete cascade,
  source_production_order_id uuid not null references public.mes_production_orders(id) on delete cascade,
  source_production_serial_id uuid not null references public.mes_production_serials(id) on delete cascade,
  detected_stage text not null check (detected_stage in ('quality-inspection', 'coating', 'pre-delivery', 'customer')),
  reason text not null check (length(btrim(reason)) > 0),
  assignment text not null check (assignment in ('new-order', 'existing-order')),
  rework_production_order_id uuid references public.mes_production_orders(id) on delete set null,
  rework_production_serial_id uuid references public.mes_production_serials(id) on delete set null,
  rework_reception_item_id uuid references public.mes_customer_reception_items(id) on delete set null,
  registered_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (source_reception_item_id, source_production_serial_id)
);

create index if not exists mes_production_serial_reworks_source_idx
  on public.mes_production_serial_reworks (source_production_order_id, source_production_serial_id);

create index if not exists mes_production_serial_reworks_target_idx
  on public.mes_production_serial_reworks (rework_production_order_id)
  where rework_production_order_id is not null;

alter table public.mes_production_serial_reworks enable row level security;

drop policy if exists "Members can read production serial reworks" on public.mes_production_serial_reworks;
create policy "Members can read production serial reworks"
  on public.mes_production_serial_reworks for select
  using (public.is_manufacturing_organization_member(organization_id));

grant select on public.mes_production_serial_reworks to authenticated;

alter table public.mes_operator_terminal_events
  drop constraint if exists mes_operator_terminal_events_event_type_check;

alter table public.mes_operator_terminal_events
  add constraint mes_operator_terminal_events_event_type_check
  check (
    event_type in (
      'job-started', 'job-resumed', 'job-paused',
      'downtime-started', 'downtime-ended',
      'production-good', 'production-scrap',
      'manufacturing-completed', 'operation-completed',
      'traceability-saved', 'quality-inspection-saved', 'quality-inspection-skipped',
      'measurement-corrected', 'adjustment',
      'inventory-received', 'inventory-consumed',
      'maintenance-started', 'maintenance-ended',
      'station-offline', 'station-online',
      'reception-created', 'coating-dispatched', 'coating-received', 'reception-sent',
      'piece-rework-registered'
    )
  );

-- Reworked pieces must stop gating their original sub-reception. When every
-- piece of a sub-reception has been reworked the sub-reception itself is closed,
-- otherwise it would keep its voucher open forever.
create or replace function public.recalculate_customer_reception_progress(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item public.mes_customer_reception_items;
  v_now timestamptz := now();
  v_total integer;
  v_active integer;
  v_pending_coating_sent integer;
  v_pending_coating_returned integer;
  v_pending_sent integer;
begin
  select * into v_item from public.mes_customer_reception_items where id = p_item_id for update;
  if not found then return; end if;

  select
    count(*),
    count(*) filter (where p.reworked_at is null),
    count(*) filter (where p.reworked_at is null and p.coating_sent_at is null),
    count(*) filter (where p.reworked_at is null and p.coating_returned_at is null),
    count(*) filter (where p.reworked_at is null and p.sent_at is null)
  into v_total, v_active, v_pending_coating_sent, v_pending_coating_returned, v_pending_sent
  from public.mes_customer_reception_serial_progress p
  where p.reception_item_id = v_item.id;

  -- Every piece went to rework: the sub-reception has nothing left to ship.
  if v_total > 0 and v_active = 0 then
    v_pending_coating_sent := 0;
    v_pending_coating_returned := 0;
    v_pending_sent := 0;
  elsif v_total = 0 then
    v_pending_coating_sent := 1;
    v_pending_coating_returned := 1;
    v_pending_sent := 1;
  end if;

  update public.mes_customer_reception_items
  set coating_sent_at = case when v_total > 0 and v_pending_coating_sent = 0 then coalesce(coating_sent_at, v_now) else null end,
      coating_returned_at = case when v_total > 0 and v_pending_coating_returned = 0 then coalesce(coating_returned_at, v_now) else null end,
      sent_at = case when v_total > 0 and v_pending_sent = 0 then coalesce(sent_at, v_now) else null end,
      updated_at = v_now
  where id = v_item.id;

  update public.mes_customer_reception_vouchers voucher
  set status = case
    when not exists (select 1 from public.mes_customer_reception_items i where i.reception_voucher_id = voucher.id and i.sent_at is null) then 'sent'
    when voucher.status = 'waiting-delivery' then 'waiting-delivery'
    when not exists (select 1 from public.mes_customer_reception_items i where i.reception_voucher_id = voucher.id and i.coating_returned_at is null) then 'waiting-delivery'
    else 'coating' end,
    updated_at = v_now
  where voucher.id = v_item.reception_voucher_id and voucher.status not in ('discrepancy');
end;
$$;

revoke all on function public.recalculate_customer_reception_progress(uuid) from public;

-- Coating and delivery must never touch a piece that was sent to rework.
create or replace function public.update_customer_reception_serial_progress(
  p_item_id uuid, p_organization_id uuid, p_action text, p_production_serial_id uuid default null
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_item public.mes_customer_reception_items;
  v_count integer;
  v_now timestamptz := now();
  v_order_status text;
  v_voucher_status text;
  v_serial_is_good boolean := false;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'You do not have access to this organization.';
  end if;
  if p_action not in ('coating-sent', 'coating-returned', 'sent') then
    raise exception using errcode = '22023', message = 'Invalid serial progress action.';
  end if;

  select * into v_item from public.mes_customer_reception_items
    where id = p_item_id and organization_id = p_organization_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Reception item was not found.';
  end if;

  select status into v_order_status from public.mes_production_orders
    where id = v_item.production_order_id and organization_id = p_organization_id;
  select status into v_voucher_status from public.mes_customer_reception_vouchers
    where id = v_item.reception_voucher_id and organization_id = p_organization_id;

  if p_production_serial_id is not null then
    select exists (
      select 1 from public.mes_production_serials serial
      where serial.id = p_production_serial_id
        and serial.production_order_id = v_item.production_order_id
        and serial.organization_id = p_organization_id
        and serial.result = 'good'
    ) into v_serial_is_good;
    if not v_serial_is_good then
      raise exception using errcode = '22023', message = 'Only a completed good piece from this production order can be processed.';
    end if;
    if exists (
      select 1 from public.mes_customer_reception_serial_progress p
      where p.reception_item_id = v_item.id
        and p.production_serial_id = p_production_serial_id
        and p.reworked_at is not null
    ) then
      raise exception using errcode = '22023', message = 'This piece was sent to rework and no longer belongs to this sub-reception.';
    end if;
  end if;

  if p_action = 'coating-sent'
    and p_production_serial_id is null
    and coalesce(v_order_status, '') <> 'completed' then
    raise exception using errcode = '22023', message = 'The full production order must be completed before all pieces can be sent to coating.';
  end if;

  insert into public.mes_customer_reception_serial_progress (organization_id, reception_item_id, production_serial_id)
  select p_organization_id, v_item.id, serial.id from public.mes_production_serials serial
  where serial.production_order_id = v_item.production_order_id and serial.result = 'good'
  on conflict (reception_item_id, production_serial_id) do nothing;

  if p_action = 'coating-sent' then
    update public.mes_customer_reception_serial_progress p set coating_sent_at = v_now, coating_sent_by = auth.uid(), updated_at = v_now
    where p.reception_item_id = v_item.id and p.coating_sent_at is null and p.reworked_at is null
      and (p_production_serial_id is null or p.production_serial_id = p_production_serial_id);
  elsif p_action = 'coating-returned' then
    update public.mes_customer_reception_serial_progress p set coating_returned_at = v_now, coating_returned_by = auth.uid(), updated_at = v_now
    where p.reception_item_id = v_item.id and p.coating_sent_at is not null and p.coating_returned_at is null and p.reworked_at is null
      and (p_production_serial_id is null or p.production_serial_id = p_production_serial_id);
  else
    update public.mes_customer_reception_serial_progress p set sent_at = v_now, sent_by = auth.uid(), updated_at = v_now
    where p.reception_item_id = v_item.id
      and (p.coating_returned_at is not null or v_voucher_status = 'waiting-delivery')
      and p.sent_at is null
      and p.reworked_at is null
      and (p_production_serial_id is null or p.production_serial_id = p_production_serial_id);
  end if;
  get diagnostics v_count = row_count;
  perform public.recalculate_customer_reception_progress(v_item.id);
  return v_count;
end;
$$;

revoke all on function public.update_customer_reception_serial_progress(uuid, uuid, text, uuid) from public;
grant execute on function public.update_customer_reception_serial_progress(uuid, uuid, text, uuid) to authenticated;

-- Everything the "Add new production order" form inherits from the rejected piece.
create or replace function public.get_production_serial_rework_prefill(
  p_organization_id uuid,
  p_reception_item_id uuid,
  p_production_serial_id uuid
)
returns table (
  customer_id uuid,
  client_name text,
  part_name text,
  piece_type text,
  priority text,
  assigned_work_center text,
  planned_shifts text[],
  manufacturing_type text,
  production_flow text,
  order_assigned_station text,
  quality_checks_enabled boolean,
  quality_checks text[],
  quality_check_limits jsonb,
  quality_measurement_unit text,
  tool_id text,
  serial_number text,
  assigned_station text,
  compatible_stations text[],
  before_notch numeric,
  before_tooth_length numeric,
  before_height numeric,
  stock_to_remove numeric,
  quotation_id uuid,
  legacy_price_id uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select
    source_order.customer_id,
    coalesce(source_order.client_name, ''),
    coalesce(source_order.part_name, ''),
    coalesce(source_order.piece_type, ''),
    coalesce(source_order.priority, 'normal'),
    coalesce(source_order.assigned_work_center, ''),
    coalesce(source_order.planned_shifts, '{}'::text[]),
    coalesce(source_order.manufacturing_type, 'multi-step'),
    coalesce(source_order.production_flow, ''),
    coalesce(source_order.assigned_station, ''),
    coalesce(source_order.quality_checks_enabled, false),
    coalesce(source_order.quality_checks, '{}'::text[]),
    coalesce(source_order.quality_check_limits, '{}'::jsonb),
    coalesce(source_order.quality_measurement_unit, 'microns'),
    coalesce(serial.tool_id, ''),
    coalesce(serial.serial_number, ''),
    coalesce(serial.assigned_station, ''),
    coalesce(serial.compatible_stations, '{}'::text[]),
    -- A rework starts from where the previous sharpening ended: the measurement
    -- taken after sharpening becomes the new before-sharpening measurement.
    serial.before_notch,
    coalesce(traceability.after_tooth_length, serial.before_tooth_length),
    coalesce(nullif(traceability.payload ->> 'after_height', '')::numeric, serial.before_height),
    serial.stock_to_remove,
    serial.quotation_id,
    serial.legacy_price_id
  from public.mes_customer_reception_items item
  join public.mes_production_orders source_order
    on source_order.id = item.production_order_id
   and source_order.organization_id = item.organization_id
  join public.mes_production_serials serial
    on serial.id = p_production_serial_id
   and serial.production_order_id = source_order.id
  left join lateral (
    select trace.after_tooth_length, trace.payload
    from public.mes_operator_terminal_traceability trace
    where trace.organization_id = source_order.organization_id
      and trace.production_order_id = source_order.id
      and (
        trace.id = serial.traceability_id
        or lower(btrim(trace.serial_number)) = lower(btrim(serial.serial_number))
      )
    order by (trace.id = serial.traceability_id) desc, trace.created_at desc
    limit 1
  ) traceability on true
  where item.id = p_reception_item_id
    and item.organization_id = p_organization_id
    and public.is_manufacturing_organization_member(p_organization_id);
$$;

revoke all on function public.get_production_serial_rework_prefill(uuid, uuid, uuid) from public;
grant execute on function public.get_production_serial_rework_prefill(uuid, uuid, uuid) to authenticated;

-- Shared validation and bookkeeping for both assignment paths.
create or replace function public.register_production_serial_rework_internal(
  p_organization_id uuid,
  p_reception_item_id uuid,
  p_production_serial_id uuid,
  p_detected_stage text,
  p_reason text
)
returns public.mes_customer_reception_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.mes_customer_reception_items;
  v_progress public.mes_customer_reception_serial_progress;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'You do not have access to this organization.';
  end if;
  if p_detected_stage not in ('quality-inspection', 'coating', 'pre-delivery', 'customer') then
    raise exception using errcode = '22023', message = 'Select where the rework was detected.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception using errcode = '22023', message = 'A rework reason is required.';
  end if;

  select * into v_item from public.mes_customer_reception_items
    where id = p_reception_item_id and organization_id = p_organization_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Reception item was not found.';
  end if;

  if not exists (
    select 1 from public.mes_production_serials serial
    where serial.id = p_production_serial_id
      and serial.production_order_id = v_item.production_order_id
      and serial.organization_id = p_organization_id
      and serial.result = 'good'
  ) then
    raise exception using errcode = '22023', message = 'Only a produced piece of this production order can be sent to rework.';
  end if;

  insert into public.mes_customer_reception_serial_progress (organization_id, reception_item_id, production_serial_id)
  values (p_organization_id, v_item.id, p_production_serial_id)
  on conflict (reception_item_id, production_serial_id) do nothing;

  select * into v_progress from public.mes_customer_reception_serial_progress
    where reception_item_id = v_item.id and production_serial_id = p_production_serial_id for update;

  if v_progress.reworked_at is not null then
    raise exception using errcode = '22023', message = 'This piece was already sent to rework.';
  end if;
  if v_progress.sent_at is not null then
    raise exception using errcode = '22023', message = 'This piece was already delivered to the customer and cannot be reworked from here.';
  end if;

  update public.mes_customer_reception_serial_progress
  set reworked_at = now(), reworked_by = auth.uid(), updated_at = now()
  where id = v_progress.id;

  return v_item;
end;
$$;

revoke all on function public.register_production_serial_rework_internal(uuid, uuid, uuid, text, text) from public;

create or replace function public.log_production_serial_rework(
  p_rework public.mes_production_serial_reworks,
  p_serial public.mes_production_serials,
  p_target_order public.mes_production_orders
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_order public.mes_production_orders;
begin
  select * into v_source_order from public.mes_production_orders where id = p_rework.source_production_order_id;

  insert into public.mes_operator_terminal_events (
    organization_id, production_order_id, work_center_code, station_code,
    event_type, quantity, reason, comment, payload
  ) values (
    p_rework.organization_id,
    p_rework.source_production_order_id,
    coalesce(nullif(v_source_order.assigned_work_center, ''), 'RECEPTIONS'),
    coalesce(nullif(p_serial.assigned_station, ''), nullif(v_source_order.assigned_station, ''), 'CLIENT-RECEPTIONS'),
    'piece-rework-registered',
    1,
    p_rework.detected_stage,
    p_rework.reason,
    jsonb_build_object(
      'rework_id', p_rework.id,
      'serial_number', p_serial.serial_number,
      'tool_id', p_serial.tool_id,
      'piece_sequence', p_serial.piece_sequence,
      'source_order_number', v_source_order.order_number,
      'rework_order_number', p_target_order.order_number,
      'assignment', p_rework.assignment
    )
  );
end;
$$;

revoke all on function public.log_production_serial_rework(public.mes_production_serial_reworks, public.mes_production_serials, public.mes_production_orders) from public;

-- Path 1: the piece moves to a brand new RW- order created from the receptions
-- screen. The order already exists; this opens its single-piece sub-reception in
-- the same voucher so coating and delivery keep working for that piece.
create or replace function public.assign_production_serial_rework_to_new_order(
  p_organization_id uuid,
  p_reception_item_id uuid,
  p_production_serial_id uuid,
  p_detected_stage text,
  p_reason text,
  p_rework_production_order_id uuid
)
returns public.mes_production_serial_reworks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.mes_customer_reception_items;
  v_serial public.mes_production_serials;
  v_order public.mes_production_orders;
  v_rework_item public.mes_customer_reception_items;
  v_rework public.mes_production_serial_reworks;
begin
  v_item := public.register_production_serial_rework_internal(
    p_organization_id, p_reception_item_id, p_production_serial_id, p_detected_stage, p_reason
  );

  select * into v_order from public.mes_production_orders
    where id = p_rework_production_order_id and organization_id = p_organization_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'The rework production order was not found.';
  end if;
  if exists (select 1 from public.mes_customer_reception_items where production_order_id = v_order.id) then
    raise exception using errcode = '22023', message = 'That production order is already linked to a sub-reception.';
  end if;

  select * into v_serial from public.mes_production_serials where id = p_production_serial_id;

  insert into public.mes_customer_reception_items (
    organization_id, reception_voucher_id, customer_id, quantity,
    production_order_id, production_order_number, is_rework, rework_source_serial_id
  ) values (
    p_organization_id, v_item.reception_voucher_id, v_item.customer_id, 1,
    v_order.id, v_order.order_number, true, p_production_serial_id
  )
  returning * into v_rework_item;

  insert into public.mes_production_serial_reworks (
    organization_id, reception_voucher_id, source_reception_item_id,
    source_production_order_id, source_production_serial_id,
    detected_stage, reason, assignment,
    rework_production_order_id, rework_reception_item_id
  ) values (
    p_organization_id, v_item.reception_voucher_id, v_item.id,
    v_item.production_order_id, p_production_serial_id,
    p_detected_stage, btrim(p_reason), 'new-order',
    v_order.id, v_rework_item.id
  )
  returning * into v_rework;

  perform public.log_production_serial_rework(v_rework, v_serial, v_order);
  perform public.recalculate_customer_reception_progress(v_item.id);

  -- A piece is back in production, so the voucher cannot stay parked in a
  -- delivery or closed state. Its total follows the sum of its sub-receptions.
  update public.mes_customer_reception_vouchers
  set status = case when status = 'discrepancy' then status else 'manufacturing' end,
      quantity_expected = quantity_expected + 1,
      updated_at = now()
  where id = v_item.reception_voucher_id
    and organization_id = p_organization_id;

  return v_rework;
end;
$$;

revoke all on function public.assign_production_serial_rework_to_new_order(uuid, uuid, uuid, text, text, uuid) from public;
grant execute on function public.assign_production_serial_rework_to_new_order(uuid, uuid, uuid, text, text, uuid) to authenticated;

-- Path 2: the piece joins a production order of the same customer that is still
-- running. It becomes one more planned piece of that order and follows that
-- order's own sub-reception through coating and delivery.
create or replace function public.assign_production_serial_rework_to_existing_order(
  p_organization_id uuid,
  p_reception_item_id uuid,
  p_production_serial_id uuid,
  p_detected_stage text,
  p_reason text,
  p_target_production_order_id uuid
)
returns public.mes_production_serial_reworks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.mes_customer_reception_items;
  v_serial public.mes_production_serials;
  v_target public.mes_production_orders;
  v_target_item public.mes_customer_reception_items;
  v_new_serial public.mes_production_serials;
  v_source_order public.mes_production_orders;
  v_rework public.mes_production_serial_reworks;
  v_sequence integer;
  v_stations text[];
  v_station text;
  v_after_tooth numeric;
  v_after_height numeric;
begin
  v_item := public.register_production_serial_rework_internal(
    p_organization_id, p_reception_item_id, p_production_serial_id, p_detected_stage, p_reason
  );

  select * into v_serial from public.mes_production_serials where id = p_production_serial_id;
  select * into v_source_order from public.mes_production_orders where id = v_item.production_order_id;

  select * into v_target from public.mes_production_orders
    where id = p_target_production_order_id and organization_id = p_organization_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'The target production order was not found.';
  end if;
  if v_target.id = v_item.production_order_id then
    raise exception using errcode = '22023', message = 'Select a production order other than the one that produced this piece.';
  end if;
  if v_target.customer_id is distinct from v_item.customer_id then
    raise exception using errcode = '22023', message = 'The target production order belongs to a different customer.';
  end if;
  if v_target.status not in ('planned', 'released', 'running', 'paused') then
    raise exception using errcode = '22023', message = 'Only a production order that is still in production can take a reworked piece.';
  end if;

  select * into v_target_item from public.mes_customer_reception_items
    where production_order_id = v_target.id and organization_id = p_organization_id
    order by created_at limit 1;
  if not found then
    raise exception using errcode = '22023', message = 'The target production order has no sub-reception, so the reworked piece could not be delivered.';
  end if;

  if exists (
    select 1 from public.mes_production_serials serial
    where serial.production_order_id = v_target.id
      and lower(btrim(serial.serial_number)) = lower(btrim(v_serial.serial_number))
  ) then
    raise exception using errcode = '23505',
      message = format('Serial number "%s" is already assigned within %s.', btrim(v_serial.serial_number), v_target.order_number);
  end if;

  select coalesce(max(piece_sequence), 0) + 1 into v_sequence
  from public.mes_production_serials where production_order_id = v_target.id;

  -- Stations only mean something inside their own work center: the piece keeps
  -- its previous stations when both orders share one, and otherwise falls back
  -- to the stations the target order already uses.
  if v_target.manufacturing_type = 'multi-step' then
    if v_source_order.assigned_work_center is not distinct from v_target.assigned_work_center then
      v_stations := coalesce(v_serial.compatible_stations, '{}'::text[]);
    end if;
    if v_stations is null or cardinality(v_stations) = 0 then
      select serial.compatible_stations into v_stations
      from public.mes_production_serials serial
      where serial.production_order_id = v_target.id
        and cardinality(serial.compatible_stations) > 0
      order by serial.piece_sequence
      limit 1;
    end if;
    v_stations := coalesce(v_stations, '{}'::text[]);
    v_station := v_stations[1];
  else
    v_stations := '{}'::text[];
    v_station := null;
  end if;

  select trace.after_tooth_length, nullif(trace.payload ->> 'after_height', '')::numeric
    into v_after_tooth, v_after_height
  from public.mes_operator_terminal_traceability trace
  where trace.organization_id = p_organization_id
    and trace.production_order_id = v_serial.production_order_id
    and (trace.id = v_serial.traceability_id or lower(btrim(trace.serial_number)) = lower(btrim(v_serial.serial_number)))
  order by (trace.id = v_serial.traceability_id) desc, trace.created_at desc
  limit 1;

  insert into public.mes_production_serials (
    organization_id, production_order_id, serial_number, piece_sequence, tool_id,
    assigned_station, compatible_stations,
    before_notch, before_tooth_length, before_height, stock_to_remove,
    quotation_id, legacy_price_id, verified_quotation_price,
    quotation_damage_inches, quotation_damage_match,
    result, ready_for_quality, reported_at
  ) values (
    p_organization_id, v_target.id, btrim(v_serial.serial_number), v_sequence, v_serial.tool_id,
    v_station, v_stations,
    v_serial.before_notch,
    coalesce(v_after_tooth, v_serial.before_tooth_length),
    coalesce(v_after_height, v_serial.before_height),
    v_serial.stock_to_remove,
    v_serial.quotation_id, v_serial.legacy_price_id, v_serial.verified_quotation_price,
    v_serial.quotation_damage_inches, v_serial.quotation_damage_match,
    null, false, null
  )
  returning * into v_new_serial;

  update public.mes_production_orders
  set planned_quantity = planned_quantity + 1,
      updated_at = now()
  where id = v_target.id;

  update public.mes_customer_reception_items
  set quantity = quantity + 1, updated_at = now()
  where id = v_target_item.id;

  update public.mes_customer_reception_vouchers
  set quantity_expected = quantity_expected + 1, updated_at = now()
  where id = v_target_item.reception_voucher_id
    and organization_id = p_organization_id;

  insert into public.mes_production_serial_reworks (
    organization_id, reception_voucher_id, source_reception_item_id,
    source_production_order_id, source_production_serial_id,
    detected_stage, reason, assignment,
    rework_production_order_id, rework_production_serial_id, rework_reception_item_id
  ) values (
    p_organization_id, v_item.reception_voucher_id, v_item.id,
    v_item.production_order_id, p_production_serial_id,
    p_detected_stage, btrim(p_reason), 'existing-order',
    v_target.id, v_new_serial.id, v_target_item.id
  )
  returning * into v_rework;

  perform public.log_production_serial_rework(v_rework, v_serial, v_target);
  perform public.recalculate_customer_reception_progress(v_item.id);
  perform public.recalculate_customer_reception_progress(v_target_item.id);

  update public.mes_customer_reception_vouchers
  set status = 'manufacturing', updated_at = now()
  where id in (v_item.reception_voucher_id, v_target_item.reception_voucher_id)
    and organization_id = p_organization_id
    and status not in ('discrepancy');

  return v_rework;
end;
$$;

revoke all on function public.assign_production_serial_rework_to_existing_order(uuid, uuid, uuid, text, text, uuid) from public;
grant execute on function public.assign_production_serial_rework_to_existing_order(uuid, uuid, uuid, text, text, uuid) to authenticated;

-- The customer portal must not keep a reworked piece waiting for a dispatch that
-- will never come; it is shown as in rework, pointing at the order that redoes it.
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
  delivered_at timestamptz,
  scrap_reason text,
  scrap_notes text,
  reworked_at timestamptz,
  rework_order_number text
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
    reception.sent_at,
    nullif(btrim(coalesce(scrap_event.reason, '')), ''),
    nullif(btrim(coalesce(scrap_event.comment, '')), ''),
    reception.reworked_at,
    rework_order.order_number
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
      progress.coating_returned_at, progress.sent_at, progress.reworked_at
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
  left join lateral (
    select target_order.order_number
    from public.mes_production_serial_reworks rework
    join public.mes_production_orders target_order
      on target_order.id = rework.rework_production_order_id
    where rework.source_production_serial_id = serial.id
    order by rework.created_at desc
    limit 1
  ) rework_order on true
  left join lateral (
    select event.reason, event.comment
    from public.mes_operator_terminal_events event
    where event.organization_id = production_order.organization_id
      and event.production_order_id = production_order.id
      and event.event_type = 'production-scrap'
      and (
        lower(btrim(coalesce(event.payload ->> 'serial_number', ''))) = lower(btrim(coalesce(serial.serial_number, '')))
        or nullif(event.payload ->> 'piece_sequence', '') = serial.piece_sequence::text
      )
    order by
      (lower(btrim(coalesce(event.payload ->> 'serial_number', ''))) = lower(btrim(coalesce(serial.serial_number, '')))) desc,
      event.created_at desc
    limit 1
  ) scrap_event on serial.result = 'scrap'
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
