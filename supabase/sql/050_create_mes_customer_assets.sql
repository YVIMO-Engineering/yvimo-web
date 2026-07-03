create table if not exists public.mes_customer_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  customer_id uuid not null references public.mes_customers(id) on delete restrict,
  source_type text not null default 'manual' check (source_type in ('manual', 'production-order')),
  source_production_order_id uuid references public.mes_production_orders(id) on delete set null,
  last_production_order_id uuid references public.mes_production_orders(id) on delete set null,
  asset_type text not null,
  serial_number text not null check (length(btrim(serial_number)) > 0),
  part_number text,
  description text not null default '',
  manufacturer text,
  family_category text,
  current_location text,
  custodian_name text,
  custodian_role text,
  status text not null default 'available'
    check (status in ('available', 'in-custody', 'in-service', 'awaiting-return', 'delivered', 'maintenance', 'inspection', 'retired')),
  estimated_life_percent numeric check (estimated_life_percent between 0 and 100),
  last_inspection_at timestamptz,
  last_service_at timestamptz,
  service_count integer not null default 0 check (service_count >= 0),
  internal_notes text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mes_customer_assets_customer_serial_uidx
  on public.mes_customer_assets (organization_id, customer_id, lower(btrim(serial_number)));

create index if not exists mes_customer_assets_organization_customer_idx
  on public.mes_customer_assets (organization_id, customer_id, status, updated_at desc);

create table if not exists public.mes_customer_asset_service_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  asset_id uuid not null references public.mes_customer_assets(id) on delete cascade,
  production_order_id uuid references public.mes_production_orders(id) on delete set null,
  source_type text not null default 'manual' check (source_type in ('manual', 'production-order')),
  service_type text not null,
  result text not null default 'completed'
    check (result in ('completed', 'ok', 'approach', 'nok', 'scrap')),
  service_date timestamptz not null default now(),
  remaining_life_percent numeric check (remaining_life_percent between 0 and 100),
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index if not exists mes_customer_asset_service_order_uidx
  on public.mes_customer_asset_service_events (asset_id, production_order_id)
  where production_order_id is not null;

create index if not exists mes_customer_asset_service_asset_date_idx
  on public.mes_customer_asset_service_events (asset_id, service_date desc);

create table if not exists public.mes_customer_asset_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  asset_id uuid not null references public.mes_customer_assets(id) on delete cascade,
  attachment_type text not null check (attachment_type in ('photo', 'document')),
  storage_bucket text not null default 'mes-customer-assets',
  file_name text not null,
  file_path text not null,
  file_type text not null,
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists mes_customer_asset_attachments_asset_idx
  on public.mes_customer_asset_attachments (asset_id, attachment_type, created_at desc);

create unique index if not exists mes_customer_asset_attachments_file_uidx
  on public.mes_customer_asset_attachments (asset_id, storage_bucket, file_path);

alter table public.mes_customer_assets enable row level security;
alter table public.mes_customer_asset_service_events enable row level security;
alter table public.mes_customer_asset_attachments enable row level security;

grant select, insert, update, delete on public.mes_customer_assets to authenticated;
grant select, insert, update, delete on public.mes_customer_asset_service_events to authenticated;
grant select, insert, update, delete on public.mes_customer_asset_attachments to authenticated;

drop policy if exists "Members can read customer assets" on public.mes_customer_assets;
create policy "Members can read customer assets"
  on public.mes_customer_assets for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create customer assets" on public.mes_customer_assets;
create policy "Members can create customer assets"
  on public.mes_customer_assets for insert
  with check (
    public.is_manufacturing_organization_member(organization_id)
    and exists (
      select 1 from public.mes_customers customer
      where customer.id = mes_customer_assets.customer_id
        and customer.organization_id = mes_customer_assets.organization_id
    )
  );

drop policy if exists "Members can update customer assets" on public.mes_customer_assets;
create policy "Members can update customer assets"
  on public.mes_customer_assets for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (
    public.is_manufacturing_organization_member(organization_id)
    and exists (
      select 1 from public.mes_customers customer
      where customer.id = mes_customer_assets.customer_id
        and customer.organization_id = mes_customer_assets.organization_id
    )
  );

