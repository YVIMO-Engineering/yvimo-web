create sequence if not exists public.mes_supplier_transfer_number_seq;
create sequence if not exists public.mes_supplier_voucher_number_seq;

create table if not exists public.mes_supplier_capabilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  name text not null,
  color text not null default '#ff8a1f' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.mes_suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  name text not null,
  contact_name text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  approved_status text not null default 'pending-approval'
    check (approved_status in ('approved', 'pending-approval', 'inactive')),
  logo_path text,
  fiscal_document_name text,
  fiscal_document_path text,
  banking_document_name text,
  banking_document_path text,
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.mes_supplier_capability_links (
  supplier_id uuid not null references public.mes_suppliers(id) on delete cascade,
  capability_id uuid not null references public.mes_supplier_capabilities(id) on delete cascade,
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (supplier_id, capability_id)
);

create table if not exists public.mes_supplier_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  transfer_number text not null,
  production_order_id uuid references public.mes_production_orders(id) on delete set null,
  production_order_number text not null,
  supplier_id uuid not null references public.mes_suppliers(id) on delete restrict,
  external_process text not null,
  part_number text not null default '',
  lot_serial text not null default '',
  quantity_sent integer not null default 0 check (quantity_sent >= 0),
  quantity_received integer not null default 0 check (quantity_received >= 0),
  quantity_accepted integer not null default 0 check (quantity_accepted >= 0),
  quantity_rejected integer not null default 0 check (quantity_rejected >= 0),
  status text not null default 'ready-for-checkout'
    check (status in ('ready-for-checkout', 'sent-to-supplier', 'documents-pending', 'completed', 'discrepancy')),
  expected_return_date date not null,
  required_documents text[] not null default '{}',
  checked_in_documents text[] not null default '{}',
  received_documents text[] not null default '{}',
  notes text not null default '',
  checkout_notes text not null default '',
  received_notes text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, transfer_number)
);

create table if not exists public.mes_supplier_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  transfer_id uuid not null references public.mes_supplier_transfers(id) on delete cascade,
  document_type text not null
    check (document_type in ('certificate', 'inspection-report', 'process-report', 'packing-slip', 'other')),
  file_name text not null,
  file_path text not null,
  file_type text not null default 'application/pdf',
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  uploaded_by_label text not null default '',
  approval_status text not null default 'pending-review'
    check (approval_status in ('pending-review', 'approved', 'rejected')),
  file_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mes_supplier_vouchers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  voucher_number text not null,
  transfer_id uuid not null references public.mes_supplier_transfers(id) on delete cascade,
  direction text not null check (direction in ('outbound', 'inbound')),
  quantity_sent integer not null default 0 check (quantity_sent >= 0),
  quantity_received integer check (quantity_received is null or quantity_received >= 0),
  quantity_accepted integer check (quantity_accepted is null or quantity_accepted >= 0),
  quantity_rejected integer check (quantity_rejected is null or quantity_rejected >= 0),
  documents_received text[] not null default '{}',
  processed_by uuid references auth.users(id) on delete set null default auth.uid(),
  processed_by_label text not null default '',
  processed_at timestamptz not null default now(),
  attachment_name text,
  attachment_path text,
  attachment_type text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (organization_id, voucher_number)
);

