-- Remission lines now point at PO lines, so editing a PO can no longer delete and re-create
-- its lines. save_mes_customer_purchase_order matches each item by the id it sends: a line
-- that stays keeps its id (and its remissions), a line without id is new, and a line left
-- out is removed unless a remission already covers it. A line cannot go below the pieces its
-- active remissions already delivered.
--
-- p_items is an array of { id?, description, tool_ids, quantity, unit_price } in line order.

create or replace function public.save_mes_customer_purchase_order(
  p_organization_id uuid,
  p_purchase_order_id uuid,
  p_purchase_order jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_line integer;
  v_quantity numeric;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '23514', message = 'A purchase order needs at least one item.';
  end if;

  if p_purchase_order_id is null then
    insert into public.mes_customer_purchase_orders (
      id, organization_id, customer_id, po_reference, revision_number, po_date, expiration_date, currency,
      buyer_name, buyer_email, requisition_number, payment_terms, notes, file_name, file_path, file_type
    )
    values (
      coalesce(nullif(p_purchase_order ->> 'id', '')::uuid, gen_random_uuid()),
      p_organization_id,
      (p_purchase_order ->> 'customer_id')::uuid,
      p_purchase_order ->> 'po_reference',
      coalesce((p_purchase_order ->> 'revision_number')::integer, 0),
      (p_purchase_order ->> 'po_date')::date,
      nullif(p_purchase_order ->> 'expiration_date', '')::date,
      coalesce(p_purchase_order ->> 'currency', 'USD'),
      coalesce(p_purchase_order ->> 'buyer_name', ''),
      coalesce(p_purchase_order ->> 'buyer_email', ''),
      coalesce(p_purchase_order ->> 'requisition_number', ''),
      coalesce(p_purchase_order ->> 'payment_terms', ''),
      coalesce(p_purchase_order ->> 'notes', ''),
      p_purchase_order ->> 'file_name',
      p_purchase_order ->> 'file_path',
      p_purchase_order ->> 'file_type'
    )
    returning id into v_id;
  else
    -- A client change would leave the remissions of this PO pointing at another client's PO.
    if exists (
      select 1
      from public.mes_customer_purchase_orders po
      where po.id = p_purchase_order_id
        and po.customer_id is distinct from (p_purchase_order ->> 'customer_id')::uuid
        and exists (
          select 1
          from public.mes_customer_purchase_order_items po_item
          join public.mes_customer_remission_items remission_item on remission_item.purchase_order_item_id = po_item.id
          where po_item.purchase_order_id = po.id
        )
    ) then
      raise exception using errcode = '23514', message = 'This purchase order is already remissioned, so its client cannot change.';
    end if;

    update public.mes_customer_purchase_orders
    set customer_id = (p_purchase_order ->> 'customer_id')::uuid,
        po_reference = p_purchase_order ->> 'po_reference',
        revision_number = coalesce((p_purchase_order ->> 'revision_number')::integer, 0),
        po_date = (p_purchase_order ->> 'po_date')::date,
        expiration_date = nullif(p_purchase_order ->> 'expiration_date', '')::date,
        currency = coalesce(p_purchase_order ->> 'currency', 'USD'),
        buyer_name = coalesce(p_purchase_order ->> 'buyer_name', ''),
        buyer_email = coalesce(p_purchase_order ->> 'buyer_email', ''),
        requisition_number = coalesce(p_purchase_order ->> 'requisition_number', ''),
        payment_terms = coalesce(p_purchase_order ->> 'payment_terms', ''),
        notes = coalesce(p_purchase_order ->> 'notes', ''),
        file_name = p_purchase_order ->> 'file_name',
        file_path = p_purchase_order ->> 'file_path',
        file_type = p_purchase_order ->> 'file_type'
    where id = p_purchase_order_id
      and organization_id = p_organization_id
    returning id into v_id;

    if v_id is null then
      raise exception using errcode = 'P0002', message = 'This purchase order no longer exists.';
    end if;

    -- A line a remission covers (even a cancelled remission) must stay on the PO.
    select po_item.line_number into v_line
    from public.mes_customer_purchase_order_items po_item
    where po_item.purchase_order_id = v_id
      and not exists (
        select 1
        from jsonb_array_elements(p_items) as item(value)
        where nullif(item.value ->> 'id', '')::uuid = po_item.id
      )
      and exists (select 1 from public.mes_customer_remission_items remission_item where remission_item.purchase_order_item_id = po_item.id)
    order by po_item.line_number
    limit 1;
    if found then
      raise exception using errcode = '23503', message = format('Line %s cannot be removed: a remission already covers it.', v_line);
    end if;

    delete from public.mes_customer_purchase_order_items po_item
    where po_item.purchase_order_id = v_id
      and not exists (
        select 1
        from jsonb_array_elements(p_items) as item(value)
        where nullif(item.value ->> 'id', '')::uuid = po_item.id
      );

    -- Move the kept lines out of the way so they can take their new line numbers.
    update public.mes_customer_purchase_order_items
    set line_number = line_number + 1000000
    where purchase_order_id = v_id;
  end if;

  insert into public.mes_customer_purchase_order_items (
    id, organization_id, purchase_order_id, line_number, description, tool_ids, quantity, unit_price
  )
  select
    coalesce(existing.id, gen_random_uuid()),
    p_organization_id,
    v_id,
    item.ordinality::integer,
    coalesce(btrim(item.value ->> 'description'), ''),
    coalesce(
      array(
        select btrim(tool.value)
        from jsonb_array_elements_text(coalesce(item.value -> 'tool_ids', '[]'::jsonb)) with ordinality as tool(value, position)
        where btrim(tool.value) <> ''
        group by btrim(tool.value)
        order by min(tool.position)
      ),
      '{}'
    ),
    (item.value ->> 'quantity')::numeric,
    (item.value ->> 'unit_price')::numeric
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
  -- An id that is not a line of this PO is treated as a new line.
  left join public.mes_customer_purchase_order_items existing
    on existing.id = nullif(item.value ->> 'id', '')::uuid
   and existing.purchase_order_id = v_id
  on conflict (id) do update
  set line_number = excluded.line_number,
      description = excluded.description,
      tool_ids = excluded.tool_ids,
      quantity = excluded.quantity,
      unit_price = excluded.unit_price;

  select po_item.line_number, delivered.remissioned into v_line, v_quantity
  from public.mes_customer_purchase_order_items po_item
  cross join lateral (
    select coalesce(sum(remission_item.quantity), 0) as remissioned
    from public.mes_customer_remission_items remission_item
    join public.mes_customer_remissions remission on remission.id = remission_item.remission_id and remission.status = 'active'
    where remission_item.purchase_order_item_id = po_item.id
  ) delivered
  where po_item.purchase_order_id = v_id
    and delivered.remissioned > po_item.quantity
  order by po_item.line_number
  limit 1;
  if found then
    raise exception using errcode = '23514', message = format('Line %s cannot go below the %s pieces already remissioned.', v_line, v_quantity::text);
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_mes_customer_purchase_order(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.save_mes_customer_purchase_order(uuid, uuid, jsonb, jsonb) to authenticated;
