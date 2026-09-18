-- OTC / Order-to-Cash: the administrative trail of each production order.
--
-- A production order enters Order-to-Cash as soon as it is assigned to a customer
-- reception item; that assignment is step 1 and needs no row here. Steps 2 to 4 are
-- the documents linked to the order, one row per stage, each with its folio and the
-- uploaded file: purchase order, then remission, then invoice.
--
-- The trigger keeps the flow honest at the database level: an order must be on a
-- reception before it takes a document, and a stage cannot be linked before the one
-- that precedes it. Replacing an already linked document is an update of its row.

create table if not exists public.mes_order_to_cash_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  production_order_id uuid not null references public.mes_production_orders(id) on delete cascade,
  stage text not null check (stage in ('purchase-order', 'remission', 'invoice')),
  folio text not null check (btrim(folio) <> ''),
  file_name text not null,
  file_path text not null,
  file_type text not null,
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (production_order_id, stage)
);

create index if not exists mes_order_to_cash_documents_org_idx
  on public.mes_order_to_cash_documents (organization_id, production_order_id, stage);

create index if not exists mes_order_to_cash_documents_folio_idx
  on public.mes_order_to_cash_documents (organization_id, lower(folio));

create or replace function public.validate_order_to_cash_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_stage text;
begin
  if not exists (
    select 1
    from public.mes_customer_reception_items item
    where item.organization_id = new.organization_id
      and item.production_order_id = new.production_order_id
  ) then
    raise exception using errcode = '23514', message = 'This production order is not assigned to a customer reception.';
  end if;

  v_previous_stage := case new.stage
    when 'remission' then 'purchase-order'
    when 'invoice' then 'remission'
  end;

  if v_previous_stage is not null and not exists (
    select 1
    from public.mes_order_to_cash_documents document
    where document.production_order_id = new.production_order_id
      and document.stage = v_previous_stage
  ) then
    raise exception using errcode = '23514', message = case new.stage
      when 'remission' then 'Link the purchase order before the remission.'
      else 'Link the remission before the invoice.'
    end;
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

drop trigger if exists validate_order_to_cash_document on public.mes_order_to_cash_documents;
create trigger validate_order_to_cash_document
  before insert or update on public.mes_order_to_cash_documents
  for each row execute function public.validate_order_to_cash_document();

alter table public.mes_order_to_cash_documents enable row level security;

drop policy if exists "Members can read order-to-cash documents" on public.mes_order_to_cash_documents;
create policy "Members can read order-to-cash documents"
  on public.mes_order_to_cash_documents for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create order-to-cash documents" on public.mes_order_to_cash_documents;
create policy "Members can create order-to-cash documents"
  on public.mes_order_to_cash_documents for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update order-to-cash documents" on public.mes_order_to_cash_documents;
create policy "Members can update order-to-cash documents"
  on public.mes_order_to_cash_documents for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete order-to-cash documents" on public.mes_order_to_cash_documents;
create policy "Admins can delete order-to-cash documents"
  on public.mes_order_to_cash_documents for delete
  using (public.is_manufacturing_organization_admin(organization_id));

grant select, insert, update, delete on public.mes_order_to_cash_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mes-order-to-cash-documents',
  'mes-order-to-cash-documents',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Files live under <organization_id>/<production_order_id>/<stage>/.
drop policy if exists "Organization members can read order-to-cash files" on storage.objects;
create policy "Organization members can read order-to-cash files"
  on storage.objects for select
  using (
    bucket_id = 'mes-order-to-cash-documents'
    and public.is_manufacturing_organization_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Organization members can upload order-to-cash files" on storage.objects;
create policy "Organization members can upload order-to-cash files"
  on storage.objects for insert
  with check (
    bucket_id = 'mes-order-to-cash-documents'
    and public.is_manufacturing_organization_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Organization members can delete order-to-cash files" on storage.objects;
create policy "Organization members can delete order-to-cash files"
  on storage.objects for delete
  using (
    bucket_id = 'mes-order-to-cash-documents'
    and public.is_manufacturing_organization_member(((storage.foldername(name))[1])::uuid)
  );

do $$
begin
  execute 'alter table public.mes_order_to_cash_documents replica identity full';
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mes_order_to_cash_documents'
  ) then
    execute 'alter publication supabase_realtime add table public.mes_order_to_cash_documents';
  end if;
end;
$$;
