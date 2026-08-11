alter table public.mes_production_serials
  add column if not exists before_notch numeric,
  add column if not exists before_tooth_length numeric,
  add column if not exists stock_to_remove numeric;

create table if not exists public.mes_production_piece_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  production_order_id uuid not null references public.mes_production_orders(id) on delete cascade,
  production_serial_id uuid not null references public.mes_production_serials(id) on delete cascade,
  stage text not null check (stage in ('reception', 'after-sharpening', 'after-coating')),
  file_name text not null,
  file_path text not null,
  file_type text not null,
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  uploaded_at timestamptz not null default now(),
  unique (production_serial_id, stage)
);

create index if not exists mes_production_piece_evidence_order_idx
  on public.mes_production_piece_evidence (production_order_id, production_serial_id, stage);

alter table public.mes_production_piece_evidence enable row level security;

drop policy if exists "Members can read MES production piece evidence" on public.mes_production_piece_evidence;
create policy "Members can read MES production piece evidence"
  on public.mes_production_piece_evidence for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create MES production piece evidence" on public.mes_production_piece_evidence;
create policy "Members can create MES production piece evidence"
  on public.mes_production_piece_evidence for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update MES production piece evidence" on public.mes_production_piece_evidence;
create policy "Members can update MES production piece evidence"
  on public.mes_production_piece_evidence for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can delete MES production piece evidence" on public.mes_production_piece_evidence;
create policy "Members can delete MES production piece evidence"
  on public.mes_production_piece_evidence for delete
  using (public.is_manufacturing_organization_member(organization_id));

grant select, insert, update, delete on public.mes_production_piece_evidence to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mes-production-piece-evidence',
  'mes-production-piece-evidence',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Organization members can read production piece evidence" on storage.objects;
create policy "Organization members can read production piece evidence"
  on storage.objects for select
  using (
    bucket_id = 'mes-production-piece-evidence'
    and public.is_manufacturing_organization_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Organization members can upload production piece evidence" on storage.objects;
create policy "Organization members can upload production piece evidence"
  on storage.objects for insert
  with check (
    bucket_id = 'mes-production-piece-evidence'
    and public.is_manufacturing_organization_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Organization members can update production piece evidence" on storage.objects;
create policy "Organization members can update production piece evidence"
  on storage.objects for update
  using (
    bucket_id = 'mes-production-piece-evidence'
    and public.is_manufacturing_organization_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Organization members can delete production piece evidence" on storage.objects;
create policy "Organization members can delete production piece evidence"
  on storage.objects for delete
  using (
    bucket_id = 'mes-production-piece-evidence'
    and public.is_manufacturing_organization_member(((storage.foldername(name))[1])::uuid)
  );
