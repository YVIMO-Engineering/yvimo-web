create or replace function public.get_customer_portal_tools(
  p_organization_id uuid,
  p_customer_id uuid
)
returns table (
  id uuid, source_type text, source_production_order_id uuid, last_production_order_id uuid,
  asset_type text, serial_number text, part_number text, description text, manufacturer text,
  family_category text, current_location text, status text, estimated_life_percent numeric,
  max_sharpenings integer, last_inspection_at timestamptz, last_service_at timestamptz,
  service_count integer, tool_id text, internal_tool_id text, minimum_life numeric,
  measurement_unit text
)
language sql security definer stable set search_path = public
as $$
  select asset.id, asset.source_type, asset.source_production_order_id, asset.last_production_order_id,
    asset.asset_type, asset.serial_number, asset.part_number, asset.description, asset.manufacturer,
    asset.family_category, asset.current_location, asset.status, asset.estimated_life_percent,
    asset.max_sharpenings, asset.last_inspection_at, asset.last_service_at, asset.service_count,
    tool.tool_id, tool.internal_tool_id, tool.minimum_life, tool.measurement_unit
  from public.mes_customer_assets asset
  left join public.mes_customer_tool_ids tool on tool.id = asset.tool_definition_id
  where asset.organization_id = p_organization_id
    and asset.customer_id = p_customer_id
    and public.customer_portal_has_permission(asset.organization_id, asset.customer_id, 'tools')
  order by asset.updated_at desc;
$$;

create or replace function public.get_customer_portal_tool_services(
  p_organization_id uuid,
  p_customer_id uuid
)
returns table (
  id uuid, asset_id uuid, production_order_id uuid, service_type text, result text,
  service_date timestamptz, remaining_life_percent numeric, notes text, order_number text
)
language sql security definer stable set search_path = public
as $$
  select service.id, service.asset_id, service.production_order_id, service.service_type,
    service.result, service.service_date, service.remaining_life_percent, service.notes,
    production_order.order_number
  from public.mes_customer_asset_service_events service
  join public.mes_customer_assets asset on asset.id = service.asset_id
  left join public.mes_production_orders production_order on production_order.id = service.production_order_id
  where asset.organization_id = p_organization_id
    and asset.customer_id = p_customer_id
    and public.customer_portal_has_permission(asset.organization_id, asset.customer_id, 'tools')
  order by service.service_date desc;
$$;

revoke all on function public.get_customer_portal_tools(uuid, uuid) from public;
revoke all on function public.get_customer_portal_tool_services(uuid, uuid) from public;
grant execute on function public.get_customer_portal_tools(uuid, uuid) to authenticated;
grant execute on function public.get_customer_portal_tool_services(uuid, uuid) to authenticated;

drop policy if exists "Portal users can read assigned asset services" on public.mes_customer_asset_service_events;
create policy "Portal users can read assigned asset services"
on public.mes_customer_asset_service_events for select
using (
  exists (
    select 1 from public.mes_customer_assets asset
    where asset.id = asset_id
      and public.customer_portal_has_permission(asset.organization_id, asset.customer_id, 'tools')
  )
);

alter table public.mes_customer_asset_service_events replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'mes_customer_asset_service_events'
  ) then
    alter publication supabase_realtime add table public.mes_customer_asset_service_events;
  end if;
end;
$$;
