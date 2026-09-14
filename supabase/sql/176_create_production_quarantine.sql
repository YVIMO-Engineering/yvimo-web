-- Quarantine: an optional hold state for a single serialized piece.
--
-- The normal manufacturing flow is Reception -> Assign Orders -> Manufacturing ->
-- Quality Inspection -> Coating -> Waiting to Deliver -> Sent. A piece can be stuck
-- outside that flow for a reason that belongs to nobody in particular (a damaged
-- body found late, a missing customer drawing, a tool waiting for a decision).
-- Quarantine records that hold against the piece itself, keeps the reason and the
-- action to take next to it, and feeds the APS / Quarantine workspace.
--
-- The hold is deliberately non blocking: the piece keeps its production history and
-- its production order untouched, so releasing it from quarantine leaves no trace on
-- the manufacturing numbers.

alter table public.mes_production_serials
  add column if not exists quarantined boolean not null default false,
  add column if not exists quarantined_at timestamptz;

comment on column public.mes_production_serials.quarantined is
  'True while the piece is held in Quarantine (APS / Quarantine). Cleared when the piece is released back to the normal manufacturing flow.';
comment on column public.mes_production_serials.quarantined_at is
  'When the active Quarantine hold started. Null once the piece is released.';

create index if not exists mes_production_serials_quarantined_idx
  on public.mes_production_serials (organization_id, quarantined_at desc)
  where quarantined;

create table if not exists public.mes_production_quarantine (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  production_order_id uuid not null references public.mes_production_orders(id) on delete cascade,
  production_serial_id uuid not null references public.mes_production_serials(id) on delete cascade,
  piece_sequence integer not null,
  serial_number text not null default '',
  tool_id text not null default '',
  reason text not null default '',
  action_plan text not null default '',
  status text not null default 'open' check (status in ('open', 'released')),
  quarantined_at timestamptz not null default now(),
  quarantined_by uuid references auth.users(id) on delete set null default auth.uid(),
  released_at timestamptz,
  released_by uuid references auth.users(id) on delete set null,
  release_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mes_production_quarantine is
  'One row per Quarantine hold placed on a production piece from Production Order Details. reason and action_plan are edited from the APS / Quarantine workspace.';

-- A piece can be quarantined many times over its life, but only held once at a time.
create unique index if not exists mes_production_quarantine_open_serial_idx
  on public.mes_production_quarantine (production_serial_id)
  where status = 'open';

create index if not exists mes_production_quarantine_org_idx
  on public.mes_production_quarantine (organization_id, status, quarantined_at desc);

create index if not exists mes_production_quarantine_order_idx
  on public.mes_production_quarantine (production_order_id, status);

alter table public.mes_production_quarantine enable row level security;

drop policy if exists "Members can read production quarantine" on public.mes_production_quarantine;
create policy "Members can read production quarantine"
  on public.mes_production_quarantine
  for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create production quarantine" on public.mes_production_quarantine;
create policy "Members can create production quarantine"
  on public.mes_production_quarantine
  for insert
  with check (public.is_manufacturing_organization_member(organization_id));

-- The two comment boxes (reason and action to take) are edited straight from the
-- Quarantine workspace, so members update their own organization rows directly.
drop policy if exists "Members can update production quarantine" on public.mes_production_quarantine;
create policy "Members can update production quarantine"
  on public.mes_production_quarantine
  for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete production quarantine" on public.mes_production_quarantine;
create policy "Admins can delete production quarantine"
  on public.mes_production_quarantine
  for delete
  using (public.is_manufacturing_organization_admin(organization_id));

grant select, insert, update, delete on public.mes_production_quarantine to authenticated;

create or replace function public.touch_mes_production_quarantine()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mes_production_quarantine_touch on public.mes_production_quarantine;
create trigger mes_production_quarantine_touch
  before update on public.mes_production_quarantine
  for each row execute function public.touch_mes_production_quarantine();

-- Quarantine holds and releases are part of the piece history, so they are written
-- to the Operator Terminal event log the Traceability workspace already reads.
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
      'piece-rework-registered',
      'piece-quarantined', 'piece-quarantine-released'
    )
  );

