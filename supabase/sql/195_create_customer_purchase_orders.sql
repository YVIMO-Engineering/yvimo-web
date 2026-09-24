-- OTC / Purchase Orders: the registry of customer purchase orders.
--
-- Each PO belongs to a client from the Clients module and always carries the file the
-- client sent (usually a PDF). Its lines are the items: each covers one or more Tool IDs
-- and has its own quantity and unit price; the subtotal is derived and the PO total is
-- the sum of its lines. A PO is either active (it can still cover production orders) or
-- closed.
--
-- Header and lines are saved together through save_mes_customer_purchase_order so a PO
-- is never left half-written. It runs as the caller, so the RLS policies below apply.

create table if not exists public.mes_customer_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  customer_id uuid not null references public.mes_customers(id) on delete restrict,
  po_reference text not null check (btrim(po_reference) <> ''),
  revision_number integer not null default 0 check (revision_number >= 0),
  po_date date not null,
  expiration_date date,
  currency text not null default 'USD' check (currency in ('USD', 'MXN', 'EUR')),
  buyer_name text not null default '',
  buyer_email text not null default '',
  requisition_number text not null default '',
  payment_terms text not null default '',
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'closed')),
  closed_at timestamptz,
  file_name text not null,
  file_path text not null,
  file_type text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiration_date is null or expiration_date >= po_date)
);

-- The same reference can exist for two different clients, never twice for one client.
create unique index if not exists mes_customer_purchase_orders_reference_uidx
  on public.mes_customer_purchase_orders (organization_id, customer_id, lower(btrim(po_reference)));

create index if not exists mes_customer_purchase_orders_org_status_idx
  on public.mes_customer_purchase_orders (organization_id, status, po_date desc);

create table if not exists public.mes_customer_purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  purchase_order_id uuid not null references public.mes_customer_purchase_orders(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  description text not null default '',
  tool_ids text[] not null default '{}',
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  subtotal numeric generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  unique (purchase_order_id, line_number)
);

create index if not exists mes_customer_purchase_order_items_order_idx
  on public.mes_customer_purchase_order_items (organization_id, purchase_order_id);

create or replace function public.touch_mes_customer_purchase_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.po_reference := btrim(new.po_reference);
  new.updated_at := now();
  if new.status = 'closed' and (tg_op = 'INSERT' or old.status <> 'closed') then
    new.closed_at := now();
  elsif new.status = 'active' then
    new.closed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists touch_mes_customer_purchase_order on public.mes_customer_purchase_orders;
create trigger touch_mes_customer_purchase_order
  before insert or update on public.mes_customer_purchase_orders
  for each row execute function public.touch_mes_customer_purchase_order();

-- p_purchase_order carries the header columns; p_items is an array of
-- { description, tool_ids, quantity, unit_price } in line order. Passing p_purchase_order_id
-- updates that PO and replaces its lines. On create, p_purchase_order may carry the id the
-- client already used as the file's storage folder.
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

    delete from public.mes_customer_purchase_order_items where purchase_order_id = v_id;
  end if;

  insert into public.mes_customer_purchase_order_items (
    organization_id, purchase_order_id, line_number, description, tool_ids, quantity, unit_price
  )
  select
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
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality);

  return v_id;
end;
$$;

revoke all on function public.save_mes_customer_purchase_order(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.save_mes_customer_purchase_order(uuid, uuid, jsonb, jsonb) to authenticated;

alter table public.mes_customer_purchase_orders enable row level security;
alter table public.mes_customer_purchase_order_items enable row level security;

drop policy if exists "Members can read customer purchase orders" on public.mes_customer_purchase_orders;
create policy "Members can read customer purchase orders"
  on public.mes_customer_purchase_orders for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create customer purchase orders" on public.mes_customer_purchase_orders;
create policy "Members can create customer purchase orders"
  on public.mes_customer_purchase_orders for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update customer purchase orders" on public.mes_customer_purchase_orders;
create policy "Members can update customer purchase orders"
  on public.mes_customer_purchase_orders for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete customer purchase orders" on public.mes_customer_purchase_orders;
create policy "Admins can delete customer purchase orders"
  on public.mes_customer_purchase_orders for delete
  using (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Members can read customer purchase order items" on public.mes_customer_purchase_order_items;
create policy "Members can read customer purchase order items"
  on public.mes_customer_purchase_order_items for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create customer purchase order items" on public.mes_customer_purchase_order_items;
create policy "Members can create customer purchase order items"
  on public.mes_customer_purchase_order_items for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update customer purchase order items" on public.mes_customer_purchase_order_items;
create policy "Members can update customer purchase order items"
  on public.mes_customer_purchase_order_items for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

-- Replacing the lines of a PO deletes them, so members (not only admins) may delete items.
drop policy if exists "Members can delete customer purchase order items" on public.mes_customer_purchase_order_items;
create policy "Members can delete customer purchase order items"
  on public.mes_customer_purchase_order_items for delete
  using (public.is_manufacturing_organization_member(organization_id));

grant select, insert, update, delete on public.mes_customer_purchase_orders to authenticated;
grant select, insert, update, delete on public.mes_customer_purchase_order_items to authenticated;

-- PO files reuse the mes-order-to-cash-documents bucket (and its storage policies, which
-- key on the organization folder) under <organization_id>/purchase-orders/<po_id>/.

do $$
declare
  v_table text;
begin
  foreach v_table in array array['mes_customer_purchase_orders', 'mes_customer_purchase_order_items'] loop
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
