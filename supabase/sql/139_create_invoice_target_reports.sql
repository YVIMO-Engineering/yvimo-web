create table if not exists public.mes_invoice_target_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  work_center_code text not null,
  report_year integer not null check (report_year between 2000 and 2200),
  report_month integer not null check (report_month between 1 and 12),
  currency text not null default 'MXN',
  net_invoicing numeric(18, 2) not null check (net_invoicing >= 0),
  gross_invoicing numeric(18, 2) not null check (gross_invoicing >= 0),
  file_name text not null,
  file_path text not null,
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, work_center_code, report_year, report_month)
);

create index if not exists mes_invoice_target_reports_organization_year_idx
  on public.mes_invoice_target_reports (organization_id, report_year, work_center_code, report_month);

alter table public.mes_invoice_target_reports enable row level security;

drop policy if exists "Members can read invoice target reports" on public.mes_invoice_target_reports;
create policy "Members can read invoice target reports" on public.mes_invoice_target_reports
  for select using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create invoice target reports" on public.mes_invoice_target_reports;
create policy "Members can create invoice target reports" on public.mes_invoice_target_reports
  for insert with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update invoice target reports" on public.mes_invoice_target_reports;
create policy "Members can update invoice target reports" on public.mes_invoice_target_reports
  for update using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can delete invoice target reports" on public.mes_invoice_target_reports;
create policy "Members can delete invoice target reports" on public.mes_invoice_target_reports
  for delete using (public.is_manufacturing_organization_member(organization_id));

grant select, insert, update, delete on public.mes_invoice_target_reports to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mes-invoice-target-reports', 'mes-invoice-target-reports', false, 52428800, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Organization members can read invoice target files" on storage.objects;
create policy "Organization members can read invoice target files" on storage.objects for select
  using (bucket_id = 'mes-invoice-target-reports' and public.is_manufacturing_organization_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "Organization members can upload invoice target files" on storage.objects;
create policy "Organization members can upload invoice target files" on storage.objects for insert
  with check (bucket_id = 'mes-invoice-target-reports' and public.is_manufacturing_organization_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "Organization members can update invoice target files" on storage.objects;
create policy "Organization members can update invoice target files" on storage.objects for update
  using (bucket_id = 'mes-invoice-target-reports' and public.is_manufacturing_organization_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'mes-invoice-target-reports' and public.is_manufacturing_organization_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "Organization members can delete invoice target files" on storage.objects;
create policy "Organization members can delete invoice target files" on storage.objects for delete
  using (bucket_id = 'mes-invoice-target-reports' and public.is_manufacturing_organization_member(((storage.foldername(name))[1])::uuid));
