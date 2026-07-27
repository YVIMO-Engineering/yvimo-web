alter table public.mes_operator_terminal_events
  drop constraint if exists mes_operator_terminal_events_event_type_check;

alter table public.mes_operator_terminal_events
  add constraint mes_operator_terminal_events_event_type_check
  check (
    event_type in (
      'job-started',
      'job-resumed',
      'job-paused',
      'downtime-started',
      'downtime-ended',
      'production-good',
      'production-scrap',
      'manufacturing-completed',
      'operation-completed',
      'traceability-saved',
      'quality-inspection-saved',
      'quality-inspection-skipped',
      'measurement-corrected',
      'adjustment',
      'inventory-received',
      'inventory-consumed'
    )
  );

create or replace function public.mes_adjust_inventory_quantity(
  p_inventory_item_id uuid,
  p_organization_id uuid,
  p_delta integer
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.mes_inventory_items%rowtype;
  v_section_name text;
  v_work_center_code text;
  v_work_center_name text;
  v_previous_quantity numeric;
  v_new_quantity numeric;
begin
  if p_delta not in (-1, 1) then
    raise exception using errcode = '22023', message = 'Inventory quick adjustments must be exactly +1 or -1.';
  end if;

  select item.*
  into v_item
  from public.mes_inventory_items item
  where item.id = p_inventory_item_id
    and item.organization_id = p_organization_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Inventory item not found.';
  end if;

  v_previous_quantity = v_item.quantity;
  v_new_quantity = v_previous_quantity + p_delta;
  if v_new_quantity < 0 then
    raise exception using errcode = '23514', message = 'Inventory quantity cannot be less than zero.';
  end if;

  update public.mes_inventory_items
  set quantity = v_new_quantity,
      updated_at = now()
  where id = v_item.id;

  select section.name into v_section_name
  from public.mes_inventory_sections section
  where section.id = v_item.section_id;

  select center.code, center.name into v_work_center_code, v_work_center_name
  from public.mes_work_centers center
  where center.id = v_item.work_center_id;

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
  ) values (
    p_organization_id,
    null,
    coalesce(v_work_center_code, ''),
    'INVENTORY',
    case when p_delta > 0 then 'inventory-received' else 'inventory-consumed' end,
    abs(p_delta),
    case when p_delta > 0 then 'Inventory received' else 'Inventory consumed' end,
    format('%s inventory changed from %s to %s.', v_item.title, v_previous_quantity, v_new_quantity),
    jsonb_build_object(
      'inventory_item_id', v_item.id,
      'inventory_item_title', v_item.title,
      'inventory_section_id', v_item.section_id,
      'inventory_section_name', coalesce(v_section_name, ''),
      'work_center_id', v_item.work_center_id,
      'work_center_name', coalesce(v_work_center_name, ''),
      'previous_quantity', v_previous_quantity,
      'new_quantity', v_new_quantity,
      'minimum_quantity', v_item.minimum_quantity,
      'delta', p_delta,
      'source', 'inventory-quick-adjust'
    )
  );

  return v_new_quantity;
end;
$$;

grant execute on function public.mes_adjust_inventory_quantity(uuid, uuid, integer) to authenticated;
