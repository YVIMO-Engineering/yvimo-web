create table if not exists public.health_patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  curp text not null,
  medical_record_number text not null,
  full_name text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_patients_curp_format check (curp = upper(curp) and char_length(curp) = 18),
  constraint health_patients_full_name_required check (char_length(trim(full_name)) > 0),
  constraint health_patients_record_required check (char_length(trim(medical_record_number)) > 0),
  unique (organization_id, curp),
  unique (organization_id, medical_record_number)
);

alter table public.health_patients enable row level security;
grant select, insert, update, delete on public.health_patients to authenticated;

create policy "Organization members can read health patients" on public.health_patients for select
  using (public.is_manufacturing_organization_member(organization_id));
create policy "Organization members can create health patients" on public.health_patients for insert
  with check (public.is_manufacturing_organization_member(organization_id) and created_by = auth.uid());
create policy "Organization members can update health patients" on public.health_patients for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));
create policy "Organization admins can delete health patients" on public.health_patients for delete
  using (public.is_manufacturing_organization_admin(organization_id));

create index if not exists health_patients_organization_name_idx on public.health_patients (organization_id, full_name);
create index if not exists health_patients_organization_created_idx on public.health_patients (organization_id, created_at desc);

drop trigger if exists set_health_patients_updated_at on public.health_patients;
create trigger set_health_patients_updated_at before update on public.health_patients
for each row execute function public.set_updated_at();
