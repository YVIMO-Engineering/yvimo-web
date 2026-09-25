-- OTC / Invoices: the registry of the invoices billed to customers.
--
-- An invoice belongs to a client and always carries its PDF; the CFDI XML can be attached
-- next to it. Each line bills pieces of one remission line of that client, which in turn
-- delivers a PO line, so every invoiced piece is traceable to its remission and its PO. A
-- remission line cannot be billed twice in the same invoice, and the active invoices of a
-- remission line can never add up to more than the pieces it delivered. A cancelled invoice
-- no longer counts.
--
-- The line prices are the invoice's own (they default to the PO price in the app); the
-- subtotal is derived per line, and tax_rate (IVA, 0.16 by default) applies to the sum.
--
-- Invoice folios are issued by the organization, so they are unique per organization, and
-- so is the fiscal UUID when it is captured.

create table if not exists public.mes_customer_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  customer_id uuid not null references public.mes_customers(id) on delete restrict,
  invoice_folio text not null check (btrim(invoice_folio) <> ''),
  fiscal_uuid text not null default '',
  invoice_date date not null,
  due_date date,
  currency text not null default 'USD' check (currency in ('USD', 'MXN', 'EUR')),
  tax_rate numeric not null default 0.16 check (tax_rate >= 0 and tax_rate <= 1),
  payment_terms text not null default '',
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancelled_at timestamptz,
  file_name text not null,
  file_path text not null,
  file_type text not null,
  xml_file_name text not null default '',
  xml_file_path text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or due_date >= invoice_date),
  check ((xml_file_name = '') = (xml_file_path = ''))
);

create unique index if not exists mes_customer_invoices_folio_uidx
  on public.mes_customer_invoices (organization_id, lower(btrim(invoice_folio)));

create unique index if not exists mes_customer_invoices_fiscal_uuid_uidx
  on public.mes_customer_invoices (organization_id, upper(fiscal_uuid))
  where fiscal_uuid <> '';

create index if not exists mes_customer_invoices_org_status_idx
  on public.mes_customer_invoices (organization_id, status, invoice_date desc);