create or replace function public.mes_quarantine_production_piece(
  p_serial_id uuid,
  p_organization_id uuid,
  p_reason text,
  p_action_plan text default ''
)
returns public.mes_production_quarantine
language plpgsql
security definer
set search_path = public
as $$
declare
  v_serial public.mes_production_serials%rowtype;
  v_order public.mes_production_orders%rowtype;
  v_quarantine public.mes_production_quarantine%rowtype;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'Organization access denied.';
  end if;

  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception using errcode = '22023', message = 'A quarantine reason is required.';
  end if;

  select * into v_serial
  from public.mes_production_serials
  where id = p_serial_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Production piece not found.';
  end if;

  if exists (
    select 1
    from public.mes_production_quarantine
    where production_serial_id = v_serial.id
      and status = 'open'
  ) then
    raise exception using errcode = '22023', message = 'This piece is already in quarantine.';
  end if;

  select * into v_order
  from public.mes_production_orders
  where id = v_serial.production_order_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Production order not found.';
  end if;

  update public.mes_production_serials
  set quarantined = true,
      quarantined_at = now()
  where id = v_serial.id;

  insert into public.mes_production_quarantine (
    organization_id, production_order_id, production_serial_id,
    piece_sequence, serial_number, tool_id, reason, action_plan
  ) values (
    p_organization_id, v_order.id, v_serial.id,
    v_serial.piece_sequence,
    coalesce(v_serial.serial_number, ''),
    coalesce(v_serial.tool_id, ''),
    btrim(p_reason),
    btrim(coalesce(p_action_plan, ''))
  )
  returning * into v_quarantine;

  insert into public.mes_operator_terminal_events (
    organization_id, production_order_id, work_center_code, station_code,
    event_type, quantity, reason, comment, payload
  ) values (
    p_organization_id, v_order.id, v_order.assigned_work_center,
    coalesce(nullif(v_serial.assigned_station, ''), nullif(v_order.assigned_station, ''), 'UNASSIGNED'),
    'piece-quarantined', 0, 'Piece sent to quarantine',
    btrim(p_reason),
    jsonb_build_object(
      'quarantine_id', v_quarantine.id,
      'order_number', v_order.order_number,
      'serial_number', v_serial.serial_number,
      'tool_id', v_serial.tool_id,
      'piece_sequence', v_serial.piece_sequence,
      'action_plan', btrim(coalesce(p_action_plan, '')),
      'quarantined_by', auth.uid()
    )
  );

  return v_quarantine;
end;
$$;

create or replace function public.mes_release_production_piece_from_quarantine(
  p_quarantine_id uuid,
  p_organization_id uuid,
  p_release_notes text default ''
)
returns public.mes_production_quarantine
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quarantine public.mes_production_quarantine%rowtype;
  v_serial public.mes_production_serials%rowtype;
  v_order public.mes_production_orders%rowtype;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'Organization access denied.';
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
    raise exception using errcode = '22023', message = 'This piece was already released from quarantine.';
  end if;

  update public.mes_production_quarantine
  set status = 'released',
      released_at = now(),
      released_by = auth.uid(),
      release_notes = btrim(coalesce(p_release_notes, ''))
  where id = v_quarantine.id
  returning * into v_quarantine;

  update public.mes_production_serials
  set quarantined = false,
      quarantined_at = null
  where id = v_quarantine.production_serial_id
  returning * into v_serial;

  select * into v_order
  from public.mes_production_orders
  where id = v_quarantine.production_order_id
    and organization_id = p_organization_id;

  insert into public.mes_operator_terminal_events (
    organization_id, production_order_id, work_center_code, station_code,
    event_type, quantity, reason, comment, payload
  ) values (
    p_organization_id, v_quarantine.production_order_id, v_order.assigned_work_center,
    coalesce(nullif(v_serial.assigned_station, ''), nullif(v_order.assigned_station, ''), 'UNASSIGNED'),
    'piece-quarantine-released', 0, 'Piece released from quarantine',
    btrim(coalesce(p_release_notes, '')),
    jsonb_build_object(
      'quarantine_id', v_quarantine.id,
      'order_number', v_order.order_number,
      'serial_number', v_quarantine.serial_number,
      'tool_id', v_quarantine.tool_id,
      'piece_sequence', v_quarantine.piece_sequence,
      'released_by', auth.uid()
    )
  );

  return v_quarantine;
end;
$$;

revoke all on function public.mes_quarantine_production_piece(uuid, uuid, text, text) from public;
grant execute on function public.mes_quarantine_production_piece(uuid, uuid, text, text) to authenticated;

revoke all on function public.mes_release_production_piece_from_quarantine(uuid, uuid, text) from public;
grant execute on function public.mes_release_production_piece_from_quarantine(uuid, uuid, text) to authenticated;

-- Stream quarantine changes so the APS workspace stays live.
alter table public.mes_production_quarantine replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mes_production_quarantine'
  ) then
    alter publication supabase_realtime
      add table public.mes_production_quarantine;
  end if;
end;
$$;
