create or replace function public.sync_mes_good_serial_asset(p_serial_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_serial public.mes_production_serials%rowtype;
  v_order public.mes_production_orders%rowtype;
  v_asset_id uuid;
  v_event_id uuid;
  v_tool_definition_id uuid;
  v_template_id text;
begin
  select * into v_serial
  from public.mes_production_serials
  where id = p_serial_id and result = 'good';

  if not found then return; end if;

  select * into v_order
  from public.mes_production_orders
  where id = v_serial.production_order_id and customer_id is not null;

  if not found then return; end if;

  select tool.id into v_tool_definition_id
  from public.mes_customer_tool_ids tool
  where tool.organization_id = v_order.organization_id
    and lower(btrim(tool.tool_id)) = lower(btrim(v_serial.tool_id))
  limit 1;

  select trace.template_id into v_template_id
  from public.mes_operator_terminal_traceability trace
  where trace.id = v_serial.traceability_id;

  insert into public.mes_customer_assets (
    organization_id, customer_id, source_type, source_production_order_id,
    last_production_order_id, tool_definition_id, asset_type, serial_number,
    part_number, description, family_category, current_location, status
  ) values (
    v_order.organization_id, v_order.customer_id, 'production-order', v_order.id,
    v_order.id, v_tool_definition_id,
    coalesce(nullif(initcap(v_order.piece_type), ''), nullif(v_order.part_name, ''), 'Manufactured Item'),
    btrim(v_serial.serial_number), nullif(v_order.part_number, ''), v_order.part_name,
    nullif(initcap(v_order.piece_type), ''), 'YVIMO', 'available'
  )
  on conflict do nothing
  returning id into v_asset_id;

  if v_asset_id is null then
    select asset.id into v_asset_id
    from public.mes_customer_assets asset
    where asset.organization_id = v_order.organization_id
      and asset.customer_id = v_order.customer_id
      and lower(btrim(asset.serial_number)) = lower(btrim(v_serial.serial_number))
    limit 1;

    update public.mes_customer_assets
    set last_production_order_id = v_order.id,
        tool_definition_id = coalesce(tool_definition_id, v_tool_definition_id),
        asset_type = coalesce((select tool.part_type from public.mes_customer_tool_ids tool where tool.id = coalesce(tool_definition_id, v_tool_definition_id)), asset_type),
        part_number = coalesce(nullif(v_order.part_number, ''), part_number),
        description = coalesce(nullif(v_order.part_name, ''), description),
        status = 'available'
    where id = v_asset_id;
  end if;

  insert into public.mes_customer_asset_service_events (
    organization_id, asset_id, production_order_id, source_type,
    service_type, result, service_date, notes
  ) values (
    v_order.organization_id, v_asset_id, v_order.id, 'production-order',
    'Sharpening',
    'completed', coalesce(v_serial.reported_at, now()),
    format('Reported live through Production Order %s.', v_order.order_number)
  )
  on conflict do nothing
  returning id into v_event_id;

  update public.mes_customer_assets
  set last_service_at = greatest(coalesce(last_service_at, '-infinity'::timestamptz), coalesce(v_serial.reported_at, now())),
      service_count = service_count + case when v_event_id is null then 0 else 1 end
  where id = v_asset_id;
end;
$$;

revoke all on function public.sync_mes_good_serial_asset(uuid) from public;

create or replace function public.sync_mes_good_serial_asset_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.result = 'good' and (tg_op = 'INSERT' or old.result is distinct from new.result) then
    perform public.sync_mes_good_serial_asset(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_mes_good_serial_asset on public.mes_production_serials;
create trigger sync_mes_good_serial_asset
after insert or update of result on public.mes_production_serials
for each row execute function public.sync_mes_good_serial_asset_trigger();

-- Quality evidence may arrive before the Production Order is completed now that
-- the customer Asset exists as soon as the serial is reported good.
create or replace function public.link_mes_quality_document_to_customer_asset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
begin
  select asset.id into v_asset_id
  from public.mes_production_orders production_order
  join public.mes_customer_assets asset
    on asset.organization_id = production_order.organization_id
    and asset.customer_id = production_order.customer_id
    and lower(btrim(asset.serial_number)) = lower(btrim(new.serial_number))
  where production_order.id = new.production_order_id
  limit 1;

  if v_asset_id is null then return new; end if;

  insert into public.mes_customer_asset_attachments (
    organization_id, asset_id, attachment_type, storage_bucket,
    file_name, file_path, file_type, uploaded_by, created_at
  ) values (
    new.organization_id, v_asset_id, 'document', 'mes-quality-inspection-documents',
    new.file_name, new.file_path, new.file_type, new.uploaded_by, new.created_at
  ) on conflict do nothing;
  return new;
end;
$$;

-- Backfill any good serials not yet represented. Safe because both Asset and
-- service-event uniqueness constraints make this operation idempotent.
do $$
declare v_serial record;
begin
  for v_serial in select id from public.mes_production_serials where result = 'good' loop
    perform public.sync_mes_good_serial_asset(v_serial.id);
  end loop;
end;
$$;
