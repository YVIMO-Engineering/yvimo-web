alter table public.aps_staff_shifts
  add column if not exists week_start date;

update public.aps_staff_shifts
set week_start = date_trunc('week', current_date)::date
where week_start is null;

alter table public.aps_staff_shifts
  alter column week_start set default date_trunc('week', current_date)::date,
  alter column week_start set not null;

alter table public.aps_staff_shifts
  drop constraint if exists aps_staff_shifts_organization_id_work_center_id_shift_number_key;
alter table public.aps_staff_shifts
  drop constraint if exists aps_staff_shifts_organization_id_work_center_id_shift_numbe_key;
alter table public.aps_staff_shifts
  add constraint aps_staff_shifts_org_center_week_number_key
  unique (organization_id, work_center_id, week_start, shift_number);

alter table public.aps_staff_shift_assignments
  add column if not exists week_start date;

update public.aps_staff_shift_assignments assignment
set week_start = shift.week_start
from public.aps_staff_shifts shift
where assignment.shift_id = shift.id and assignment.week_start is null;

alter table public.aps_staff_shift_assignments
  alter column week_start set default date_trunc('week', current_date)::date,
  alter column week_start set not null;

alter table public.aps_staff_shift_assignments
  drop constraint if exists aps_staff_shift_assignments_organization_id_member_id_key;
alter table public.aps_staff_shift_assignments
  add constraint aps_staff_shift_assignments_org_member_week_key
  unique (organization_id, member_id, week_start);

create index if not exists aps_staff_shifts_org_center_week_idx
  on public.aps_staff_shifts (organization_id, work_center_id, week_start);
create index if not exists aps_staff_shift_assignments_org_week_idx
  on public.aps_staff_shift_assignments (organization_id, week_start);
