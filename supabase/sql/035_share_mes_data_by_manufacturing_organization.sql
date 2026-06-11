alter table public.profiles
add column if not exists avatar_url text;

drop policy if exists "Organization members can read member profiles" on public.profiles;
create policy "Organization members can read member profiles"
on public.profiles
for select
using (
  auth.uid() = id
  or exists (
    select 1
    from public.manufacturing_organization_members viewer
    join public.manufacturing_organization_members subject
      on subject.organization_id = viewer.organization_id
    where viewer.user_id = auth.uid()
      and subject.user_id = profiles.id
  )
);

alter table public.manufacturing_organization_members
drop constraint if exists manufacturing_organization_members_role_check;

alter table public.manufacturing_organization_members
add constraint manufacturing_organization_members_role_check
check (role in ('Owner', 'Admin', 'Operator', 'Viewer', 'Supplier'));

alter table public.manufacturing_organization_invites
drop constraint if exists manufacturing_organization_invites_default_role_check;

alter table public.manufacturing_organization_invites
add constraint manufacturing_organization_invites_default_role_check
check (default_role in ('Admin', 'Operator', 'Viewer', 'Supplier'));

alter table public.mes_production_orders
add column if not exists organization_id uuid references public.manufacturing_organizations(id) on delete cascade;

alter table public.mes_work_centers
add column if not exists organization_id uuid references public.manufacturing_organizations(id) on delete cascade;

alter table public.mes_work_center_stations
add column if not exists organization_id uuid references public.manufacturing_organizations(id) on delete cascade;

alter table public.mes_operator_terminal_events
add column if not exists organization_id uuid references public.manufacturing_organizations(id) on delete cascade;

alter table public.mes_operator_terminal_downtime
add column if not exists organization_id uuid references public.manufacturing_organizations(id) on delete cascade;

alter table public.mes_operator_terminal_traceability
add column if not exists organization_id uuid references public.manufacturing_organizations(id) on delete cascade;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mes_operator_terminal_traceability'
  ) then
    alter publication supabase_realtime add table public.mes_operator_terminal_traceability;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mes_operator_terminal_events'
  ) then
    alter publication supabase_realtime add table public.mes_operator_terminal_events;
  end if;
end;
$$;

update public.mes_production_orders target
set organization_id = member.organization_id
from public.manufacturing_organization_members member
where target.organization_id is null
  and target.user_id = member.user_id
  and member.created_at = (
    select min(inner_member.created_at)
    from public.manufacturing_organization_members inner_member
    where inner_member.user_id = target.user_id
  );

update public.mes_work_centers target
set organization_id = member.organization_id
from public.manufacturing_organization_members member
where target.organization_id is null
  and target.user_id = member.user_id
  and member.created_at = (
    select min(inner_member.created_at)
    from public.manufacturing_organization_members inner_member
    where inner_member.user_id = target.user_id
  );

update public.mes_work_center_stations station
set organization_id = work_center.organization_id
from public.mes_work_centers work_center
where station.organization_id is null
  and station.work_center_id = work_center.id;

update public.mes_operator_terminal_events event
set organization_id = production_order.organization_id
from public.mes_production_orders production_order
where event.organization_id is null
  and event.production_order_id = production_order.id;

update public.mes_operator_terminal_downtime downtime
set organization_id = production_order.organization_id
from public.mes_production_orders production_order
where downtime.organization_id is null
  and downtime.production_order_id = production_order.id;

update public.mes_operator_terminal_traceability capture
set organization_id = production_order.organization_id
from public.mes_production_orders production_order
where capture.organization_id is null
  and capture.production_order_id = production_order.id;

alter table public.mes_production_orders
drop constraint if exists mes_production_orders_user_id_order_number_key;

alter table public.mes_work_centers
drop constraint if exists mes_work_centers_user_id_code_key;

alter table public.mes_work_center_stations
drop constraint if exists mes_work_center_stations_user_id_work_center_id_code_key;

create index if not exists mes_production_orders_organization_due_date_idx
  on public.mes_production_orders (organization_id, due_date);

create index if not exists mes_production_orders_organization_status_idx
  on public.mes_production_orders (organization_id, status);

create unique index if not exists mes_production_orders_organization_order_number_uidx
  on public.mes_production_orders (organization_id, order_number)
  where organization_id is not null;

create index if not exists mes_work_centers_organization_code_idx
  on public.mes_work_centers (organization_id, code);

create unique index if not exists mes_work_centers_organization_code_uidx
  on public.mes_work_centers (organization_id, code)
  where organization_id is not null;

