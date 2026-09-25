-- OTC: a production order can now link several POs, remissions and invoices per stage, each
-- covering part of its pieces. Shipments go out in parts, several invoices bill one order, and
-- several POs can feed one order, so every link carries the pieces it covers.
--
-- The pieces of a production order are those assigned to it on customer receptions. A stage is
-- complete when its links cover all of them. The flow can never cover more than the stage
-- before it:
--
--   PO pieces <= order pieces;  remission pieces <= PO pieces;  invoice pieces <= remission pieces
--
-- and a registry record cannot cover more pieces, across all the orders it is linked to, than it
-- holds (the sum of its lines). Raising a link is checked against the upper bounds; lowering or
-- removing one is checked against the stage that follows, so a PO cannot be unlinked while the
-- remissions it feeds still need it. Pieces of an order edited after its links were saved are
-- not re-checked until a link of that stage changes.
--
-- Existing links (one per stage) are backfilled to cover the whole order.

-- One row per linked document instead of one per stage.
alter table public.mes_order_to_cash_documents
  drop constraint if exists mes_order_to_cash_documents_production_order_id_stage_key;

create unique index if not exists mes_order_to_cash_documents_purchase_order_uidx
  on public.mes_order_to_cash_documents (production_order_id, purchase_order_id)
  where purchase_order_id is not null;

create unique index if not exists mes_order_to_cash_documents_remission_uidx
  on public.mes_order_to_cash_documents (production_order_id, remission_id)
  where remission_id is not null;

create unique index if not exists mes_order_to_cash_documents_invoice_uidx
  on public.mes_order_to_cash_documents (production_order_id, invoice_id)
  where invoice_id is not null;

alter table public.mes_order_to_cash_documents
  add column if not exists pieces integer,
  add column if not exists linked_at timestamptz;

-- uploaded_at moves when the registry replaces the file; linked_at keeps the link order.
update public.mes_order_to_cash_documents set linked_at = uploaded_at where linked_at is null;
alter table public.mes_order_to_cash_documents
  alter column linked_at set default now(),
  alter column linked_at set not null;

update public.mes_order_to_cash_documents document
set pieces = coalesce((
  select sum(item.quantity)
  from public.mes_customer_reception_items item
  where item.production_order_id = document.production_order_id
), 1)
where document.pieces is null;

alter table public.mes_order_to_cash_documents
  alter column pieces set not null;

alter table public.mes_order_to_cash_documents
  drop constraint if exists mes_order_to_cash_documents_pieces_check;
alter table public.mes_order_to_cash_documents
  add constraint mes_order_to_cash_documents_pieces_check check (pieces > 0);

-- The previous-stage check moves to check_order_to_cash_coverage, which counts pieces instead
-- of the mere presence of a document.
create or replace function public.validate_order_to_cash_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.mes_customer_reception_items item
    where item.organization_id = new.organization_id
      and item.production_order_id = new.production_order_id
  ) then
    raise exception using errcode = '23514', message = 'This production order is not assigned to a customer reception.';
  end if;

  if tg_op = 'UPDATE' and new.file_path is distinct from old.file_path then
    new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
    new.uploaded_at := now();
  end if;

  new.folio := btrim(new.folio);
  new.updated_at := now();
  return new;
end;
$$;

-- Pieces covered by the links of one stage of a production order.
create or replace function public.order_to_cash_stage_pieces(p_production_order_id uuid, p_stage text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(document.pieces), 0)::integer
  from public.mes_order_to_cash_documents document
  where document.production_order_id = p_production_order_id
    and document.stage = p_stage;
$$;

create or replace function public.check_order_to_cash_coverage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid := coalesce(new.production_order_id, old.production_order_id);
  v_order_number text;
  v_stage_label text;
  v_limit integer;
  v_covered integer;
  v_registry_pieces numeric;
  v_registry_linked integer;
  v_next_stage text;
  v_next_covered integer;
