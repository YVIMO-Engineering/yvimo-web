-- OTC steps 3 and 4 now link a production order to a remission and an invoice from their
-- registries, the same way step 2 links a registered PO (196). The link lives on the
-- document row of the stage; its folio and file are copied from the registry and kept in
-- sync when the remission or invoice is edited.
--
-- Cancelling a registered remission or invoice unlinks it from the production orders it
-- covered, so they go back to awaiting it. A remission cannot be cancelled while one of those
-- orders already has its invoice linked in Order-to-Cash (cancelling that invoice unlinks it).
--
-- Rows linked before this migration keep their uploaded file and null registry ids.

alter table public.mes_order_to_cash_documents
  add column if not exists remission_id uuid references public.mes_customer_remissions(id) on delete restrict,
  add column if not exists invoice_id uuid references public.mes_customer_invoices(id) on delete restrict;

alter table public.mes_order_to_cash_documents
  drop constraint if exists mes_order_to_cash_documents_remission_stage_check;
alter table public.mes_order_to_cash_documents
  add constraint mes_order_to_cash_documents_remission_stage_check
  check (remission_id is null or stage = 'remission');

alter table public.mes_order_to_cash_documents
  drop constraint if exists mes_order_to_cash_documents_invoice_stage_check;
alter table public.mes_order_to_cash_documents
  add constraint mes_order_to_cash_documents_invoice_stage_check
  check (invoice_id is null or stage = 'invoice');

create index if not exists mes_order_to_cash_documents_remission_idx
  on public.mes_order_to_cash_documents (remission_id)
  where remission_id is not null;

create index if not exists mes_order_to_cash_documents_invoice_idx
  on public.mes_order_to_cash_documents (invoice_id)
  where invoice_id is not null;

-- Runs before validate_order_to_cash_document (triggers fire in name order), so the folio and
-- file it copies go through the same checks as an uploaded document.
create or replace function public.sync_order_to_cash_registry_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_status text;
  v_label text;
begin
  if new.remission_id is not null then
    v_label := 'remission';
    select remission.customer_id, remission.status, remission.remission_folio, remission.file_name, remission.file_path, remission.file_type
    into v_customer_id, v_status, new.folio, new.file_name, new.file_path, new.file_type
    from public.mes_customer_remissions remission
    where remission.id = new.remission_id
      and remission.organization_id = new.organization_id;
    if not found then
      raise exception using errcode = '23503', message = 'This remission does not exist in the organization.';
    end if;
  elsif new.invoice_id is not null then
    v_label := 'invoice';
    select invoice.customer_id, invoice.status, invoice.invoice_folio, invoice.file_name, invoice.file_path, invoice.file_type
    into v_customer_id, v_status, new.folio, new.file_name, new.file_path, new.file_type
    from public.mes_customer_invoices invoice
    where invoice.id = new.invoice_id
      and invoice.organization_id = new.organization_id;
    if not found then
      raise exception using errcode = '23503', message = 'This invoice does not exist in the organization.';
    end if;
  else
    return new;
  end if;

  -- Only a new link is checked; the copied folio and file are refreshed on every write.
  if tg_op = 'INSERT'
    or new.remission_id is distinct from old.remission_id
    or new.invoice_id is distinct from old.invoice_id then
    if v_status <> 'active' then
      raise exception using errcode = '23514', message = format('A cancelled %s cannot be linked.', v_label);
    end if;

    if not exists (
      select 1
      from public.mes_customer_reception_items item
      where item.organization_id = new.organization_id
        and item.production_order_id = new.production_order_id
        and item.customer_id = v_customer_id
    ) then
      raise exception using errcode = '23514', message = format('The %s belongs to a different client than this production order.', v_label);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_order_to_cash_registry_document on public.mes_order_to_cash_documents;
create trigger sync_order_to_cash_registry_document
  before insert or update on public.mes_order_to_cash_documents
  for each row execute function public.sync_order_to_cash_registry_document();

create or replace function public.propagate_remission_to_order_to_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mes_order_to_cash_documents
  set folio = new.remission_folio,
      file_name = new.file_name,
      file_path = new.file_path,
      file_type = new.file_type
  where remission_id = new.id;
  return new;
end;
$$;

drop trigger if exists propagate_remission_to_order_to_cash on public.mes_customer_remissions;
create trigger propagate_remission_to_order_to_cash
  after update of remission_folio, file_name, file_path, file_type on public.mes_customer_remissions
  for each row
  when (
    new.remission_folio is distinct from old.remission_folio
    or new.file_path is distinct from old.file_path
  )
  execute function public.propagate_remission_to_order_to_cash();

create or replace function public.propagate_invoice_to_order_to_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mes_order_to_cash_documents
  set folio = new.invoice_folio,
      file_name = new.file_name,
      file_path = new.file_path,
      file_type = new.file_type
  where invoice_id = new.id;
  return new;
end;
$$;

drop trigger if exists propagate_invoice_to_order_to_cash on public.mes_customer_invoices;
create trigger propagate_invoice_to_order_to_cash
  after update of invoice_folio, file_name, file_path, file_type on public.mes_customer_invoices
  for each row
  when (
    new.invoice_folio is distinct from old.invoice_folio
    or new.file_path is distinct from old.file_path
  )
  execute function public.propagate_invoice_to_order_to_cash();

-- Security definer: members may cancel, but only admins may delete OTC document rows.
create or replace function public.unlink_cancelled_remission_from_order_to_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_number text;
begin
  select production_order.order_number into v_order_number
  from public.mes_order_to_cash_documents document
  join public.mes_order_to_cash_documents invoice_document
    on invoice_document.production_order_id = document.production_order_id
   and invoice_document.stage = 'invoice'
  join public.mes_production_orders production_order on production_order.id = document.production_order_id
  where document.remission_id = new.id
  order by production_order.order_number
  limit 1;

  if found then
    raise exception using errcode = '23514', message = format('Production order %s already has its invoice linked in Order-to-Cash; cancel that invoice before cancelling this remission.', v_order_number);
  end if;

  delete from public.mes_order_to_cash_documents where remission_id = new.id;
  return new;
end;
$$;

drop trigger if exists unlink_cancelled_remission_from_order_to_cash on public.mes_customer_remissions;
create trigger unlink_cancelled_remission_from_order_to_cash
  after update of status on public.mes_customer_remissions
  for each row
  when (new.status = 'cancelled' and old.status <> 'cancelled')
  execute function public.unlink_cancelled_remission_from_order_to_cash();

create or replace function public.unlink_cancelled_invoice_from_order_to_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.mes_order_to_cash_documents where invoice_id = new.id;
  return new;
end;
$$;

drop trigger if exists unlink_cancelled_invoice_from_order_to_cash on public.mes_customer_invoices;
create trigger unlink_cancelled_invoice_from_order_to_cash
  after update of status on public.mes_customer_invoices
  for each row
  when (new.status = 'cancelled' and old.status <> 'cancelled')
  execute function public.unlink_cancelled_invoice_from_order_to_cash();
