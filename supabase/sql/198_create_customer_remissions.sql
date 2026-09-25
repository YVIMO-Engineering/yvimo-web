-- OTC / Remissions: the registry of the remissions issued when pieces are delivered.
--
-- A remission belongs to a client and always carries its file (usually a PDF). Each line
-- delivers pieces of one purchase order line of that client, so a single remission can mix
-- lines of several POs and every piece remissioned is traceable to the PO that covers it.
-- A PO line cannot be remissioned twice in the same remission, and the active remissions of
-- a PO line can never add up to more than the PO quantity. A cancelled remission no longer
-- counts.
--
-- Remission folios are issued by the organization, so they are unique per organization.
--
-- Header and lines are saved together through save_mes_customer_remission, which runs as the
-- caller so the RLS policies below apply. It also checks the invoices that bill the
-- remission, so it needs the invoice tables from 199 at run time.

create table if not exists public.mes_customer_remissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  customer_id uuid not null references public.mes_customers(id) on delete restrict,
  remission_folio text not null check (btrim(remission_folio) <> ''),
  remission_date date not null,
  ship_to text not null default '',
  received_by text not null default '',
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancelled_at timestamptz,
  file_name text not null,
  file_path text not null,
  file_type text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mes_customer_remissions_folio_uidx
  on public.mes_customer_remissions (organization_id, lower(btrim(remission_folio)));

create index if not exists mes_customer_remissions_org_status_idx
  on public.mes_customer_remissions (organization_id, status, remission_date desc);