begin
  -- Serialize the link changes of one production order so two sessions cannot both take its
  -- last uncovered pieces.
  select production_order.order_number into v_order_number
  from public.mes_production_orders production_order
  where production_order.id = v_order_id
  for update;

  -- The production order itself is being deleted, along with all its links.
  if not found then
    return null;
  end if;

  -- Growing a stage: it must fit the order (PO) or the stage before it.
  if tg_op = 'INSERT' or (
    tg_op = 'UPDATE' and (
      new.pieces > old.pieces
      or new.purchase_order_id is distinct from old.purchase_order_id
      or new.remission_id is distinct from old.remission_id
      or new.invoice_id is distinct from old.invoice_id
    )
  ) then
    v_stage_label := case new.stage when 'purchase-order' then 'purchase orders' when 'remission' then 'remissions' else 'invoices' end;
    v_covered := public.order_to_cash_stage_pieces(new.production_order_id, new.stage);

    if new.stage = 'purchase-order' then
      select coalesce(sum(item.quantity), 0)::integer into v_limit
      from public.mes_customer_reception_items item
      where item.production_order_id = new.production_order_id;
      if v_covered > v_limit then
        raise exception using errcode = '23514', message = format(
          'Production order %s has %s pieces; its purchase orders would cover %s.',
          v_order_number, v_limit, v_covered
        );
      end if;
    else
      v_limit := public.order_to_cash_stage_pieces(
        new.production_order_id,
        case new.stage when 'remission' then 'purchase-order' else 'remission' end
      );
      if v_covered > v_limit then
        raise exception using errcode = '23514', message = format(
          'Production order %s has %s pieces covered by %s; its %s would cover %s.',
          v_order_number, v_limit,
          case new.stage when 'remission' then 'purchase orders' else 'remissions' end,
          v_stage_label, v_covered
        );
      end if;
    end if;

    -- The registry record cannot cover more pieces than it holds, across all its orders.
    if new.purchase_order_id is not null then
      perform 1 from public.mes_customer_purchase_orders where id = new.purchase_order_id for update;
      select coalesce(sum(item.quantity), 0) into v_registry_pieces
      from public.mes_customer_purchase_order_items item
      where item.purchase_order_id = new.purchase_order_id;
      select coalesce(sum(document.pieces), 0)::integer into v_registry_linked
      from public.mes_order_to_cash_documents document
      where document.purchase_order_id = new.purchase_order_id;
      if v_registry_linked > v_registry_pieces then
        raise exception using errcode = '23514', message = format(
          'PO %s is for %s pieces; its production orders would cover %s.',
          new.folio, v_registry_pieces::text, v_registry_linked
        );
      end if;
    elsif new.remission_id is not null then
      perform 1 from public.mes_customer_remissions where id = new.remission_id for update;
      select coalesce(sum(item.quantity), 0) into v_registry_pieces
      from public.mes_customer_remission_items item
      where item.remission_id = new.remission_id;
      select coalesce(sum(document.pieces), 0)::integer into v_registry_linked
      from public.mes_order_to_cash_documents document
      where document.remission_id = new.remission_id;
      if v_registry_linked > v_registry_pieces then
        raise exception using errcode = '23514', message = format(
          'Remission %s delivers %s pieces; its production orders would cover %s.',
          new.folio, v_registry_pieces::text, v_registry_linked
        );
      end if;
    elsif new.invoice_id is not null then
      perform 1 from public.mes_customer_invoices where id = new.invoice_id for update;
      select coalesce(sum(item.quantity), 0) into v_registry_pieces
      from public.mes_customer_invoice_items item
      where item.invoice_id = new.invoice_id;
      select coalesce(sum(document.pieces), 0)::integer into v_registry_linked
      from public.mes_order_to_cash_documents document
      where document.invoice_id = new.invoice_id;
      if v_registry_linked > v_registry_pieces then
        raise exception using errcode = '23514', message = format(
          'Invoice %s bills %s pieces; its production orders would cover %s.',
          new.folio, v_registry_pieces::text, v_registry_linked
        );
      end if;
    end if;
  end if;

  -- Shrinking a stage: the stage after it must still fit.
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.pieces < old.pieces) then
    v_next_stage := case old.stage when 'purchase-order' then 'remission' when 'remission' then 'invoice' end;
    if v_next_stage is not null then
      v_covered := public.order_to_cash_stage_pieces(old.production_order_id, old.stage);
      v_next_covered := public.order_to_cash_stage_pieces(old.production_order_id, v_next_stage);
      if v_next_covered > v_covered then
        raise exception using errcode = '23514', message = format(
          'Production order %s has %s pieces covered by %s; its %s would only cover %s. Adjust the %s first.',
          v_order_number, v_next_covered,
          case v_next_stage when 'remission' then 'remissions' else 'invoices' end,
          case old.stage when 'purchase-order' then 'purchase orders' else 'remissions' end,
          v_covered,
          case v_next_stage when 'remission' then 'remissions' else 'invoices' end
        );
      end if;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists check_order_to_cash_coverage on public.mes_order_to_cash_documents;
