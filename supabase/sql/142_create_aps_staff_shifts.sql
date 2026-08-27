create table if not exists public.aps_staff_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  work_center_id uuid not null references public.mes_work_centers(id) on delete cascade,
  shift_number smallint not null check (shift_number between 1 and 3),
  start_time time not null,
  end_time time not null,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, work_center_id, shift_number)
);

create table if not exists public.aps_staff_shift_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  member_id uuid not null references public.manufacturing_organization_members(id) on delete cascade,
  shift_id uuid not null references public.aps_staff_shifts(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, member_id)
);

alter table public.aps_staff_shifts enable row level security;
alter table public.aps_staff_shift_assignments enable row level security;
grant select, insert, update, delete on public.aps_staff_shifts, public.aps_staff_shift_assignments to authenticated;

drop policy if exists "Members manage staff shifts" on public.aps_staff_shifts;
create policy "Members manage staff shifts" on public.aps_staff_shifts for all
using (public.is_manufacturing_organization_member(organization_id))
with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members manage staff shift assignments" on public.aps_staff_shift_assignments;
create policy "Members manage staff shift assignments" on public.aps_staff_shift_assignments for all
using (public.is_manufacturing_organization_member(organization_id))
with check (public.is_manufacturing_organization_member(organization_id));

drop trigger if exists set_aps_staff_shifts_updated_at on public.aps_staff_shifts;
create trigger set_aps_staff_shifts_updated_at before update on public.aps_staff_shifts for each row execute function public.set_updated_at();
drop trigger if exists set_aps_staff_shift_assignments_updated_at on public.aps_staff_shift_assignments;
create trigger set_aps_staff_shift_assignments_updated_at before update on public.aps_staff_shift_assignments for each row execute function public.set_updated_at();
