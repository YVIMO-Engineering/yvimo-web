alter table public.mes_production_orders
  add column if not exists quality_check_limits jsonb not null default '{}'::jsonb;

create table if not exists public.mes_quality_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  production_order_id uuid not null references public.mes_production_orders(id) on delete cascade,
  serial_number text not null,
  inspection_name text not null,
  measured_value numeric not null,
  lower_limit numeric,
  upper_limit numeric,
  result text not null check (result in ('ok', 'approach', 'nok')),
  measured_by uuid references auth.users(id) on delete set null default auth.uid(),
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.mes_quality_inspection_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  production_order_id uuid not null references public.mes_production_orders(id) on delete cascade,
  serial_number text not null,
  inspection_name text,
  file_name text not null,
  file_path text not null,
  file_type text not null default 'application/pdf',
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists mes_quality_measurements_order_serial_idx
  on public.mes_quality_measurements (production_order_id, serial_number, inspection_name, measured_at desc);

create index if not exists mes_quality_documents_order_serial_idx
  on public.mes_quality_inspection_documents (production_order_id, serial_number, inspection_name, uploaded_at desc);

alter table public.mes_quality_measurements enable row level security;
alter table public.mes_quality_inspection_documents enable row level security;

drop policy if exists "Members can read MES quality measurements" on public.mes_quality_measurements;
create policy "Members can read MES quality measurements"
  on public.mes_quality_measurements
  for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create MES quality measurements" on public.mes_quality_measurements;
create policy "Members can create MES quality measurements"
  on public.mes_quality_measurements
  for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update MES quality measurements" on public.mes_quality_measurements;
create policy "Members can update MES quality measurements"
  on public.mes_quality_measurements
  for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete MES quality measurements" on public.mes_quality_measurements;
create policy "Admins can delete MES quality measurements"
  on public.mes_quality_measurements
  for delete
  using (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Members can read MES quality documents" on public.mes_quality_inspection_documents;
create policy "Members can read MES quality documents"
  on public.mes_quality_inspection_documents
  for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create MES quality documents" on public.mes_quality_inspection_documents;
create policy "Members can create MES quality documents"
  on public.mes_quality_inspection_documents
  for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update MES quality documents" on public.mes_quality_inspection_documents;
create policy "Members can update MES quality documents"
  on public.mes_quality_inspection_documents
  for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete MES quality documents" on public.mes_quality_inspection_documents;
create policy "Admins can delete MES quality documents"
  on public.mes_quality_inspection_documents
  for delete
  using (public.is_manufacturing_organization_admin(organization_id));

grant select, insert, update, delete on public.mes_quality_measurements to authenticated;
grant select, insert, update, delete on public.mes_quality_inspection_documents to authenticated;
create table if not exists public.mes_quality_serial_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  production_order_id uuid not null references public.mes_production_orders(id) on delete cascade,
  serial_number text not null,
  result text not null check (result in ('ok', 'approach', 'nok')),
  inspected_by uuid references auth.users(id) on delete set null default auth.uid(),
  inspected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (production_order_id, serial_number)
);

create index if not exists mes_quality_serial_inspections_order_idx
  on public.mes_quality_serial_inspections (production_order_id, inspected_at desc);

alter table public.mes_quality_serial_inspections enable row level security;

drop policy if exists "Members can read MES quality serial inspections" on public.mes_quality_serial_inspections;
create policy "Members can read MES quality serial inspections"
  on public.mes_quality_serial_inspections
  for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create MES quality serial inspections" on public.mes_quality_serial_inspections;
create policy "Members can create MES quality serial inspections"
  on public.mes_quality_serial_inspections
  for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update MES quality serial inspections" on public.mes_quality_serial_inspections;
create policy "Members can update MES quality serial inspections"
  on public.mes_quality_serial_inspections
  for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Admins can delete MES quality serial inspections" on public.mes_quality_serial_inspections;
create policy "Admins can delete MES quality serial inspections"
  on public.mes_quality_serial_inspections
  for delete
  using (public.is_manufacturing_organization_admin(organization_id));

grant select, insert, update, delete on public.mes_quality_serial_inspections to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mes-quality-inspection-documents', 'mes-quality-inspection-documents', false, 52428800, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Organization members can read quality inspection documents" on storage.objects;
create policy "Organization members can read quality inspection documents" on storage.objects
  for select
  using (
    bucket_id = 'mes-quality-inspection-documents'
    and exists (
      select 1 from public.manufacturing_organization_members member
      where member.organization_id::text = (storage.foldername(name))[1]
        and member.user_id = auth.uid()
    )
  );

drop policy if exists "Organization members can upload quality inspection documents" on storage.objects;
create policy "Organization members can upload quality inspection documents" on storage.objects
  for insert
  with check (
    bucket_id = 'mes-quality-inspection-documents'
    and exists (
      select 1 from public.manufacturing_organization_members member
      where member.organization_id::text = (storage.foldername(name))[1]
        and member.user_id = auth.uid()
    )
  );

drop policy if exists "Organization members can update quality inspection documents" on storage.objects;
create policy "Organization members can update quality inspection documents" on storage.objects
  for update
  using (
    bucket_id = 'mes-quality-inspection-documents'
    and exists (
      select 1 from public.manufacturing_organization_members member
      where member.organization_id::text = (storage.foldername(name))[1]
        and member.user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'mes-quality-inspection-documents'
    and exists (
      select 1 from public.manufacturing_organization_members member
      where member.organization_id::text = (storage.foldername(name))[1]
        and member.user_id = auth.uid()
    )
  );

drop policy if exists "Organization admins can delete quality inspection documents" on storage.objects;
create policy "Organization admins can delete quality inspection documents" on storage.objects
  for delete
  using (
    bucket_id = 'mes-quality-inspection-documents'
    and exists (
      select 1 from public.manufacturing_organization_members member
      where member.organization_id::text = (storage.foldername(name))[1]
        and member.user_id = auth.uid()
        and member.role in ('owner', 'admin')
    )
  );