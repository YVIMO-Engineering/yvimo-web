-- Intelligent Scheduling plans inside the work center the order belongs to.
--
-- Station codes are unique per work center, not per organization: migration 030 declares
-- unique (user_id, work_center_id, code). Two plants can therefore both own a station
-- coded 305 -- GMEX-Saltillo has the KAPP 305 of Gleason Norte and GMEX-QRO has its own
-- KAPP 305 -- and every step that matched a station by bare code treated them as the
-- same machine.
--
-- The damage was silent and two-sided. A single-operation order assigned to station 305
-- of Saltillo matched both machines, and the balancer, which picks the least loaded
-- candidate, happily queued it in Queretaro. A multi-step order was worse: both plants
-- matched as "assigned here", so the same pieces were queued twice, once per plant, each
-- card reading the same piece count.
--
-- The compatibility join now requires the station to belong to the work center the order
-- carries. An order with no work center still matches on station code alone, which is
-- what it did before.

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
  -- keeps the engine from waking itself up halfway through its own work. It is cleared
  -- before returning, so later statements of the same transaction still replan.
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

  -- Before anything is planned, pieces catch up with cards that were moved by hand:
  -- otherwise the step below would see pieces on the machine the card just left and
  -- helpfully queue the order there all over again.
  for v_item in
    select queue_item.production_order_id,
           station.pool,
           station.code as target_code
    from public.mes_production_schedule_queue queue_item
    join tmp_is_station station on station.id = queue_item.station_id
    join tmp_is_order production_order on production_order.id = queue_item.production_order_id
    where queue_item.organization_id = p_organization_id
      and production_order.manufacturing_type = 'multi-step'
      and (
        select count(*)
        from public.mes_production_schedule_queue pool_item
        join tmp_is_station pool_station on pool_station.id = pool_item.station_id
        where pool_item.production_order_id = queue_item.production_order_id
          and pool_station.pool = station.pool
      ) = 1
  loop
    update public.mes_production_serials piece
    set assigned_station = v_item.target_code
    from tmp_is_station other_station
    where piece.organization_id = p_organization_id
      and piece.production_order_id = v_item.production_order_id
      and piece.result is null
      and piece.assigned_station = other_station.code
      and other_station.pool = v_item.pool
      and other_station.code <> v_item.target_code;
  end loop;

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
      -- Station codes are unique per work center (migration 030), so the very same code
      -- names a different machine in every plant. Without this gate the KAPP 305 of
      -- Saltillo and the KAPP 305 of Queretaro both claim the same order, and the work
      -- is planned in the plant that happens to carry fewer cards.
      on (production_order.assigned_work_center = ''
          or station.work_center_code = production_order.assigned_work_center)
     and case
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
         queue_item.production_order_id,
         queue_item.preferred_station_id,
         (coalesce(production_order.manufacturing_type, '') = 'multi-step') as multi_step,
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
         (queue_item.preferred_station_id is null
           and (select count(*) from tmp_is_station sibling where sibling.pool = station.pool) > 1
           and (
             coalesce(production_order.manufacturing_type, '') = 'single-operation'
             or (
               coalesce(production_order.manufacturing_type, '') = 'multi-step'
               -- An order already split across the pool keeps each card where it is:
               -- those cards are the split, moving them would only shuffle it.
               and (
                 select count(*)
                 from public.mes_production_schedule_queue pool_item
                 join tmp_is_station pool_station on pool_station.id = pool_item.station_id
                 where pool_item.production_order_id = queue_item.production_order_id
                   and pool_station.pool = station.pool
               ) = 1
             )
           )) as movable,
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

  -- A multi-step card counts the pieces assigned to its own machine, so the pieces
  -- follow the card: whether the balancer moved it or somebody parked it on the sister
  -- machine by hand, the order's pending pieces sitting elsewhere in the pool are
  -- reassigned to the machine the card ended on. An order split across both machines
  -- keeps two cards and is left alone: that split is already the balance.
  for v_item in
    select plan.production_order_id,
           plan.pool,
           landing_station.code as target_code
    from tmp_is_plan plan
    join tmp_is_station landing_station on landing_station.id = coalesce(plan.target_station, plan.station_id)
    where plan.multi_step
      and (
        select count(*) from tmp_is_plan pool_plan
        where pool_plan.production_order_id = plan.production_order_id
          and pool_plan.pool = plan.pool
      ) = 1
  loop
    update public.mes_production_serials piece
    set assigned_station = v_item.target_code
    from tmp_is_station other_station
    where piece.organization_id = p_organization_id
      and piece.production_order_id = v_item.production_order_id
      and piece.result is null
      and piece.assigned_station = other_station.code
      and other_station.pool = v_item.pool
      and other_station.code <> v_item.target_code;
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

  perform set_config('mes.intelligent_schedule_done', '', true);
  return v_added + v_changes;
end;
$$;

revoke all on function public.mes_intelligent_schedule_apply(uuid) from public;
grant execute on function public.mes_intelligent_schedule_apply(uuid) to authenticated;