create trigger check_order_to_cash_coverage
  after insert or update or delete on public.mes_order_to_cash_documents
  for each row execute function public.check_order_to_cash_coverage();

-- A registry record edited down below the pieces its production orders already cover would
-- leave the flow inconsistent; the save is refused instead.
create or replace function public.check_order_to_cash_registry_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id uuid;
  v_label text;
  v_folio text;
  v_pieces numeric;
  v_linked integer;
begin
  if tg_table_name = 'mes_customer_purchase_order_items' then
    v_record_id := coalesce(new.purchase_order_id, old.purchase_order_id);
    select po.po_reference, coalesce(sum(item.quantity), 0) into v_folio, v_pieces
    from public.mes_customer_purchase_orders po
    left join public.mes_customer_purchase_order_items item on item.purchase_order_id = po.id
    where po.id = v_record_id
    group by po.po_reference;
    select coalesce(sum(pieces), 0)::integer into v_linked
    from public.mes_order_to_cash_documents where purchase_order_id = v_record_id;
    v_label := 'PO';
  elsif tg_table_name = 'mes_customer_remission_items' then
    v_record_id := coalesce(new.remission_id, old.remission_id);
    select remission.remission_folio, coalesce(sum(item.quantity), 0) into v_folio, v_pieces
    from public.mes_customer_remissions remission
    left join public.mes_customer_remission_items item on item.remission_id = remission.id
    where remission.id = v_record_id
    group by remission.remission_folio;
    select coalesce(sum(pieces), 0)::integer into v_linked
    from public.mes_order_to_cash_documents where remission_id = v_record_id;
    v_label := 'Remission';
  else
    v_record_id := coalesce(new.invoice_id, old.invoice_id);
    select invoice.invoice_folio, coalesce(sum(item.quantity), 0) into v_folio, v_pieces
    from public.mes_customer_invoices invoice
    left join public.mes_customer_invoice_items item on item.invoice_id = invoice.id
    where invoice.id = v_record_id
    group by invoice.invoice_folio;
    select coalesce(sum(pieces), 0)::integer into v_linked
    from public.mes_order_to_cash_documents where invoice_id = v_record_id;
    v_label := 'Invoice';
  end if;

  -- A record deleted with its lines (cascade) is no longer found.
  if v_folio is not null and v_linked > v_pieces then
    raise exception using errcode = '23514', message = format(
      '%s %s covers %s pieces of production orders in Order-to-Cash; it cannot hold fewer (%s). Adjust those links first.',
      v_label, v_folio, v_linked, v_pieces::text
    );
  end if;
  return null;
end;
$$;

-- Deferred to the end of the transaction: the save functions delete and re-insert lines.
drop trigger if exists check_order_to_cash_registry_capacity on public.mes_customer_purchase_order_items;
create constraint trigger check_order_to_cash_registry_capacity
  after insert or update or delete on public.mes_customer_purchase_order_items
  deferrable initially deferred
  for each row execute function public.check_order_to_cash_registry_capacity();