create index if not exists mes_work_center_stations_organization_work_center_idx
  on public.mes_work_center_stations (organization_id, work_center_id);

create unique index if not exists mes_work_center_stations_organization_code_uidx
  on public.mes_work_center_stations (organization_id, work_center_id, code)
  where organization_id is not null;

create index if not exists mes_operator_events_organization_order_idx
  on public.mes_operator_terminal_events (organization_id, production_order_id, created_at desc);

create index if not exists mes_operator_events_organization_station_idx
  on public.mes_operator_terminal_events (organization_id, work_center_code, station_code, created_at desc);

create index if not exists mes_operator_downtime_organization_station_idx
  on public.mes_operator_terminal_downtime (organization_id, work_center_code, station_code, started_at desc);

create index if not exists mes_operator_traceability_organization_order_idx
  on public.mes_operator_terminal_traceability (organization_id, production_order_id, created_at desc);

drop policy if exists "Users can read their own MES production orders" on public.mes_production_orders;
drop policy if exists "Users can create their own MES production orders" on public.mes_production_orders;
drop policy if exists "Users can update their own MES production orders" on public.mes_production_orders;
drop policy if exists "Users can delete their own MES production orders" on public.mes_production_orders;

drop policy if exists "Members can read organization MES production orders" on public.mes_production_orders;
create policy "Members can read organization MES production orders"
  on public.mes_production_orders
  for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create organization MES production orders" on public.mes_production_orders;
create policy "Members can create organization MES production orders"
  on public.mes_production_orders
  for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update organization MES production orders" on public.mes_production_orders;
create policy "Members can update organization MES production orders"
  on public.mes_production_orders
  for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete organization MES production orders" on public.mes_production_orders;