create table if not exists public.mes_customer_invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  invoice_id uuid not null references public.mes_customer_invoices(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  remission_item_id uuid not null references public.mes_customer_remission_items(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  subtotal numeric generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  constraint mes_customer_invoice_items_line_key unique (invoice_id, line_number),
  constraint mes_customer_invoice_items_remission_item_key unique (invoice_id, remission_item_id)
);

create index if not exists mes_customer_invoice_items_invoice_idx
  on public.mes_customer_invoice_items (organization_id, invoice_id);

create index if not exists mes_customer_invoice_items_remission_item_idx
  on public.mes_customer_invoice_items (remission_item_id);

-- Raises when any line of p_invoice_id, added to the other active invoices of its remission
-- line, would bill more pieces than that line delivered. The invoice's own lines always count,
-- so it also works while a cancelled invoice is being reactivated.
create or replace function public.assert_mes_customer_invoice_within_remission(p_invoice_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_over record;
begin
  select
    remission.remission_folio,
    remission_item.line_number,
    remission_item.quantity,
    billed.invoiced + own.quantity as invoiced
  into v_over
  from public.mes_customer_invoice_items own
  join public.mes_customer_remission_items remission_item on remission_item.id = own.remission_item_id
  join public.mes_customer_remissions remission on remission.id = remission_item.remission_id
  cross join lateral (
    select coalesce(sum(other.quantity), 0) as invoiced
    from public.mes_customer_invoice_items other
    join public.mes_customer_invoices invoice on invoice.id = other.invoice_id
    where other.remission_item_id = remission_item.id
      and invoice.status = 'active'
      and invoice.id <> p_invoice_id
  ) billed
  where own.invoice_id = p_invoice_id
    and billed.invoiced + own.quantity > remission_item.quantity
  order by own.line_number
  limit 1;

  if found then
    raise exception using errcode = '23514', message = format(
      'Remission %s line %s delivered %s pieces; this invoice would bring it to %s invoiced.',
      v_over.remission_folio, v_over.line_number, v_over.quantity::text, v_over.invoiced::text
    );
  end if;
end;
$$;

create or replace function public.touch_mes_customer_invoice()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.invoice_folio := btrim(new.invoice_folio);
  new.fiscal_uuid := upper(btrim(new.fiscal_uuid));
  new.updated_at := now();
  if new.status = 'cancelled' and (tg_op = 'INSERT' or old.status <> 'cancelled') then
    new.cancelled_at := now();
  elsif new.status = 'active' then
    new.cancelled_at := null;
  end if;
  -- Reactivating an invoice bills its pieces again.
  if tg_op = 'UPDATE' and new.status = 'active' and old.status = 'cancelled' then
    perform public.assert_mes_customer_invoice_within_remission(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists touch_mes_customer_invoice on public.mes_customer_invoices;
create trigger touch_mes_customer_invoice
  before insert or update on public.mes_customer_invoices
  for each row execute function public.touch_mes_customer_invoice();

-- A remission that active invoices bill cannot be cancelled: its pieces were billed.
create or replace function public.guard_mes_customer_remission_cancellation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_folio text;
begin
  select invoice.invoice_folio into v_folio
  from public.mes_customer_remission_items own
  join public.mes_customer_invoice_items billed on billed.remission_item_id = own.id
  join public.mes_customer_invoices invoice on invoice.id = billed.invoice_id and invoice.status = 'active'
  where own.remission_id = new.id
  order by invoice.invoice_date, invoice.invoice_folio
  limit 1;

  if found then
    raise exception using errcode = '23514', message = format('Invoice %s bills this remission; cancel it before cancelling the remission.', v_folio);
  end if;
  return new;
end;
$$;

drop trigger if exists guard_mes_customer_remission_cancellation on public.mes_customer_remissions;
create trigger guard_mes_customer_remission_cancellation
  before update of status on public.mes_customer_remissions
  for each row
  when (new.status = 'cancelled' and old.status <> 'cancelled')
  execute function public.guard_mes_customer_remission_cancellation();

-- p_invoice carries the header columns; p_items is an array of
-- { remission_item_id, quantity, unit_price } in line order. Passing p_invoice_id updates that
-- invoice; its lines are matched by remission line. On create, p_invoice may carry the id the
-- client already used as the files' storage folder.
create or replace function public.save_mes_customer_invoice(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_invoice jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_customer_id uuid := (p_invoice ->> 'customer_id')::uuid;
  v_status text;
  v_line integer;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '23514', message = 'An invoice needs at least one item.';
  end if;

  select item.ordinality::integer into v_line
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
  where coalesce((item.value ->> 'quantity')::numeric, 0) <= 0
     or coalesce((item.value ->> 'unit_price')::numeric, -1) < 0
  order by item.ordinality
  limit 1;
  if found then
    raise exception using errcode = '23514', message = format('Item %s needs a quantity greater than zero and a valid unit price.', v_line);
  end if;

  select item.ordinality::integer into v_line
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
  where exists (
    select 1
    from jsonb_array_elements(p_items) with ordinality as earlier(value, ordinality)
    where earlier.ordinality < item.ordinality
      and earlier.value ->> 'remission_item_id' = item.value ->> 'remission_item_id'
  )
  order by item.ordinality
  limit 1;
  if found then
    raise exception using errcode = '23514', message = format('Item %s repeats a remission line already on this invoice.', v_line);
  end if;

  select item.ordinality::integer into v_line
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
  left join public.mes_customer_remission_items remission_item
    on remission_item.id = nullif(item.value ->> 'remission_item_id', '')::uuid
   and remission_item.organization_id = p_organization_id
  left join public.mes_customer_remissions remission on remission.id = remission_item.remission_id
  where remission.id is null
     or remission.customer_id is distinct from v_customer_id
     or remission.status <> 'active'
  order by item.ordinality
  limit 1;
  if found then
    raise exception using errcode = '23514', message = format('Item %s is not a line of an active remission of this client.', v_line);
  end if;

  -- Serialize saves that bill the same remission lines, so two invoices cannot both take the
  -- last pieces of a line.
  perform 1
  from public.mes_customer_remission_items remission_item
  where remission_item.id in (select (item.value ->> 'remission_item_id')::uuid from jsonb_array_elements(p_items) as item(value))
  order by remission_item.id
  for update;

  if p_invoice_id is null then
    insert into public.mes_customer_invoices (
      id, organization_id, customer_id, invoice_folio, fiscal_uuid, invoice_date, due_date, currency, tax_rate,
      payment_terms, notes, file_name, file_path, file_type, xml_file_name, xml_file_path
    )
    values (
      coalesce(nullif(p_invoice ->> 'id', '')::uuid, gen_random_uuid()),
      p_organization_id,
      v_customer_id,
      p_invoice ->> 'invoice_folio',
      coalesce(p_invoice ->> 'fiscal_uuid', ''),
      (p_invoice ->> 'invoice_date')::date,
      nullif(p_invoice ->> 'due_date', '')::date,
      coalesce(p_invoice ->> 'currency', 'USD'),
      coalesce((p_invoice ->> 'tax_rate')::numeric, 0.16),
      coalesce(p_invoice ->> 'payment_terms', ''),
      coalesce(p_invoice ->> 'notes', ''),
      p_invoice ->> 'file_name',
      p_invoice ->> 'file_path',
      p_invoice ->> 'file_type',
      coalesce(p_invoice ->> 'xml_file_name', ''),
      coalesce(p_invoice ->> 'xml_file_path', '')
    )
    returning id, status into v_id, v_status;
  else
    update public.mes_customer_invoices
    set customer_id = v_customer_id,
        invoice_folio = p_invoice ->> 'invoice_folio',
        fiscal_uuid = coalesce(p_invoice ->> 'fiscal_uuid', ''),
        invoice_date = (p_invoice ->> 'invoice_date')::date,
        due_date = nullif(p_invoice ->> 'due_date', '')::date,
        currency = coalesce(p_invoice ->> 'currency', 'USD'),
        tax_rate = coalesce((p_invoice ->> 'tax_rate')::numeric, 0.16),
        payment_terms = coalesce(p_invoice ->> 'payment_terms', ''),
        notes = coalesce(p_invoice ->> 'notes', ''),
        file_name = p_invoice ->> 'file_name',
        file_path = p_invoice ->> 'file_path',
        file_type = p_invoice ->> 'file_type',
        xml_file_name = coalesce(p_invoice ->> 'xml_file_name', ''),
        xml_file_path = coalesce(p_invoice ->> 'xml_file_path', '')
    where id = p_invoice_id
      and organization_id = p_organization_id
    returning id, status into v_id, v_status;

    if v_id is null then
      raise exception using errcode = 'P0002', message = 'This invoice no longer exists.';
    end if;

    delete from public.mes_customer_invoice_items own
    where own.invoice_id = v_id
      and not exists (
        select 1
        from jsonb_array_elements(p_items) as item(value)
        where (item.value ->> 'remission_item_id')::uuid = own.remission_item_id
      );

    -- Move the kept lines out of the way so they can take their new line numbers.
    update public.mes_customer_invoice_items
    set line_number = line_number + 1000000
    where invoice_id = v_id;
  end if;

  insert into public.mes_customer_invoice_items (organization_id, invoice_id, line_number, remission_item_id, quantity, unit_price)
  select
    p_organization_id,
    v_id,
    item.ordinality::integer,
    (item.value ->> 'remission_item_id')::uuid,
    (item.value ->> 'quantity')::numeric,
    (item.value ->> 'unit_price')::numeric
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
  on conflict on constraint mes_customer_invoice_items_remission_item_key do update
  set line_number = excluded.line_number,
      quantity = excluded.quantity,
      unit_price = excluded.unit_price;

  if v_status = 'active' then
    perform public.assert_mes_customer_invoice_within_remission(v_id);
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_mes_customer_invoice(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.save_mes_customer_invoice(uuid, uuid, jsonb, jsonb) to authenticated;

alter table public.mes_customer_invoices enable row level security;
alter table public.mes_customer_invoice_items enable row level security;

drop policy if exists "Members can read customer invoices" on public.mes_customer_invoices;
create policy "Members can read customer invoices"
  on public.mes_customer_invoices for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create customer invoices" on public.mes_customer_invoices;
create policy "Members can create customer invoices"
  on public.mes_customer_invoices for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update customer invoices" on public.mes_customer_invoices;
create policy "Members can update customer invoices"
  on public.mes_customer_invoices for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete customer invoices" on public.mes_customer_invoices;
create policy "Admins can delete customer invoices"
  on public.mes_customer_invoices for delete
  using (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Members can read customer invoice items" on public.mes_customer_invoice_items;
create policy "Members can read customer invoice items"
  on public.mes_customer_invoice_items for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create customer invoice items" on public.mes_customer_invoice_items;
create policy "Members can create customer invoice items"
  on public.mes_customer_invoice_items for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update customer invoice items" on public.mes_customer_invoice_items;
create policy "Members can update customer invoice items"
  on public.mes_customer_invoice_items for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

-- Editing an invoice removes the lines it no longer has, so members may delete items.
drop policy if exists "Members can delete customer invoice items" on public.mes_customer_invoice_items;
create policy "Members can delete customer invoice items"
  on public.mes_customer_invoice_items for delete
  using (public.is_manufacturing_organization_member(organization_id));

grant select, insert, update, delete on public.mes_customer_invoices to authenticated;
grant select, insert, update, delete on public.mes_customer_invoice_items to authenticated;

-- Invoice files reuse the mes-order-to-cash-documents bucket under
-- <organization_id>/invoices/<invoice_id>/; the bucket now also takes the CFDI XML.
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif', 'application/xml', 'text/xml']
where id = 'mes-order-to-cash-documents';

do $$
declare
  v_table text;
begin
  foreach v_table in array array['mes_customer_invoices', 'mes_customer_invoice_items'] loop
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