drop trigger if exists check_order_to_cash_registry_capacity on public.mes_customer_remission_items;
create constraint trigger check_order_to_cash_registry_capacity
  after insert or update or delete on public.mes_customer_remission_items
  deferrable initially deferred
  for each row execute function public.check_order_to_cash_registry_capacity();

drop trigger if exists check_order_to_cash_registry_capacity on public.mes_customer_invoice_items;
create constraint trigger check_order_to_cash_registry_capacity
  after insert or update or delete on public.mes_customer_invoice_items
  deferrable initially deferred
  for each row execute function public.check_order_to_cash_registry_capacity();

-- Cancelling a remission unlinks it; check_order_to_cash_coverage now refuses it only when an
-- order's invoices would cover more pieces than the remissions it has left.
create or replace function public.unlink_cancelled_remission_from_order_to_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.mes_order_to_cash_documents where remission_id = new.id;
  return new;
end;
$$;

-- Unlinking a document is the reverse of linking it, so members may do it too. The coverage
-- trigger keeps the flow consistent.
drop policy if exists "Admins can delete order-to-cash documents" on public.mes_order_to_cash_documents;
drop policy if exists "Members can delete order-to-cash documents" on public.mes_order_to_cash_documents;
create policy "Members can delete order-to-cash documents"
  on public.mes_order_to_cash_documents for delete
  using (public.is_manufacturing_organization_member(organization_id));

-- PO usage (197) with several POs per order: the pieces of the order are handed to its PO links
-- in the order they were linked, each taking as many pieces as it covers. A piece beyond the
-- pieces its POs cover uses no PO. Pieces are taken in the order they were produced.
create or replace view public.mes_customer_purchase_order_usage
with (security_invoker = true)
as
with po_links as (
  select
    document.organization_id,
    document.production_order_id,
    document.purchase_order_id,
    sum(document.pieces) over (
      partition by document.production_order_id
      order by document.linked_at, document.id
    ) - document.pieces as first_piece,
    sum(document.pieces) over (
      partition by document.production_order_id
      order by document.linked_at, document.id
    ) as last_piece
  from public.mes_order_to_cash_documents document
  where document.stage = 'purchase-order'
),
pieces as (
  select
    serial.organization_id,
    serial.production_order_id,
    resolved.tool_id,
    row_number() over (partition by serial.production_order_id order by serial.created_at, serial.id) as position
  from public.mes_production_serials serial
  left join lateral (
    select trace.tool_id
    from public.mes_operator_terminal_traceability trace
    where trace.organization_id = serial.organization_id
      and trace.production_order_id = serial.production_order_id
      and nullif(btrim(trace.tool_id), '') is not null
      and (
        trace.id = serial.traceability_id
        or lower(btrim(trace.serial_number)) = lower(btrim(serial.serial_number))
      )
    order by (trace.id = serial.traceability_id) desc, trace.created_at desc
    limit 1
  ) traceability on true
  cross join lateral (
    select nullif(btrim(coalesce(nullif(serial.tool_id, ''), traceability.tool_id)), '') as tool_id
  ) resolved
  where exists (
      select 1
      from public.mes_order_to_cash_documents document
      where document.production_order_id = serial.production_order_id
        and document.purchase_order_id is not null
    )
    and not exists (
      select 1
      from public.mes_production_serial_reworks rework
      where rework.rework_production_serial_id = serial.id
    )
)
select
  po_links.organization_id,
  po_links.purchase_order_id,
  pieces.tool_id,
  count(*)::integer as pieces
from pieces
join po_links
  on po_links.production_order_id = pieces.production_order_id
 and po_links.organization_id = pieces.organization_id
 and pieces.position > po_links.first_piece
 and pieces.position <= po_links.last_piece
where po_links.purchase_order_id is not null
group by po_links.organization_id, po_links.purchase_order_id, pieces.tool_id;

grant select on public.mes_customer_purchase_order_usage to authenticated;
