create table if not exists public.mes_operator_terminal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  production_order_id uuid references public.mes_production_orders(id) on delete set null,
  work_center_code text not null,
  station_code text not null,
  event_type text not null check (
    event_type in (
      'job-started',
      'job-resumed',
      'job-paused',
      'downtime-started',
      'production-good',
      'production-scrap',
      'operation-completed',
      'traceability-saved',
      'adjustment'
    )
  ),
  quantity integer not null default 0,
  reason text,
  comment text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mes_operator_terminal_downtime (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  production_order_id uuid references public.mes_production_orders(id) on delete set null,
  work_center_code text not null,
  station_code text not null,
  reason text not null,
  comment text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mes_operator_terminal_traceability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  production_order_id uuid references public.mes_production_orders(id) on delete cascade,
  work_center_code text not null,
  station_code text not null,
  template_id text not null default 'sharpening',
  part_label text,
  tool_id text,
  serial_number text,
  dimensions_unit text not null default 'in',
  before_notch numeric,
  before_tooth_length numeric,
  damage_codes text[] not null default '{}',
  damage_image_url text,
  stock_to_remove numeric,
  after_tooth_length numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mes_operator_terminal_events enable row level security;
alter table public.mes_operator_terminal_downtime enable row level security;
alter table public.mes_operator_terminal_traceability enable row level security;

grant select, insert, update, delete on public.mes_operator_terminal_events to authenticated;
grant select, insert, update, delete on public.mes_operator_terminal_downtime to authenticated;
grant select, insert, update, delete on public.mes_operator_terminal_traceability to authenticated;

drop policy if exists "Users can read their own operator terminal events" on public.mes_operator_terminal_events;
create policy "Users can read their own operator terminal events"
  on public.mes_operator_terminal_events
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own operator terminal events" on public.mes_operator_terminal_events;
create policy "Users can create their own operator terminal events"
  on public.mes_operator_terminal_events
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own operator terminal events" on public.mes_operator_terminal_events;
create policy "Users can update their own operator terminal events"
  on public.mes_operator_terminal_events
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own operator terminal events" on public.mes_operator_terminal_events;
create policy "Users can delete their own operator terminal events"
  on public.mes_operator_terminal_events
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own operator downtime" on public.mes_operator_terminal_downtime;
create policy "Users can read their own operator downtime"
  on public.mes_operator_terminal_downtime
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own operator downtime" on public.mes_operator_terminal_downtime;
create policy "Users can create their own operator downtime"
  on public.mes_operator_terminal_downtime
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own operator downtime" on public.mes_operator_terminal_downtime;
create policy "Users can update their own operator downtime"
  on public.mes_operator_terminal_downtime
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own operator downtime" on public.mes_operator_terminal_downtime;
create policy "Users can delete their own operator downtime"
  on public.mes_operator_terminal_downtime
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own operator traceability" on public.mes_operator_terminal_traceability;
create policy "Users can read their own operator traceability"
  on public.mes_operator_terminal_traceability
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own operator traceability" on public.mes_operator_terminal_traceability;
create policy "Users can create their own operator traceability"
  on public.mes_operator_terminal_traceability
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own operator traceability" on public.mes_operator_terminal_traceability;
create policy "Users can update their own operator traceability"
  on public.mes_operator_terminal_traceability
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own operator traceability" on public.mes_operator_terminal_traceability;
create policy "Users can delete their own operator traceability"
  on public.mes_operator_terminal_traceability
  for delete
  using (auth.uid() = user_id);

create index if not exists mes_operator_events_order_idx
  on public.mes_operator_terminal_events (user_id, production_order_id, created_at desc);

create index if not exists mes_operator_events_station_idx
  on public.mes_operator_terminal_events (user_id, work_center_code, station_code, created_at desc);

create index if not exists mes_operator_downtime_station_idx
  on public.mes_operator_terminal_downtime (user_id, work_center_code, station_code, started_at desc);

create index if not exists mes_operator_traceability_order_idx
  on public.mes_operator_terminal_traceability (user_id, production_order_id, created_at desc);

create or replace function public.set_mes_operator_terminal_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_mes_operator_terminal_downtime_updated_at on public.mes_operator_terminal_downtime;
create trigger set_mes_operator_terminal_downtime_updated_at
before update on public.mes_operator_terminal_downtime
for each row
execute function public.set_mes_operator_terminal_updated_at();

drop trigger if exists set_mes_operator_terminal_traceability_updated_at on public.mes_operator_terminal_traceability;
create trigger set_mes_operator_terminal_traceability_updated_at
before update on public.mes_operator_terminal_traceability
for each row
execute function public.set_mes_operator_terminal_updated_at();

create or replace function public.mes_operator_report_production(
  p_order_id uuid,
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
begin
  if p_good_delta < 0 or p_scrap_delta < 0 then
    raise exception 'Production deltas must be positive.';
  end if;

  select *
    into v_order
  from public.mes_production_orders
  where id = p_order_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Production order not found.';
  end if;

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
      production_order_id,
      work_center_code,
      station_code,
      event_type,
      quantity,
      comment
    )
    values (
      v_order.id,
      v_order.assigned_work_center,
      coalesce(nullif(p_station_code, ''), v_order.assigned_station),
      'production-good',
      p_good_delta,
      p_comment
    );
  end if;

  if p_scrap_delta > 0 then
    insert into public.mes_operator_terminal_events (
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
      v_order.id,
      v_order.assigned_work_center,
      coalesce(nullif(p_station_code, ''), v_order.assigned_station),
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
  where user_id = auth.uid()
    and code = coalesce(nullif(p_station_code, ''), v_order.assigned_station);

  return v_order;
end;
$$;

create or replace function public.mes_operator_set_state(
  p_order_id uuid,
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
begin
  if p_state not in ('running', 'paused', 'down', 'completed') then
    raise exception 'Unsupported operator state: %', p_state;
  end if;

  select *
    into v_order
  from public.mes_production_orders
  where id = p_order_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Production order not found.';
  end if;

  update public.mes_production_orders
  set status = case when p_state = 'down' then 'paused' else p_state end
  where id = v_order.id
  returning * into v_order;

  v_event_type = case
    when p_state = 'running' and v_order.status = 'running' then 'job-started'
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
    production_order_id,
    work_center_code,
    station_code,
    event_type,
    reason,
    comment
  )
  values (
    v_order.id,
    v_order.assigned_work_center,
    coalesce(nullif(p_station_code, ''), v_order.assigned_station),
    v_event_type,
    p_reason,
    p_comment
  );

  if p_state = 'down' then
    insert into public.mes_operator_terminal_downtime (
      production_order_id,
      work_center_code,
      station_code,
      reason,
      comment
    )
    values (
      v_order.id,
      v_order.assigned_work_center,
      coalesce(nullif(p_station_code, ''), v_order.assigned_station),
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
  where user_id = auth.uid()
    and code = coalesce(nullif(p_station_code, ''), v_order.assigned_station);

  return v_order;
end;
$$;

create or replace function public.mes_operator_switch_active_order(
  p_order_id uuid,
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
  select *
    into v_order
  from public.mes_production_orders
  where id = p_order_id
    and user_id = auth.uid()
    and manufacturing_type = 'single-operation'
    and status in ('released', 'running', 'paused')
  for update;

  if not found then
    raise exception 'Production order not found.';
  end if;

  v_station_code = coalesce(nullif(p_station_code, ''), v_order.assigned_station);

  update public.mes_production_orders
  set status = 'paused'
  where user_id = auth.uid()
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
    production_order_id,
    work_center_code,
    station_code,
    event_type,
    comment,
    payload
  )
  values (
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
  where user_id = auth.uid()
    and code = v_station_code;

  return v_order;
end;
$$;

create or replace function public.mes_operator_save_traceability(
  p_order_id uuid,
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
begin
  select *
    into v_order
  from public.mes_production_orders
  where id = p_order_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Production order not found.';
  end if;

  insert into public.mes_operator_terminal_traceability (
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
    v_order.id,
    v_order.assigned_work_center,
    coalesce(nullif(p_station_code, ''), v_order.assigned_station),
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
    production_order_id,
    work_center_code,
    station_code,
    event_type,
    payload
  )
  values (
    v_order.id,
    v_order.assigned_work_center,
    coalesce(nullif(p_station_code, ''), v_order.assigned_station),
    'traceability-saved',
    jsonb_build_object('traceability_id', v_capture.id)
  );

  return v_capture;
end;
$$;

grant execute on function public.mes_operator_report_production(uuid, text, integer, integer, text, text) to authenticated;
grant execute on function public.mes_operator_set_state(uuid, text, text, text, text) to authenticated;
grant execute on function public.mes_operator_switch_active_order(uuid, text, text) to authenticated;
grant execute on function public.mes_operator_save_traceability(uuid, text, text, text, text, text, text, numeric, numeric, text[], text, numeric, numeric, jsonb) to authenticated;