-- Replanning now happens once per statement instead of once per row. A bulk change
-- replans a single time, and every statement of a multi-statement transaction gets its
-- own pass, so an order and the pieces created right after it are both seen.
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

  if tg_op = 'DELETE' then
    for v_organization_id in select distinct organization_id from mes_intelligent_schedule_removed_rows loop
      perform public.mes_intelligent_schedule_apply(v_organization_id);
    end loop;
  else
    for v_organization_id in select distinct organization_id from mes_intelligent_schedule_changed_rows loop
      perform public.mes_intelligent_schedule_apply(v_organization_id);
    end loop;
  end if;

  return null;
end;
$$;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'mes_production_orders',
    'mes_production_serials',
    'mes_work_center_stations',
    'mes_production_schedule_queue',
    'mes_production_schedule_settings'
  ];
begin
  foreach v_table in array v_tables
  loop
    execute format('drop trigger if exists mes_intelligent_schedule_on_%s on public.%I', replace(v_table, 'mes_', ''), v_table);
    execute format('drop trigger if exists mes_intelligent_schedule_insert_%s on public.%I', v_table, v_table);
    execute format('drop trigger if exists mes_intelligent_schedule_update_%s on public.%I', v_table, v_table);
    execute format('drop trigger if exists mes_intelligent_schedule_delete_%s on public.%I', v_table, v_table);

    execute format(
      'create trigger mes_intelligent_schedule_insert_%s after insert on public.%I '
      'referencing new table as mes_intelligent_schedule_changed_rows '
      'for each statement execute function public.mes_intelligent_schedule_touch()', v_table, v_table);
    execute format(
      'create trigger mes_intelligent_schedule_update_%s after update on public.%I '
      'referencing new table as mes_intelligent_schedule_changed_rows '
      'for each statement execute function public.mes_intelligent_schedule_touch()', v_table, v_table);
    execute format(
      'create trigger mes_intelligent_schedule_delete_%s after delete on public.%I '
      'referencing old table as mes_intelligent_schedule_removed_rows '
      'for each statement execute function public.mes_intelligent_schedule_touch()', v_table, v_table);
  end loop;
end;
$$;

-- The old row-level triggers from migration 180 are replaced by the statement-level ones.
drop trigger if exists mes_intelligent_schedule_on_orders on public.mes_production_orders;
drop trigger if exists mes_intelligent_schedule_on_serials on public.mes_production_serials;
drop trigger if exists mes_intelligent_schedule_on_stations on public.mes_work_center_stations;
drop trigger if exists mes_intelligent_schedule_on_queue on public.mes_production_schedule_queue;
drop trigger if exists mes_intelligent_schedule_on_settings on public.mes_production_schedule_settings;

-- The reconciler of migration 140 carried the same blind spot: it dropped a card whose
-- station code did not match the order, but a card sitting on the identically coded
-- machine of another plant looked perfectly valid to it.
create or replace function public.reconcile_single_operation_schedule_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.manufacturing_type = 'single-operation'
    and (
      old.assigned_station is distinct from new.assigned_station
      or old.assigned_work_center is distinct from new.assigned_work_center
      or old.manufacturing_type is distinct from new.manufacturing_type
    )
  then
    delete from public.mes_production_schedule_queue queue_item
    using public.mes_work_center_stations station
    left join public.mes_work_centers center on center.id = station.work_center_id
    where queue_item.production_order_id = new.id
      and queue_item.organization_id = new.organization_id
      and station.id = queue_item.station_id
      and (
        case
          when nullif(btrim(coalesce(new.assigned_station, '')), '') is not null
            then not (station.code = any(regexp_split_to_array(btrim(new.assigned_station), '\s*,\s*')))
              or (
                nullif(btrim(coalesce(new.assigned_work_center, '')), '') is not null
                and center.code is distinct from new.assigned_work_center
              )
          when nullif(btrim(coalesce(new.assigned_work_center, '')), '') is not null
            then center.code is distinct from new.assigned_work_center
          else false
        end
      );
  end if;
  return new;
end;
$$;

drop trigger if exists reconcile_single_operation_schedule_assignment on public.mes_production_orders;
create trigger reconcile_single_operation_schedule_assignment
after update of assigned_station, assigned_work_center, manufacturing_type
on public.mes_production_orders
for each row execute function public.reconcile_single_operation_schedule_assignment();

-- Repair what the blind spot already planned: every card standing on a station outside
-- the work center its own order carries. A station explicitly mirrored with a machine of
-- the right work center is kept, because that pairing is somebody's deliberate setup.
delete from public.mes_production_schedule_queue queue_item
using public.mes_production_orders production_order,
      public.mes_work_center_stations station
left join public.mes_work_centers center on center.id = station.work_center_id
where production_order.id = queue_item.production_order_id
  and station.id = queue_item.station_id
  and nullif(btrim(coalesce(production_order.assigned_work_center, '')), '') is not null
  and center.code is distinct from production_order.assigned_work_center
  and not exists (
    select 1
    from public.mes_work_center_stations sibling
    left join public.mes_work_centers sibling_center on sibling_center.id = sibling.work_center_id
    where station.mirror_group_id is not null
      and sibling.mirror_group_id = station.mirror_group_id
      and sibling_center.code = production_order.assigned_work_center
  );
