-- Intelligent Scheduling, moved into the database.
--
-- The first version planned the board from the browser, so the plan only advanced while
-- somebody had the Production Schedule open. This migration makes the engine itself a
-- database function: it runs from triggers whenever the data it depends on changes
-- (orders, pieces, stations, the switch) and from the client as a catch-up. Whoever
-- opens the schedule sees the same plan, because the plan no longer lives in a browser.
--
-- It also adds the manual preference: a card moved to a mirror machine by hand records
-- that machine and the balancer stops moving it.

alter table public.mes_production_schedule_queue
  add column if not exists preferred_station_id uuid references public.mes_work_center_stations(id) on delete set null;

comment on column public.mes_production_schedule_queue.preferred_station_id is
  'Mirror machine chosen by hand for this card. Intelligent Scheduling keeps the card there instead of balancing it away.';

create or replace function public.mes_intelligent_schedule_apply(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
set client_min_messages = warning
as $$
declare
  v_enabled boolean;
  v_added integer := 0;
  v_changes integer := 0;
  v_item record;
  v_target uuid;
begin
  if p_organization_id is null then
    return 0;
  end if;

  select intelligent_scheduling into v_enabled
  from public.mes_production_schedule_settings
  where organization_id = p_organization_id;

  if not coalesce(v_enabled, false) then
    return 0;
  end if;

  -- The engine writes to the queue, and the queue has a replanning trigger. This flag
  -- is what keeps the engine from waking itself up halfway through its own work; it
  -- lives for the transaction, so a bulk change replans once instead of once per row.
  perform set_config('mes.intelligent_schedule_done', '1', true);

  drop table if exists tmp_is_station;
  drop table if exists tmp_is_order;
  drop table if exists tmp_is_piece;
  drop table if exists tmp_is_compat;
  drop table if exists tmp_is_plan;
  drop table if exists tmp_is_bucket;

  -- Every station plans inside a pool: its mirror group, or itself when it has none.
  create temporary table tmp_is_station on commit drop as
  select station.id,
         station.code,
         coalesce(center.code, '') as work_center_code,
         coalesce(station.mirror_group_id::text, station.id::text) as pool,
         coalesce(station.schedule_position, 2147483647) as station_order
  from public.mes_work_center_stations station
  left join public.mes_work_centers center on center.id = station.work_center_id
  where station.organization_id = p_organization_id;

  create temporary table tmp_is_order on commit drop as
  select id,
         order_number,
         due_date,
         coalesce(manufacturing_type, 'single-operation') as manufacturing_type,
         coalesce(assigned_station, '') as assigned_station,
         coalesce(assigned_work_center, '') as assigned_work_center
  from public.mes_production_orders
  where organization_id = p_organization_id
    and status in ('planned', 'released', 'running', 'paused');

  create temporary table tmp_is_piece on commit drop as
  select production_order_id as order_id,
         coalesce(assigned_station, '') as assigned_station,
         coalesce(compatible_stations, array[]::text[]) as compatible_stations,
         coalesce(quarantined, false) as quarantined
  from public.mes_production_serials
  where organization_id = p_organization_id
    and result is null;

  -- Which station can run which order. Multi-step work follows its pieces; single
  -- operation work follows its stations (or work center) and every mirror sibling of
  -- those stations, because sister machines run each other's work.
  create temporary table tmp_is_compat on commit drop as
  with direct as (
    select production_order.id as order_id,
           station.id as station_id,
           station.pool,
           (production_order.manufacturing_type = 'multi-step'
             and exists (
               select 1 from tmp_is_piece piece
               where piece.order_id = production_order.id
                 and piece.assigned_station = station.code
             )) as assigned_here
    from tmp_is_order production_order
    join tmp_is_station station
      on case
           when production_order.manufacturing_type = 'multi-step' then exists (
             select 1 from tmp_is_piece piece
             where piece.order_id = production_order.id
               and (piece.assigned_station = station.code or station.code = any (piece.compatible_stations))
           )
           when btrim(production_order.assigned_station) <> '' then
             station.code = any (
               select btrim(code) from unnest(string_to_array(production_order.assigned_station, ',')) as code
             )
           else production_order.assigned_work_center <> ''
             and station.work_center_code = production_order.assigned_work_center
         end
  ),
  mirrored as (
    select production_order.id as order_id,
           station.id as station_id,
           station.pool,
           false as assigned_here
    from tmp_is_order production_order
    join tmp_is_station station on true
    where production_order.manufacturing_type <> 'multi-step'
      and exists (
        select 1 from direct
        where direct.order_id = production_order.id
          and direct.pool = station.pool
      )
  )
  select order_id, station_id, pool, bool_or(assigned_here) as assigned_here, bool_or(native) as native
  from (
    select order_id, station_id, pool, assigned_here, true as native from direct
    union all
    select order_id, station_id, pool, assigned_here, false as native from mirrored
  ) as candidates
  group by order_id, station_id, pool;

  -- Queue everything that is missing from the plan.
  with queued as (
    select queue_item.production_order_id, queue_item.station_id, station.pool
    from public.mes_production_schedule_queue queue_item
    join tmp_is_station station on station.id = queue_item.station_id
    where queue_item.organization_id = p_organization_id
  ),
  station_load as (
    select station.id as station_id, station.pool, station.station_order, count(queued.*) as total
    from tmp_is_station station
    left join queued on queued.station_id = station.id
    group by station.id, station.pool, station.station_order
  ),
  multi_assigned as (
    select compat.order_id, compat.station_id
    from tmp_is_compat compat
    join tmp_is_order production_order on production_order.id = compat.order_id
    where production_order.manufacturing_type = 'multi-step'
      and compat.assigned_here
  ),
  multi_floating as (
    select distinct on (compat.order_id) compat.order_id, compat.station_id
    from tmp_is_compat compat
    join tmp_is_order production_order on production_order.id = compat.order_id
    join station_load on station_load.station_id = compat.station_id
    where production_order.manufacturing_type = 'multi-step'
      and not exists (select 1 from multi_assigned where multi_assigned.order_id = compat.order_id)
      and not exists (select 1 from queued where queued.production_order_id = compat.order_id)
    order by compat.order_id, compat.native desc, station_load.total, station_load.station_order
  ),
  single_targets as (
    select distinct on (compat.order_id) compat.order_id, compat.station_id
    from tmp_is_compat compat
    join tmp_is_order production_order on production_order.id = compat.order_id
    join station_load on station_load.station_id = compat.station_id
    where production_order.manufacturing_type <> 'multi-step'
      and not exists (select 1 from queued where queued.production_order_id = compat.order_id)
    order by compat.order_id, compat.native desc, station_load.total, station_load.station_order
  ),
  targets as (
    select * from multi_assigned
    union
    select * from multi_floating
    union
    select * from single_targets
  )
  insert into public.mes_production_schedule_queue (organization_id, station_id, production_order_id, position)
  select p_organization_id,
         targets.station_id,
         targets.order_id,
         coalesce((
           select max(existing.position)
           from public.mes_production_schedule_queue existing
           where existing.station_id = targets.station_id
         ), 0) + row_number() over (partition by targets.station_id order by targets.order_id)
  from targets
  where not exists (
    select 1 from public.mes_production_schedule_queue existing
    where existing.station_id = targets.station_id
      and existing.production_order_id = targets.order_id
  )
  on conflict (station_id, production_order_id) do nothing;

  get diagnostics v_added = row_count;

  -- The whole board, ranked. Quarantined work is demoted below every red order because
  -- nothing can be done with it right now; cards whose order is no longer active sort last.
  create temporary table tmp_is_plan on commit drop as
  select queue_item.id as item_id,
         queue_item.station_id,
         queue_item.preferred_station_id,
         station.pool,
         coalesce(production_order.due_date, date '9999-12-31') as due_date,
         coalesce(production_order.order_number, '') as order_number,
         case
           when production_order.id is null then 6
           when held.held then 2
           when production_order.due_date < current_date then 0
           when production_order.due_date - current_date <= 1 then 1
           when production_order.due_date - current_date <= 3 then 3
           else 4
         end as rank,
         (coalesce(production_order.manufacturing_type, '') = 'single-operation'
           and queue_item.preferred_station_id is null
           and (select count(*) from tmp_is_station sibling where sibling.pool = station.pool) > 1) as movable,
         null::uuid as target_station
  from public.mes_production_schedule_queue queue_item
  join tmp_is_station station on station.id = queue_item.station_id
  left join tmp_is_order production_order on production_order.id = queue_item.production_order_id
  left join lateral (
    select count(*) > 0 and count(*) filter (where not piece.quarantined) = 0 as held
    from tmp_is_piece piece
    where piece.order_id = production_order.id
      and (production_order.manufacturing_type <> 'multi-step'
        or piece.assigned_station = station.code
        or station.code = any (piece.compatible_stations))
  ) held on true
  where queue_item.organization_id = p_organization_id;

  -- A card parked by hand on a mirror machine stays there.
  update tmp_is_plan
  set target_station = preferred_station_id
  where not movable
    and preferred_station_id is not null
    and exists (
      select 1 from tmp_is_station station
      where station.id = tmp_is_plan.preferred_station_id
        and station.pool = tmp_is_plan.pool
    );

  update tmp_is_plan
  set target_station = station_id
  where target_station is null
    and not movable;

  -- Every urgency level gets its own fair share per machine: what is already nailed
  -- down (multi-step work and cards parked by hand), plus where the movable cards sit
  -- today, which is what lets the balancer leave them alone.
  create temporary table tmp_is_bucket on commit drop as
  select station.pool,
         station.id as station_id,
         station.station_order,
         ranks.rank,
         coalesce((
           select count(*) from tmp_is_plan plan
           where plan.target_station = station.id and plan.rank = ranks.rank
         ), 0)::integer as fixed_items,
         coalesce((
           select count(*) from tmp_is_plan plan
           where plan.movable and plan.station_id = station.id and plan.rank = ranks.rank
         ), 0)::integer as movable_now,
         0::integer as capacity,
         0::integer as taken
  from tmp_is_station station
  cross join (select generate_series(0, 6) as rank) ranks;

  -- Fair share: the level is split as evenly as the machines allow, and the spare slot
  -- goes to the machine already carrying more of that level, so nothing moves for free.
  update tmp_is_bucket
  set capacity = allocation.capacity
  from (
    select bucket.station_id,
           bucket.rank,
           (totals.total / totals.stations)
             + case
                 when row_number() over (
                   partition by bucket.pool, bucket.rank
                   order by bucket.fixed_items + bucket.movable_now desc, station_totals.total, bucket.station_order, bucket.station_id
                 ) <= totals.total % totals.stations then 1
                 else 0
               end as capacity
    from tmp_is_bucket bucket
    join (
      select pool, rank, sum(fixed_items + movable_now) as total, count(*) as stations
      from tmp_is_bucket
      group by pool, rank
    ) totals on totals.pool = bucket.pool and totals.rank = bucket.rank
    join (
      select station_id, sum(fixed_items + movable_now) as total
      from tmp_is_bucket
      group by station_id
    ) station_totals on station_totals.station_id = bucket.station_id
  ) allocation
  where tmp_is_bucket.station_id = allocation.station_id
    and tmp_is_bucket.rank = allocation.rank;

  -- A card stays on its machine while that machine is inside its fair share.
  for v_item in
    select * from tmp_is_plan where movable order by rank, due_date, order_number, item_id
  loop
    update tmp_is_bucket
    set taken = taken + 1
    where station_id = v_item.station_id
      and rank = v_item.rank
      and fixed_items + taken < capacity
    returning station_id into v_target;

    if found then
      update tmp_is_plan set target_station = v_target where item_id = v_item.item_id;
    end if;
  end loop;

  -- Only the overflow travels, and it lands on the mirror machine with the most room.
  for v_item in
    select * from tmp_is_plan
    where movable and target_station is null
    order by rank, due_date, order_number, item_id
  loop
    select bucket.station_id into v_target
    from tmp_is_bucket bucket
    where bucket.pool = v_item.pool
      and bucket.rank = v_item.rank
      and bucket.fixed_items + bucket.taken < bucket.capacity
    order by (bucket.capacity - bucket.fixed_items - bucket.taken) desc, bucket.station_order, bucket.station_id
    limit 1;

    if v_target is null then
      -- Fixed work already fills every fair share: fall back to the lightest machine.
      select bucket.station_id into v_target
      from tmp_is_bucket bucket
      where bucket.pool = v_item.pool
        and bucket.rank = v_item.rank
      order by bucket.fixed_items + bucket.taken, bucket.station_order, bucket.station_id
      limit 1;
    end if;

    update tmp_is_plan set target_station = v_target where item_id = v_item.item_id;
    update tmp_is_bucket set taken = taken + 1 where station_id = v_target and rank = v_item.rank;
  end loop;

  -- Moving a card between mirror machines changes its station and its position at once,
  -- which is exactly what the (station_id, position) index dislikes halfway through.
  set constraints mes_production_schedule_queue_station_id_position_key deferred;

  with final_plan as (
    select item_id,
           coalesce(target_station, station_id) as station_id,
           row_number() over (
             partition by coalesce(target_station, station_id)
             order by rank, due_date, order_number, item_id
           ) as position
    from tmp_is_plan
  )
  update public.mes_production_schedule_queue queue_item
  set station_id = final_plan.station_id,
      position = final_plan.position
  from final_plan
  where queue_item.id = final_plan.item_id
    and (queue_item.station_id <> final_plan.station_id or queue_item.position <> final_plan.position);

  get diagnostics v_changes = row_count;
  return v_added + v_changes;
end;
$$;

revoke all on function public.mes_intelligent_schedule_apply(uuid) from public;
grant execute on function public.mes_intelligent_schedule_apply(uuid) to authenticated;

create or replace function public.mes_intelligent_schedule_apply_all()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
begin
  for v_organization_id in
    select organization_id
    from public.mes_production_schedule_settings
    where intelligent_scheduling
  loop
    perform public.mes_intelligent_schedule_apply(v_organization_id);
  end loop;
  perform set_config('mes.intelligent_schedule_done', '', true);
end;
$$;

-- Replanning is driven by the data the plan depends on. The flag keeps a bulk change
-- from replanning once per row, and the queue table itself is never a trigger source,
-- so the engine can write its result without waking itself up.
create or replace function public.mes_intelligent_schedule_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
begin
  if coalesce(current_setting('mes.intelligent_schedule_done', true), '') = '1' then
    return null;
  end if;

  v_organization_id := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  if v_organization_id is null then
    return null;
  end if;

  perform public.mes_intelligent_schedule_apply(v_organization_id);
  return null;
end;
$$;

drop trigger if exists mes_intelligent_schedule_on_orders on public.mes_production_orders;
create trigger mes_intelligent_schedule_on_orders
after insert or update or delete on public.mes_production_orders
for each row execute function public.mes_intelligent_schedule_touch();

drop trigger if exists mes_intelligent_schedule_on_serials on public.mes_production_serials;
create trigger mes_intelligent_schedule_on_serials
after insert or update or delete on public.mes_production_serials
for each row execute function public.mes_intelligent_schedule_touch();

drop trigger if exists mes_intelligent_schedule_on_stations on public.mes_work_center_stations;
create trigger mes_intelligent_schedule_on_stations
after insert or update or delete on public.mes_work_center_stations
for each row execute function public.mes_intelligent_schedule_touch();

drop trigger if exists mes_intelligent_schedule_on_queue on public.mes_production_schedule_queue;
create trigger mes_intelligent_schedule_on_queue
after insert or update or delete on public.mes_production_schedule_queue
for each row execute function public.mes_intelligent_schedule_touch();

drop trigger if exists mes_intelligent_schedule_on_settings on public.mes_production_schedule_settings;
create trigger mes_intelligent_schedule_on_settings
after insert or update on public.mes_production_schedule_settings
for each row execute function public.mes_intelligent_schedule_touch();

-- Urgency also changes with the calendar: an order becomes overdue without anybody
-- touching a row. When pg_cron is available the board is replanned every 10 minutes;
-- otherwise the open schedules call the same function on their refresh.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('mes-intelligent-schedule');
  end if;
exception when others then null;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('mes-intelligent-schedule', '*/10 * * * *', 'select public.mes_intelligent_schedule_apply_all()');
  end if;
exception when others then null;
end;
$$;
