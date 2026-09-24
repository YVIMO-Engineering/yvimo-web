-- OTC step 2 now links a production order to a PO from the Purchase Orders registry instead
-- of uploading a separate file. The link lives on the purchase-order document row; its folio
-- and file are copied from the registered PO and kept in sync when that PO is edited, so the
-- Order-to-Cash views keep reading them from the document as before.
--
-- Rows linked before this migration keep their uploaded file and a null purchase_order_id.

alter table public.mes_order_to_cash_documents
  add column if not exists purchase_order_id uuid references public.mes_customer_purchase_orders(id) on delete restrict;

alter table public.mes_order_to_cash_documents
  drop constraint if exists mes_order_to_cash_documents_purchase_order_stage_check;
alter table public.mes_order_to_cash_documents
  add constraint mes_order_to_cash_documents_purchase_order_stage_check
  check (purchase_order_id is null or stage = 'purchase-order');

create index if not exists mes_order_to_cash_documents_purchase_order_idx
  on public.mes_order_to_cash_documents (purchase_order_id)
  where purchase_order_id is not null;

-- Runs before validate_order_to_cash_document (triggers fire in name order), so the folio and
-- file it copies go through the same checks as an uploaded document.
create or replace function public.sync_order_to_cash_purchase_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_order public.mes_customer_purchase_orders%rowtype;
begin
  if new.purchase_order_id is null then
    return new;
  end if;

  select * into v_purchase_order
  from public.mes_customer_purchase_orders
  where id = new.purchase_order_id
    and organization_id = new.organization_id;

  if not found then
    raise exception using errcode = '23503', message = 'This purchase order does not exist in the organization.';
  end if;

  -- Only a new link is checked: a PO closed later keeps covering the orders it already covers.
  if tg_op = 'INSERT' or new.purchase_order_id is distinct from old.purchase_order_id then
    if v_purchase_order.status <> 'active' then
      raise exception using errcode = '23514', message = 'Only an active purchase order can be linked.';
    end if;

    if not exists (
      select 1
      from public.mes_customer_reception_items item
      where item.organization_id = new.organization_id
        and item.production_order_id = new.production_order_id
        and item.customer_id = v_purchase_order.customer_id
    ) then
      raise exception using errcode = '23514', message = 'The purchase order belongs to a different client than this production order.';
    end if;
  end if;

  new.folio := v_purchase_order.po_reference;
  new.file_name := v_purchase_order.file_name;
  new.file_path := v_purchase_order.file_path;
  new.file_type := v_purchase_order.file_type;
  return new;
end;
$$;

drop trigger if exists sync_order_to_cash_purchase_order on public.mes_order_to_cash_documents;
create trigger sync_order_to_cash_purchase_order
  before insert or update on public.mes_order_to_cash_documents
  for each row execute function public.sync_order_to_cash_purchase_order();

create or replace function public.propagate_purchase_order_to_order_to_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mes_order_to_cash_documents
  set folio = new.po_reference,
      file_name = new.file_name,
      file_path = new.file_path,
      file_type = new.file_type
  where purchase_order_id = new.id;
  return new;
end;
$$;

drop trigger if exists propagate_purchase_order_to_order_to_cash on public.mes_customer_purchase_orders;
create trigger propagate_purchase_order_to_order_to_cash
  after update of po_reference, file_name, file_path, file_type on public.mes_customer_purchase_orders
  for each row
  when (
    new.po_reference is distinct from old.po_reference
    or new.file_path is distinct from old.file_path
  )
  execute function public.propagate_purchase_order_to_order_to_cash();
