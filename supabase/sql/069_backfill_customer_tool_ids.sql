alter table public.mes_customer_tool_ids
  alter column minimum_life drop not null;

-- Promote every Tool ID already used in production into the master catalog.
-- The dimensional limit remains unconfigured until a user edits/recreates that
-- definition, but the Tool ID can immediately be linked to an Asset.
insert into public.mes_customer_tool_ids (
  organization_id,
  tool_id,
  part_type,
  minimum_life,
  measurement_unit
)
select distinct on (serial.organization_id, lower(btrim(serial.tool_id)))
  serial.organization_id,
  btrim(serial.tool_id),
  coalesce(nullif(initcap(production_order.piece_type), ''), nullif(production_order.part_name, ''), 'Other'),
  null,
  coalesce(nullif(trace.dimensions_unit, ''), 'in')
from public.mes_production_serials serial
join public.mes_production_orders production_order
  on production_order.id = serial.production_order_id
left join public.mes_operator_terminal_traceability trace
  on trace.id = serial.traceability_id
where nullif(btrim(serial.tool_id), '') is not null
order by serial.organization_id, lower(btrim(serial.tool_id)), serial.reported_at desc nulls last
on conflict do nothing;

create or replace function public.ensure_mes_customer_tool_id_from_serial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.mes_production_orders%rowtype;
  v_unit text;
begin
  if nullif(btrim(new.tool_id), '') is null then return new; end if;

  select * into v_order
  from public.mes_production_orders
  where id = new.production_order_id;

  if not found then return new; end if;

  select trace.dimensions_unit into v_unit
  from public.mes_operator_terminal_traceability trace
  where trace.id = new.traceability_id;

  insert into public.mes_customer_tool_ids (
    organization_id, tool_id, part_type, minimum_life, measurement_unit
  ) values (
    new.organization_id,
    btrim(new.tool_id),
    coalesce(nullif(initcap(v_order.piece_type), ''), nullif(v_order.part_name, ''), 'Other'),
    null,
    coalesce(nullif(v_unit, ''), 'in')
  ) on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists a_ensure_mes_customer_tool_id_from_serial on public.mes_production_serials;
create trigger a_ensure_mes_customer_tool_id_from_serial
after insert or update of tool_id, result on public.mes_production_serials
for each row execute function public.ensure_mes_customer_tool_id_from_serial();

-- Link existing Assets after the catalog has been populated.
update public.mes_customer_assets asset
set tool_definition_id = tool.id
from public.mes_production_serials serial, public.mes_customer_tool_ids tool
where asset.tool_definition_id is null
  and serial.organization_id = asset.organization_id
  and serial.production_order_id = coalesce(asset.last_production_order_id, asset.source_production_order_id)
  and lower(btrim(serial.serial_number)) = lower(btrim(asset.serial_number))
  and tool.organization_id = asset.organization_id
  and lower(btrim(tool.tool_id)) = lower(btrim(serial.tool_id));