create or replace function public.set_mes_supplier_transfer_number()
returns trigger
language plpgsql
as $$
begin
  if new.transfer_number is null or btrim(new.transfer_number) = '' then
    new.transfer_number := 'ST-' || to_char(current_date, 'YYMMDD') || '-' || lpad(nextval('public.mes_supplier_transfer_number_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

create or replace function public.set_mes_supplier_voucher_number()
returns trigger
language plpgsql
as $$
begin
  if new.voucher_number is null or btrim(new.voucher_number) = '' then
    new.voucher_number := case when new.direction = 'inbound' then 'IV-' else 'OV-' end
      || to_char(current_date, 'YYMMDD') || '-' || lpad(nextval('public.mes_supplier_voucher_number_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists set_mes_supplier_transfer_number on public.mes_supplier_transfers;
create trigger set_mes_supplier_transfer_number
before insert on public.mes_supplier_transfers
for each row execute function public.set_mes_supplier_transfer_number();

drop trigger if exists set_mes_supplier_voucher_number on public.mes_supplier_vouchers;
create trigger set_mes_supplier_voucher_number
before insert on public.mes_supplier_vouchers
for each row execute function public.set_mes_supplier_voucher_number();

create or replace function public.refresh_mes_supplier_transfer_documents(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_received text[];
begin
  select coalesce(array_agg(distinct document_type), '{}')
  into v_received
  from (
    select unnest(checked_in_documents) as document_type
    from public.mes_supplier_transfers
    where id = p_transfer_id
    union all
    select document_type from public.mes_supplier_documents
    where transfer_id = p_transfer_id
  ) received;

  update public.mes_supplier_transfers
  set
    received_documents = v_received,
    status = case
      when status in ('documents-pending', 'discrepancy')
        and quantity_accepted = quantity_sent
        and quantity_received = quantity_accepted + quantity_rejected
        and required_documents <@ v_received
      then 'completed'
      else status
    end,
    updated_at = now()
  where id = p_transfer_id;
end;
$$;

create or replace function public.sync_mes_supplier_transfer_documents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_mes_supplier_transfer_documents(coalesce(new.transfer_id, old.transfer_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_mes_supplier_transfer_documents on public.mes_supplier_documents;
create trigger sync_mes_supplier_transfer_documents
after insert or update or delete on public.mes_supplier_documents
for each row execute function public.sync_mes_supplier_transfer_documents();

create or replace function public.mes_supplier_checkout(
  p_organization_id uuid,
  p_transfer_id uuid,
  p_quantity_sent integer,
  p_notes text default '',
  p_processed_by_label text default '',
  p_attachment_name text default null,
  p_attachment_path text default null,
  p_attachment_type text default null
)
returns public.mes_supplier_vouchers
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transfer public.mes_supplier_transfers;
  v_voucher public.mes_supplier_vouchers;
begin
  select * into v_transfer
  from public.mes_supplier_transfers
  where id = p_transfer_id and organization_id = p_organization_id
  for update;

  if not found then raise exception 'Supplier transfer not found'; end if;
  if v_transfer.status <> 'ready-for-checkout' then raise exception 'Transfer is not ready for checkout'; end if;
  if p_quantity_sent <= 0 then raise exception 'Quantity sent must be greater than zero'; end if;

  update public.mes_supplier_transfers
  set quantity_sent = p_quantity_sent, status = 'sent-to-supplier', checkout_notes = coalesce(p_notes, ''), updated_at = now()
  where id = p_transfer_id;

  insert into public.mes_supplier_vouchers (
    organization_id, voucher_number, transfer_id, direction, quantity_sent,
    processed_by_label, attachment_name, attachment_path, attachment_type, notes
  ) values (
    p_organization_id, '', p_transfer_id, 'outbound', p_quantity_sent,
    coalesce(p_processed_by_label, ''), p_attachment_name, p_attachment_path, p_attachment_type, coalesce(p_notes, '')
  ) returning * into v_voucher;

  return v_voucher;
end;
$$;

create or replace function public.mes_supplier_checkin(
  p_organization_id uuid,
  p_transfer_id uuid,
  p_quantity_received integer,
  p_quantity_accepted integer,
  p_quantity_rejected integer,
  p_documents_received text[] default '{}',
  p_notes text default '',
  p_processed_by_label text default '',
  p_attachment_name text default null,
  p_attachment_path text default null,
  p_attachment_type text default null
)
returns public.mes_supplier_vouchers
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transfer public.mes_supplier_transfers;
  v_voucher public.mes_supplier_vouchers;
  v_total_received integer;
  v_total_accepted integer;
  v_total_rejected integer;
  v_received_documents text[];
  v_status text;
begin
  select * into v_transfer
  from public.mes_supplier_transfers
  where id = p_transfer_id and organization_id = p_organization_id
  for update;

  if not found then raise exception 'Supplier transfer not found'; end if;
  if v_transfer.status not in ('sent-to-supplier', 'discrepancy') then raise exception 'Transfer is not available for check in'; end if;
  if p_quantity_received < 0 or p_quantity_accepted < 0 or p_quantity_rejected < 0 then raise exception 'Quantities cannot be negative'; end if;
  if p_quantity_accepted + p_quantity_rejected <> p_quantity_received then raise exception 'Accepted plus rejected must equal received'; end if;

  v_total_received := v_transfer.quantity_received + p_quantity_received;
  v_total_accepted := v_transfer.quantity_accepted + p_quantity_accepted;
  v_total_rejected := v_transfer.quantity_rejected + p_quantity_rejected;
  select array_agg(distinct value) into v_received_documents
  from unnest(v_transfer.checked_in_documents || coalesce(p_documents_received, '{}')) value;
  v_received_documents := coalesce(v_received_documents, '{}');

  v_status := case
    when v_total_accepted <> v_transfer.quantity_sent or v_total_received <> v_total_accepted + v_total_rejected then 'discrepancy'
    when not (v_transfer.required_documents <@ v_received_documents) then 'documents-pending'
    else 'completed'
  end;

  update public.mes_supplier_transfers
  set
    quantity_received = v_total_received,
    quantity_accepted = v_total_accepted,
    quantity_rejected = v_total_rejected,
    checked_in_documents = v_received_documents,
    received_documents = v_received_documents,
    status = v_status,
    received_notes = coalesce(p_notes, ''),
    updated_at = now()
  where id = p_transfer_id;

  insert into public.mes_supplier_vouchers (
    organization_id, voucher_number, transfer_id, direction, quantity_sent,
    quantity_received, quantity_accepted, quantity_rejected, documents_received,
    processed_by_label, attachment_name, attachment_path, attachment_type, notes
  ) values (
    p_organization_id, '', p_transfer_id, 'inbound', v_transfer.quantity_sent,
    p_quantity_received, p_quantity_accepted, p_quantity_rejected, coalesce(p_documents_received, '{}'),
    coalesce(p_processed_by_label, ''), p_attachment_name, p_attachment_path, p_attachment_type, coalesce(p_notes, '')
  ) returning * into v_voucher;

  return v_voucher;
end;
$$;

alter table public.mes_supplier_capabilities enable row level security;
alter table public.mes_suppliers enable row level security;
alter table public.mes_supplier_capability_links enable row level security;
alter table public.mes_supplier_transfers enable row level security;
alter table public.mes_supplier_documents enable row level security;
alter table public.mes_supplier_vouchers enable row level security;

grant select, insert, update, delete on public.mes_supplier_capabilities to authenticated;
grant select, insert, update, delete on public.mes_suppliers to authenticated;
grant select, insert, update, delete on public.mes_supplier_capability_links to authenticated;
grant select, insert, update, delete on public.mes_supplier_transfers to authenticated;
grant select, insert, update, delete on public.mes_supplier_documents to authenticated;
grant select, insert, update, delete on public.mes_supplier_vouchers to authenticated;
grant usage, select on sequence public.mes_supplier_transfer_number_seq to authenticated;
grant usage, select on sequence public.mes_supplier_voucher_number_seq to authenticated;
grant execute on function public.mes_supplier_checkout(uuid, uuid, integer, text, text, text, text, text) to authenticated;
grant execute on function public.mes_supplier_checkin(uuid, uuid, integer, integer, integer, text[], text, text, text, text, text) to authenticated;

revoke all on function public.refresh_mes_supplier_transfer_documents(uuid) from public, anon, authenticated;
revoke all on function public.sync_mes_supplier_transfer_documents() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'mes_supplier_capabilities', 'mes_suppliers', 'mes_supplier_capability_links',
    'mes_supplier_transfers', 'mes_supplier_documents', 'mes_supplier_vouchers'
  ] loop
    execute format('drop policy if exists "Members can read %1$s" on public.%1$I', table_name);
    execute format('create policy "Members can read %1$s" on public.%1$I for select using (public.is_manufacturing_organization_member(organization_id))', table_name);
    execute format('drop policy if exists "Members can create %1$s" on public.%1$I', table_name);
    execute format('create policy "Members can create %1$s" on public.%1$I for insert with check (public.is_manufacturing_organization_member(organization_id))', table_name);
    execute format('drop policy if exists "Members can update %1$s" on public.%1$I', table_name);
    execute format('create policy "Members can update %1$s" on public.%1$I for update using (public.is_manufacturing_organization_member(organization_id)) with check (public.is_manufacturing_organization_member(organization_id))', table_name);
    execute format('drop policy if exists "Admins can delete %1$s" on public.%1$I', table_name);
    execute format('create policy "Admins can delete %1$s" on public.%1$I for delete using (public.is_manufacturing_organization_admin(organization_id))', table_name);
  end loop;
end;
$$;

create index if not exists mes_suppliers_organization_status_idx on public.mes_suppliers (organization_id, approved_status, name);
create index if not exists mes_supplier_capabilities_organization_name_idx on public.mes_supplier_capabilities (organization_id, name);
create index if not exists mes_supplier_transfers_organization_status_idx on public.mes_supplier_transfers (organization_id, status, expected_return_date);
create index if not exists mes_supplier_transfers_supplier_idx on public.mes_supplier_transfers (supplier_id, created_at desc);
create index if not exists mes_supplier_documents_transfer_idx on public.mes_supplier_documents (transfer_id, created_at desc);
create index if not exists mes_supplier_vouchers_transfer_idx on public.mes_supplier_vouchers (transfer_id, processed_at desc);

drop trigger if exists set_mes_supplier_capabilities_updated_at on public.mes_supplier_capabilities;
create trigger set_mes_supplier_capabilities_updated_at before update on public.mes_supplier_capabilities
for each row execute function public.set_updated_at();
drop trigger if exists set_mes_suppliers_updated_at on public.mes_suppliers;
create trigger set_mes_suppliers_updated_at before update on public.mes_suppliers
for each row execute function public.set_updated_at();
drop trigger if exists set_mes_supplier_transfers_updated_at on public.mes_supplier_transfers;
create trigger set_mes_supplier_transfers_updated_at before update on public.mes_supplier_transfers
for each row execute function public.set_updated_at();
drop trigger if exists set_mes_supplier_documents_updated_at on public.mes_supplier_documents;
create trigger set_mes_supplier_documents_updated_at before update on public.mes_supplier_documents
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mes-supplier-files',
  'mes-supplier-files',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Organization members can read supplier files" on storage.objects;
create policy "Organization members can read supplier files" on storage.objects
for select using (
  bucket_id = 'mes-supplier-files'
  and exists (
    select 1 from public.manufacturing_organization_members member
    where member.organization_id::text = (storage.foldername(name))[1]
      and member.user_id = auth.uid()
  )
);

drop policy if exists "Organization members can upload supplier files" on storage.objects;
create policy "Organization members can upload supplier files" on storage.objects
for insert with check (
  bucket_id = 'mes-supplier-files'
  and exists (
    select 1 from public.manufacturing_organization_members member
    where member.organization_id::text = (storage.foldername(name))[1]
      and member.user_id = auth.uid()
  )
);

drop policy if exists "Organization members can update supplier files" on storage.objects;
create policy "Organization members can update supplier files" on storage.objects
for update using (
  bucket_id = 'mes-supplier-files'
  and exists (
    select 1 from public.manufacturing_organization_members member
    where member.organization_id::text = (storage.foldername(name))[1]
      and member.user_id = auth.uid()
  )
) with check (
  bucket_id = 'mes-supplier-files'
  and exists (
    select 1 from public.manufacturing_organization_members member
    where member.organization_id::text = (storage.foldername(name))[1]
      and member.user_id = auth.uid()
  )
);

drop policy if exists "Organization admins can delete supplier files" on storage.objects;
create policy "Organization admins can delete supplier files" on storage.objects
for delete using (
  bucket_id = 'mes-supplier-files'
  and exists (
    select 1 from public.manufacturing_organization_members member
    where member.organization_id::text = (storage.foldername(name))[1]
      and member.user_id = auth.uid()
      and member.role in ('Owner', 'Admin')
  )
);
