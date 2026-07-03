create table if not exists public.mes_production_serials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  production_order_id uuid not null references public.mes_production_orders(id) on delete cascade,
  serial_number text not null check (length(btrim(serial_number)) > 0),
  piece_sequence integer not null check (piece_sequence > 0),
  result text not null check (result in ('good', 'scrap')),
  traceability_id uuid references public.mes_operator_terminal_traceability(id) on delete set null,
  ready_for_quality boolean not null default false,
  reported_by uuid references auth.users(id) on delete set null default auth.uid(),
  reported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (production_order_id, piece_sequence)
);

create unique index if not exists mes_production_serials_order_serial_unique_idx
  on public.mes_production_serials (production_order_id, lower(btrim(serial_number)));

create index if not exists mes_production_serials_order_idx
  on public.mes_production_serials (production_order_id, piece_sequence);

alter table public.mes_production_serials enable row level security;

drop policy if exists "Members can read MES production serials" on public.mes_production_serials;
create policy "Members can read MES production serials"
  on public.mes_production_serials
  for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create MES production serials" on public.mes_production_serials;
create policy "Members can create MES production serials"
  on public.mes_production_serials
  for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete MES production serials" on public.mes_production_serials;
create policy "Admins can delete MES production serials"
  on public.mes_production_serials
  for delete
  using (public.is_manufacturing_organization_admin(organization_id));

grant select, insert, delete on public.mes_production_serials to authenticated;

with distinct_captures as (
  select distinct on (trace.production_order_id, lower(btrim(trace.serial_number)))
    trace.id,
    trace.organization_id,
    trace.production_order_id,
    btrim(trace.serial_number) as serial_number,
    case when trace.payload ->> 'report_type' = 'scrap' then 'scrap' else 'good' end as result,
    trace.created_at
  from public.mes_operator_terminal_traceability trace
  where trace.organization_id is not null
    and nullif(btrim(trace.serial_number), '') is not null
    and trace.payload ->> 'report_type' in ('good', 'scrap')
  order by trace.production_order_id, lower(btrim(trace.serial_number)), trace.created_at
), ranked_captures as (
  select
    capture.*,
    row_number() over (partition by capture.production_order_id order by capture.created_at, capture.id) as piece_sequence
  from distinct_captures capture
)
insert into public.mes_production_serials (
  organization_id,
  production_order_id,
  serial_number,
  piece_sequence,
  result,
  traceability_id,
  ready_for_quality,
  reported_at
)
select
  organization_id,
  production_order_id,
  serial_number,
  piece_sequence,
  result,
  id,
  true,
  created_at
from ranked_captures
on conflict do nothing;

create or replace function public.link_mes_traceability_to_production_serial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(new.serial_number), '') is null then
    return new;
  end if;

  update public.mes_production_serials
  set traceability_id = new.id,
      ready_for_quality = true
  where production_order_id = new.production_order_id
    and lower(btrim(serial_number)) = lower(btrim(new.serial_number));

  return new;
end;
$$;

drop trigger if exists link_mes_traceability_to_production_serial on public.mes_operator_terminal_traceability;
create trigger link_mes_traceability_to_production_serial
after insert on public.mes_operator_terminal_traceability
for each row
execute function public.link_mes_traceability_to_production_serial();

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

  v_piece_sequence = v_order.completed_quantity + v_order.scrap_quantity + 1;
  if v_piece_sequence > v_order.planned_quantity then
    raise exception using errcode = '22023', message = 'The planned quantity has already been reported.';
  end if;

  insert into public.mes_production_serials (
    organization_id,
    production_order_id,
    serial_number,
    piece_sequence,
    result
  )
  values (
    p_organization_id,
    v_order.id,
    v_serial,
    v_piece_sequence,
    p_result
  );

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
    nullif(p_traceability ->> 'tool_id', ''),
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
