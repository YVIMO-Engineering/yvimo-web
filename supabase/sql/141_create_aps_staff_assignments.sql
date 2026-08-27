create table if not exists public.aps_staff_work_center_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  member_id uuid not null references public.manufacturing_organization_members(id) on delete cascade,
  work_center_id uuid references public.mes_work_centers(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, member_id)
);

create index if not exists aps_staff_assignments_org_work_center_idx
  on public.aps_staff_work_center_assignments (organization_id, work_center_id);

alter table public.aps_staff_work_center_assignments enable row level security;
grant select, insert, update, delete on public.aps_staff_work_center_assignments to authenticated;

drop policy if exists "Organization members can read staff assignments" on public.aps_staff_work_center_assignments;
create policy "Organization members can read staff assignments"
  on public.aps_staff_work_center_assignments for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Organization members can create staff assignments" on public.aps_staff_work_center_assignments;
create policy "Organization members can create staff assignments"
  on public.aps_staff_work_center_assignments for insert
  with check (
    public.is_manufacturing_organization_member(organization_id)
    and exists (select 1 from public.manufacturing_organization_members member where member.id = member_id and member.organization_id = organization_id)
    and (work_center_id is null or exists (select 1 from public.mes_work_centers center where center.id = work_center_id and center.organization_id = organization_id))
  );

drop policy if exists "Organization members can update staff assignments" on public.aps_staff_work_center_assignments;
create policy "Organization members can update staff assignments"
  on public.aps_staff_work_center_assignments for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (
    public.is_manufacturing_organization_member(organization_id)
    and exists (select 1 from public.manufacturing_organization_members member where member.id = member_id and member.organization_id = organization_id)
    and (work_center_id is null or exists (select 1 from public.mes_work_centers center where center.id = work_center_id and center.organization_id = organization_id))
  );

drop policy if exists "Organization members can delete staff assignments" on public.aps_staff_work_center_assignments;
create policy "Organization members can delete staff assignments"
  on public.aps_staff_work_center_assignments for delete
  using (public.is_manufacturing_organization_member(organization_id));

drop trigger if exists set_aps_staff_assignments_updated_at on public.aps_staff_work_center_assignments;
create trigger set_aps_staff_assignments_updated_at before update on public.aps_staff_work_center_assignments
for each row execute function public.set_updated_at();