drop policy if exists "Admins can delete customer assets" on public.mes_customer_assets;
create policy "Admins can delete customer assets"
  on public.mes_customer_assets for delete
  using (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Members can read customer asset services" on public.mes_customer_asset_service_events;
create policy "Members can read customer asset services"
  on public.mes_customer_asset_service_events for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create customer asset services" on public.mes_customer_asset_service_events;
create policy "Members can create customer asset services"
  on public.mes_customer_asset_service_events for insert
  with check (
    public.is_manufacturing_organization_member(organization_id)
    and exists (
      select 1 from public.mes_customer_assets asset
      where asset.id = mes_customer_asset_service_events.asset_id
        and asset.organization_id = mes_customer_asset_service_events.organization_id
    )
  );

drop policy if exists "Members can update customer asset services" on public.mes_customer_asset_service_events;
create policy "Members can update customer asset services"
  on public.mes_customer_asset_service_events for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete customer asset services" on public.mes_customer_asset_service_events;
create policy "Admins can delete customer asset services"
  on public.mes_customer_asset_service_events for delete
  using (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Members can read customer asset attachments" on public.mes_customer_asset_attachments;
create policy "Members can read customer asset attachments"
  on public.mes_customer_asset_attachments for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create customer asset attachments" on public.mes_customer_asset_attachments;
create policy "Members can create customer asset attachments"
  on public.mes_customer_asset_attachments for insert
  with check (
    public.is_manufacturing_organization_member(organization_id)
    and exists (
      select 1 from public.mes_customer_assets asset
      where asset.id = mes_customer_asset_attachments.asset_id
        and asset.organization_id = mes_customer_asset_attachments.organization_id
    )
  );

drop policy if exists "Admins can delete customer asset attachments" on public.mes_customer_asset_attachments;
create policy "Admins can delete customer asset attachments"
  on public.mes_customer_asset_attachments for delete
  using (public.is_manufacturing_organization_admin(organization_id));

drop trigger if exists set_mes_customer_assets_updated_at on public.mes_customer_assets;
create trigger set_mes_customer_assets_updated_at
before update on public.mes_customer_assets
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mes-customer-assets',
  'mes-customer-assets',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Organization members can read customer asset files" on storage.objects;
create policy "Organization members can read customer asset files" on storage.objects
  for select
  using (
    bucket_id = 'mes-customer-assets'
    and exists (
      select 1 from public.manufacturing_organization_members member
      where member.organization_id::text = (storage.foldername(name))[1]
        and member.user_id = auth.uid()
    )
  );

drop policy if exists "Organization members can upload customer asset files" on storage.objects;
create policy "Organization members can upload customer asset files" on storage.objects
  for insert
  with check (
    bucket_id = 'mes-customer-assets'
    and exists (
      select 1 from public.manufacturing_organization_members member
      where member.organization_id::text = (storage.foldername(name))[1]
        and member.user_id = auth.uid()
    )
  );

drop policy if exists "Organization admins can delete customer asset files" on storage.objects;
create policy "Organization admins can delete customer asset files" on storage.objects
  for delete
  using (
    bucket_id = 'mes-customer-assets'
    and exists (
      select 1 from public.manufacturing_organization_members member
      where member.organization_id::text = (storage.foldername(name))[1]
        and member.user_id = auth.uid()
        and lower(member.role) in ('owner', 'admin')
    )
  );

create or replace function public.sync_mes_completed_order_assets(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.mes_production_orders%rowtype;
  v_serial record;
  v_asset_id uuid;
  v_event_id uuid;
  v_result text;
  v_inspected_at timestamptz;
begin
  select *
    into v_order
  from public.mes_production_orders
  where id = p_order_id
    and status = 'completed'
    and customer_id is not null;

  if not found then
    return;
  end if;

  for v_serial in
    select serial.serial_number, serial.reported_at, trace.template_id
    from public.mes_production_serials serial
    left join public.mes_operator_terminal_traceability trace
      on trace.id = serial.traceability_id
    where serial.production_order_id = v_order.id
      and serial.result = 'good'
    order by serial.piece_sequence
  loop
    v_asset_id = null;
    insert into public.mes_customer_assets (
      organization_id,
      customer_id,
      source_type,
      source_production_order_id,
      last_production_order_id,
      asset_type,
      serial_number,
      part_number,
      description,
      family_category,
      current_location,
      status
    )
    values (
      v_order.organization_id,
      v_order.customer_id,
      'production-order',
      v_order.id,
      v_order.id,
      coalesce(nullif(initcap(v_order.piece_type), ''), 'Manufactured Item'),
      btrim(v_serial.serial_number),
      nullif(v_order.part_number, ''),
      v_order.part_name,
      nullif(initcap(v_order.piece_type), ''),
      'YVIMO',
      'available'
    )
    on conflict do nothing
    returning id into v_asset_id;

    if v_asset_id is null then
      select asset.id
        into v_asset_id
      from public.mes_customer_assets asset
      where asset.organization_id = v_order.organization_id
        and asset.customer_id = v_order.customer_id
        and lower(btrim(asset.serial_number)) = lower(btrim(v_serial.serial_number))
      limit 1;

      update public.mes_customer_assets
      set last_production_order_id = v_order.id,
          part_number = coalesce(nullif(v_order.part_number, ''), part_number),
          description = coalesce(nullif(v_order.part_name, ''), description),
          status = 'available'
      where id = v_asset_id;
    end if;

    select coalesce(inspection.result, 'completed'), inspection.inspected_at
      into v_result, v_inspected_at
    from (select 1) seed
    left join public.mes_quality_serial_inspections inspection
      on inspection.production_order_id = v_order.id
      and lower(btrim(inspection.serial_number)) = lower(btrim(v_serial.serial_number))
    limit 1;

    v_event_id = null;
    insert into public.mes_customer_asset_service_events (
      organization_id,
      asset_id,
      production_order_id,
      source_type,
      service_type,
      result,
      service_date,
      notes
    )
    values (
      v_order.organization_id,
      v_asset_id,
      v_order.id,
      'production-order',
      case
        when v_serial.template_id = 'sharpening' then 'Sharpening'
        else 'Manufacturing / Processing'
      end,
      v_result,
      coalesce(v_order.updated_at, now()),
      format('Completed through Production Order %s.', v_order.order_number)
    )
    on conflict do nothing
    returning id into v_event_id;

    if v_event_id is not null then
      update public.mes_customer_assets
      set last_service_at = coalesce(v_order.updated_at, now()),
          last_inspection_at = coalesce(v_inspected_at, last_inspection_at),
          service_count = service_count + 1
      where id = v_asset_id;
    end if;

    insert into public.mes_customer_asset_attachments (
      organization_id,
      asset_id,
      attachment_type,
      storage_bucket,
      file_name,
      file_path,
      file_type,
      uploaded_by,
      created_at
    )
    select
      document.organization_id,
      v_asset_id,
      'document',
      'mes-quality-inspection-documents',
      document.file_name,
      document.file_path,
      document.file_type,
      document.uploaded_by,
      document.created_at
    from public.mes_quality_inspection_documents document
    where document.production_order_id = v_order.id
      and lower(btrim(document.serial_number)) = lower(btrim(v_serial.serial_number))
    on conflict do nothing;
  end loop;
end;
$$;

revoke all on function public.sync_mes_completed_order_assets(uuid) from public;

create or replace function public.sync_mes_completed_order_assets_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed'
    and old.status is distinct from new.status then
    perform public.sync_mes_completed_order_assets(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_mes_completed_order_assets on public.mes_production_orders;
create trigger sync_mes_completed_order_assets
after update of status on public.mes_production_orders
for each row execute function public.sync_mes_completed_order_assets_trigger();

do $$
declare
  v_order record;
begin
  for v_order in
    select id
    from public.mes_production_orders
    where status = 'completed'
      and customer_id is not null
  loop
    perform public.sync_mes_completed_order_assets(v_order.id);
  end loop;
end;
$$;

create or replace function public.link_mes_quality_document_to_customer_asset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
begin
  select asset.id
    into v_asset_id
  from public.mes_production_orders production_order
  join public.mes_customer_assets asset
    on asset.organization_id = production_order.organization_id
    and asset.customer_id = production_order.customer_id
    and lower(btrim(asset.serial_number)) = lower(btrim(new.serial_number))
  where production_order.id = new.production_order_id
    and production_order.status = 'completed'
  limit 1;

  if v_asset_id is null then
    return new;
  end if;

  insert into public.mes_customer_asset_attachments (
    organization_id,
    asset_id,
    attachment_type,
    storage_bucket,
    file_name,
    file_path,
    file_type,
    uploaded_by,
    created_at
  )
  values (
    new.organization_id,
    v_asset_id,
    'document',
    'mes-quality-inspection-documents',
    new.file_name,
    new.file_path,
    new.file_type,
    new.uploaded_by,
    new.created_at
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists link_mes_quality_document_to_customer_asset on public.mes_quality_inspection_documents;
create trigger link_mes_quality_document_to_customer_asset
after insert on public.mes_quality_inspection_documents
for each row execute function public.link_mes_quality_document_to_customer_asset();