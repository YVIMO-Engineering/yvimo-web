create table if not exists public.aps_staff_shift_rotations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  member_id uuid not null references public.manufacturing_organization_members(id) on delete cascade, work_center_id uuid not null references public.mes_work_centers(id) on delete cascade,
  primary_shift_number smallint not null check (primary_shift_number between 1 and 3), alternate_shift_number smallint not null check (alternate_shift_number between 1 and 3),
  interval_weeks integer not null default 1 check (interval_weeks > 0), anchor_week date not null, active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, member_id)
);
create table if not exists public.aps_staff_vacations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  member_id uuid not null references public.manufacturing_organization_members(id) on delete cascade, date_from date not null, date_to date not null, notes text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (date_to >= date_from)
);
create index if not exists aps_staff_vacations_org_member_dates_idx on public.aps_staff_vacations (organization_id, member_id, date_from, date_to);
alter table public.aps_staff_shift_rotations enable row level security; alter table public.aps_staff_vacations enable row level security;
grant select, insert, update, delete on public.aps_staff_shift_rotations, public.aps_staff_vacations to authenticated;
drop policy if exists "Members manage staff rotations" on public.aps_staff_shift_rotations;
create policy "Members manage staff rotations" on public.aps_staff_shift_rotations for all using (public.is_manufacturing_organization_member(organization_id)) with check (public.is_manufacturing_organization_member(organization_id));
drop policy if exists "Members manage staff vacations" on public.aps_staff_vacations;
create policy "Members manage staff vacations" on public.aps_staff_vacations for all using (public.is_manufacturing_organization_member(organization_id)) with check (public.is_manufacturing_organization_member(organization_id));
drop trigger if exists set_aps_staff_shift_rotations_updated_at on public.aps_staff_shift_rotations;
create trigger set_aps_staff_shift_rotations_updated_at before update on public.aps_staff_shift_rotations for each row execute function public.set_updated_at();
drop trigger if exists set_aps_staff_vacations_updated_at on public.aps_staff_vacations;
create trigger set_aps_staff_vacations_updated_at before update on public.aps_staff_vacations for each row execute function public.set_updated_at();