create table if not exists public.mes_customer_remission_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  remission_id uuid not null references public.mes_customer_remissions(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  purchase_order_item_id uuid not null references public.mes_customer_purchase_order_items(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  created_at timestamptz not null default now(),
  constraint mes_customer_remission_items_line_key unique (remission_id, line_number),
  constraint mes_customer_remission_items_po_item_key unique (remission_id, purchase_order_item_id)
);

create index if not exists mes_customer_remission_items_remission_idx
  on public.mes_customer_remission_items (organization_id, remission_id);

create index if not exists mes_customer_remission_items_po_item_idx
  on public.mes_customer_remission_items (purchase_order_item_id);

-- Raises when any line of p_remission_id, added to the other active remissions of its PO line,
-- would exceed the PO quantity. The remission's own lines always count, so it also works while
-- a cancelled remission is being reactivated.
create or replace function public.assert_mes_customer_remission_within_po(p_remission_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_over record;
begin
  select
    po.po_reference,
    po_item.line_number,
    po_item.quantity,
    delivered.remissioned + own.quantity as remissioned
  into v_over
  from public.mes_customer_remission_items own
  join public.mes_customer_purchase_order_items po_item on po_item.id = own.purchase_order_item_id
  join public.mes_customer_purchase_orders po on po.id = po_item.purchase_order_id
  cross join lateral (
    select coalesce(sum(other.quantity), 0) as remissioned
    from public.mes_customer_remission_items other
    join public.mes_customer_remissions remission on remission.id = other.remission_id
    where other.purchase_order_item_id = po_item.id
      and remission.status = 'active'
      and remission.id <> p_remission_id
  ) delivered
  where own.remission_id = p_remission_id
    and delivered.remissioned + own.quantity > po_item.quantity
  order by own.line_number
  limit 1;

  if found then
    raise exception using errcode = '23514', message = format(
      'PO %s line %s is for %s pieces; this remission would bring it to %s remissioned.',
      v_over.po_reference, v_over.line_number, v_over.quantity::text, v_over.remissioned::text
    );
  end if;
end;
$$;

create or replace function public.touch_mes_customer_remission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.remission_folio := btrim(new.remission_folio);
  new.updated_at := now();
  if new.status = 'cancelled' and (tg_op = 'INSERT' or old.status <> 'cancelled') then
    new.cancelled_at := now();
  elsif new.status = 'active' then
    new.cancelled_at := null;
  end if;
  -- Reactivating a remission counts its pieces against the PO again.
  if tg_op = 'UPDATE' and new.status = 'active' and old.status = 'cancelled' then
    perform public.assert_mes_customer_remission_within_po(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists touch_mes_customer_remission on public.mes_customer_remissions;
create trigger touch_mes_customer_remission
  before insert or update on public.mes_customer_remissions
  for each row execute function public.touch_mes_customer_remission();

-- p_remission carries the header columns; p_items is an array of
-- { purchase_order_item_id, quantity } in line order. Passing p_remission_id updates that
-- remission; its lines are matched by PO line, so a line that stays keeps its id (and the
-- invoice lines that bill it). On create, p_remission may carry the id the client already
-- used as the file's storage folder.
create or replace function public.save_mes_customer_remission(
  p_organization_id uuid,
  p_remission_id uuid,
  p_remission jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_customer_id uuid := (p_remission ->> 'customer_id')::uuid;
  v_previous_customer_id uuid;
  v_status text;
  v_line integer;
  v_reference text;
  v_quantity numeric;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '23514', message = 'A remission needs at least one item.';
  end if;

  select item.ordinality::integer into v_line
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
  where coalesce((item.value ->> 'quantity')::numeric, 0) <= 0
  order by item.ordinality
  limit 1;
  if found then
    raise exception using errcode = '23514', message = format('Item %s needs a quantity greater than zero.', v_line);
  end if;

  select item.ordinality::integer into v_line
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
  where exists (
    select 1
    from jsonb_array_elements(p_items) with ordinality as earlier(value, ordinality)
    where earlier.ordinality < item.ordinality
      and earlier.value ->> 'purchase_order_item_id' = item.value ->> 'purchase_order_item_id'
  )
  order by item.ordinality
  limit 1;
  if found then
    raise exception using errcode = '23514', message = format('Item %s repeats a PO line already on this remission.', v_line);
  end if;

  select item.ordinality::integer into v_line
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
  left join public.mes_customer_purchase_order_items po_item
    on po_item.id = nullif(item.value ->> 'purchase_order_item_id', '')::uuid
   and po_item.organization_id = p_organization_id
  left join public.mes_customer_purchase_orders po on po.id = po_item.purchase_order_id
  where po.id is null or po.customer_id is distinct from v_customer_id
  order by item.ordinality
  limit 1;
  if found then
    raise exception using errcode = '23514', message = format('Item %s is not a line of a purchase order of this client.', v_line);
  end if;

  -- Serialize saves that touch the same PO lines, so two remissions cannot both take the
  -- last pieces of a line.
  perform 1
  from public.mes_customer_purchase_order_items po_item
  where po_item.id in (select (item.value ->> 'purchase_order_item_id')::uuid from jsonb_array_elements(p_items) as item(value))
  order by po_item.id
  for update;

  if p_remission_id is null then
    insert into public.mes_customer_remissions (
      id, organization_id, customer_id, remission_folio, remission_date, ship_to, received_by, notes, file_name, file_path, file_type
    )
    values (
      coalesce(nullif(p_remission ->> 'id', '')::uuid, gen_random_uuid()),
      p_organization_id,
      v_customer_id,
      p_remission ->> 'remission_folio',
      (p_remission ->> 'remission_date')::date,
      coalesce(p_remission ->> 'ship_to', ''),
      coalesce(p_remission ->> 'received_by', ''),
      coalesce(p_remission ->> 'notes', ''),
      p_remission ->> 'file_name',
      p_remission ->> 'file_path',
      p_remission ->> 'file_type'
    )
    returning id, status into v_id, v_status;
  else
    select customer_id into v_previous_customer_id
    from public.mes_customer_remissions
    where id = p_remission_id
      and organization_id = p_organization_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'This remission no longer exists.';
    end if;

    update public.mes_customer_remissions
    set customer_id = v_customer_id,
        remission_folio = p_remission ->> 'remission_folio',
        remission_date = (p_remission ->> 'remission_date')::date,
        ship_to = coalesce(p_remission ->> 'ship_to', ''),
        received_by = coalesce(p_remission ->> 'received_by', ''),
        notes = coalesce(p_remission ->> 'notes', ''),
        file_name = p_remission ->> 'file_name',
        file_path = p_remission ->> 'file_path',
        file_type = p_remission ->> 'file_type'
    where id = p_remission_id
    returning id, status into v_id, v_status;

    -- A line an invoice already bills (even a cancelled invoice) must stay on the remission.
    select own.line_number into v_line
    from public.mes_customer_remission_items own
    where own.remission_id = v_id
      and not exists (
        select 1
        from jsonb_array_elements(p_items) as item(value)
        where (item.value ->> 'purchase_order_item_id')::uuid = own.purchase_order_item_id
      )
      and exists (select 1 from public.mes_customer_invoice_items billed where billed.remission_item_id = own.id)
    order by own.line_number
    limit 1;
    if found then
      raise exception using errcode = '23503', message = format('Line %s cannot be removed: an invoice already bills it.', v_line);
    end if;

    delete from public.mes_customer_remission_items own
    where own.remission_id = v_id
      and not exists (
        select 1
        from jsonb_array_elements(p_items) as item(value)
        where (item.value ->> 'purchase_order_item_id')::uuid = own.purchase_order_item_id
      );

    -- Move the kept lines out of the way so they can take their new line numbers.
    update public.mes_customer_remission_items
    set line_number = line_number + 1000000
    where remission_id = v_id;
  end if;

  -- A PO that is no longer active cannot take new remission lines; lines it already had stay.
  select po.po_reference into v_reference
  from jsonb_array_elements(p_items) as item(value)
  join public.mes_customer_purchase_order_items po_item on po_item.id = (item.value ->> 'purchase_order_item_id')::uuid
  join public.mes_customer_purchase_orders po on po.id = po_item.purchase_order_id
  where po.status <> 'active'
    and not exists (
      select 1
      from public.mes_customer_remission_items own
      where own.remission_id = v_id
        and own.purchase_order_item_id = po_item.id
    )
  limit 1;
  if found then
    raise exception using errcode = '23514', message = format('PO %s is closed, so it cannot take new remission lines.', v_reference);
  end if;

  insert into public.mes_customer_remission_items (organization_id, remission_id, line_number, purchase_order_item_id, quantity)
  select
    p_organization_id,
    v_id,
    item.ordinality::integer,
    (item.value ->> 'purchase_order_item_id')::uuid,
    (item.value ->> 'quantity')::numeric
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
  on conflict on constraint mes_customer_remission_items_po_item_key do update
  set line_number = excluded.line_number,
      quantity = excluded.quantity;

  if v_status = 'active' then
    perform public.assert_mes_customer_remission_within_po(v_id);
  end if;

  -- The invoices that bill this remission must still fit it.
  if v_previous_customer_id is distinct from v_customer_id and exists (
    select 1
    from public.mes_customer_invoice_items billed
    join public.mes_customer_remission_items own on own.id = billed.remission_item_id
    where own.remission_id = v_id
  ) then
    raise exception using errcode = '23514', message = 'This remission is already invoiced, so its client cannot change.';
  end if;

  select own.line_number, sum(billed.quantity) as invoiced into v_line, v_quantity
  from public.mes_customer_remission_items own
  join public.mes_customer_invoice_items billed on billed.remission_item_id = own.id
  join public.mes_customer_invoices invoice on invoice.id = billed.invoice_id and invoice.status = 'active'
  where own.remission_id = v_id
  group by own.id, own.line_number, own.quantity
  having sum(billed.quantity) > own.quantity
  order by own.line_number
  limit 1;
  if found then
    raise exception using errcode = '23514', message = format('Line %s cannot go below the %s pieces already invoiced.', v_line, v_quantity::text);
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_mes_customer_remission(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.save_mes_customer_remission(uuid, uuid, jsonb, jsonb) to authenticated;

alter table public.mes_customer_remissions enable row level security;
alter table public.mes_customer_remission_items enable row level security;

drop policy if exists "Members can read customer remissions" on public.mes_customer_remissions;
create policy "Members can read customer remissions"
  on public.mes_customer_remissions for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create customer remissions" on public.mes_customer_remissions;
create policy "Members can create customer remissions"
  on public.mes_customer_remissions for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update customer remissions" on public.mes_customer_remissions;
create policy "Members can update customer remissions"
  on public.mes_customer_remissions for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete customer remissions" on public.mes_customer_remissions;
create policy "Admins can delete customer remissions"
  on public.mes_customer_remissions for delete
  using (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Members can read customer remission items" on public.mes_customer_remission_items;
create policy "Members can read customer remission items"
  on public.mes_customer_remission_items for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create customer remission items" on public.mes_customer_remission_items;
create policy "Members can create customer remission items"
  on public.mes_customer_remission_items for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update customer remission items" on public.mes_customer_remission_items;
create policy "Members can update customer remission items"
  on public.mes_customer_remission_items for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

-- Editing a remission removes the lines it no longer has, so members may delete items.
drop policy if exists "Members can delete customer remission items" on public.mes_customer_remission_items;
create policy "Members can delete customer remission items"
  on public.mes_customer_remission_items for delete
  using (public.is_manufacturing_organization_member(organization_id));

grant select, insert, update, delete on public.mes_customer_remissions to authenticated;
grant select, insert, update, delete on public.mes_customer_remission_items to authenticated;

-- Remission files reuse the mes-order-to-cash-documents bucket under
-- <organization_id>/remissions/<remission_id>/.

do $$
declare
  v_table text;
begin
  foreach v_table in array array['mes_customer_remissions', 'mes_customer_remission_items'] loop
    execute format('alter table public.%I replica identity full', v_table);
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