create policy "Admins can delete organization MES production orders"
  on public.mes_production_orders
  for delete
  using (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Users can read their own MES work centers" on public.mes_work_centers;
drop policy if exists "Users can create their own MES work centers" on public.mes_work_centers;
drop policy if exists "Users can update their own MES work centers" on public.mes_work_centers;
drop policy if exists "Users can delete their own MES work centers" on public.mes_work_centers;

drop policy if exists "Members can read organization MES work centers" on public.mes_work_centers;
create policy "Members can read organization MES work centers"
  on public.mes_work_centers
  for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create organization MES work centers" on public.mes_work_centers;
create policy "Members can create organization MES work centers"
  on public.mes_work_centers
  for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update organization MES work centers" on public.mes_work_centers;
create policy "Members can update organization MES work centers"
  on public.mes_work_centers
  for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete organization MES work centers" on public.mes_work_centers;
create policy "Admins can delete organization MES work centers"
  on public.mes_work_centers
  for delete
  using (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Users can read their own MES work center stations" on public.mes_work_center_stations;
drop policy if exists "Users can create their own MES work center stations" on public.mes_work_center_stations;
drop policy if exists "Users can update their own MES work center stations" on public.mes_work_center_stations;
drop policy if exists "Users can delete their own MES work center stations" on public.mes_work_center_stations;

drop policy if exists "Members can read organization MES work center stations" on public.mes_work_center_stations;
create policy "Members can read organization MES work center stations"
  on public.mes_work_center_stations
  for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create organization MES work center stations" on public.mes_work_center_stations;
create policy "Members can create organization MES work center stations"
  on public.mes_work_center_stations
  for insert
  with check (
    public.is_manufacturing_organization_member(organization_id)
    and exists (
      select 1
      from public.mes_work_centers work_center
      where work_center.id = work_center_id
        and work_center.organization_id = mes_work_center_stations.organization_id
    )
  );

drop policy if exists "Members can update organization MES work center stations" on public.mes_work_center_stations;
create policy "Members can update organization MES work center stations"
  on public.mes_work_center_stations
  for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete organization MES work center stations" on public.mes_work_center_stations;
create policy "Admins can delete organization MES work center stations"
  on public.mes_work_center_stations
  for delete
  using (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Users can read their own operator terminal events" on public.mes_operator_terminal_events;
drop policy if exists "Users can create their own operator terminal events" on public.mes_operator_terminal_events;
drop policy if exists "Users can update their own operator terminal events" on public.mes_operator_terminal_events;
drop policy if exists "Users can delete their own operator terminal events" on public.mes_operator_terminal_events;

drop policy if exists "Members can read organization operator terminal events" on public.mes_operator_terminal_events;
create policy "Members can read organization operator terminal events"
  on public.mes_operator_terminal_events
  for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create organization operator terminal events" on public.mes_operator_terminal_events;
create policy "Members can create organization operator terminal events"
  on public.mes_operator_terminal_events
  for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update organization operator terminal events" on public.mes_operator_terminal_events;
create policy "Members can update organization operator terminal events"
  on public.mes_operator_terminal_events
  for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete organization operator terminal events" on public.mes_operator_terminal_events;
create policy "Admins can delete organization operator terminal events"
  on public.mes_operator_terminal_events
  for delete
  using (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Users can read their own operator downtime" on public.mes_operator_terminal_downtime;
drop policy if exists "Users can create their own operator downtime" on public.mes_operator_terminal_downtime;
drop policy if exists "Users can update their own operator downtime" on public.mes_operator_terminal_downtime;
drop policy if exists "Users can delete their own operator downtime" on public.mes_operator_terminal_downtime;

drop policy if exists "Members can read organization operator downtime" on public.mes_operator_terminal_downtime;
create policy "Members can read organization operator downtime"
  on public.mes_operator_terminal_downtime
  for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create organization operator downtime" on public.mes_operator_terminal_downtime;
create policy "Members can create organization operator downtime"
  on public.mes_operator_terminal_downtime
  for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update organization operator downtime" on public.mes_operator_terminal_downtime;
create policy "Members can update organization operator downtime"
  on public.mes_operator_terminal_downtime
  for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete organization operator downtime" on public.mes_operator_terminal_downtime;
create policy "Admins can delete organization operator downtime"
  on public.mes_operator_terminal_downtime
  for delete
  using (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Users can read their own operator traceability" on public.mes_operator_terminal_traceability;
drop policy if exists "Users can create their own operator traceability" on public.mes_operator_terminal_traceability;
drop policy if exists "Users can update their own operator traceability" on public.mes_operator_terminal_traceability;
drop policy if exists "Users can delete their own operator traceability" on public.mes_operator_terminal_traceability;

drop policy if exists "Members can read organization operator traceability" on public.mes_operator_terminal_traceability;
create policy "Members can read organization operator traceability"
  on public.mes_operator_terminal_traceability
  for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create organization operator traceability" on public.mes_operator_terminal_traceability;
create policy "Members can create organization operator traceability"
  on public.mes_operator_terminal_traceability
  for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update organization operator traceability" on public.mes_operator_terminal_traceability;
create policy "Members can update organization operator traceability"
  on public.mes_operator_terminal_traceability
  for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete organization operator traceability" on public.mes_operator_terminal_traceability;
create policy "Admins can delete organization operator traceability"
  on public.mes_operator_terminal_traceability
  for delete
  using (public.is_manufacturing_organization_admin(organization_id));

create or replace function public.mes_operator_report_production(
  p_order_id uuid,
  p_organization_id uuid,
  p_station_code text,
  p_good_delta integer default 0,
  p_scrap_delta integer default 0,
  p_reason text default null,
  p_comment text default null
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
      comment
    )
    values (
      p_organization_id,
      v_order.id,
      v_order.assigned_work_center,
      v_station_code,
      'production-good',
      p_good_delta,
      p_comment
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
        'scrap_quantity', v_order.scrap_quantity
      )
    );
  end if;

  update public.mes_work_center_stations
  set current_job = v_order.order_number,
      status = case when v_order.status = 'completed' then 'idle' else 'running' end,
      last_event = case when p_scrap_delta > 0 then 'Scrap reported' else 'Production reported' end
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
  p_comment text default null
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
    comment
  )
  values (
    p_organization_id,
    v_order.id,
    v_order.assigned_work_center,
    v_station_code,
    v_event_type,
    p_reason,
    p_comment
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
      coalesce(p_reason, 'Downtime reported'),
      p_comment
    );
  end if;

  update public.mes_work_center_stations
  set current_job = case when p_state = 'completed' then null else v_order.order_number end,
      status = v_station_status,
      last_event = case
        when p_state = 'down' then 'Downtime reported'
        when p_state = 'paused' then 'Job paused'
        when p_state = 'completed' then 'Operation completed'
        else 'Job running'
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
  p_comment text default null
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
    jsonb_build_object('action', 'active-order-switch')
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
    jsonb_build_object('traceability_id', v_capture.id)
  );

  return v_capture;
end;
$$;

grant execute on function public.mes_operator_report_production(uuid, uuid, text, integer, integer, text, text) to authenticated;
grant execute on function public.mes_operator_set_state(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.mes_operator_switch_active_order(uuid, uuid, text, text) to authenticated;
grant execute on function public.mes_operator_save_traceability(uuid, uuid, text, text, text, text, text, text, numeric, numeric, text[], text, numeric, numeric, jsonb) to authenticated;
