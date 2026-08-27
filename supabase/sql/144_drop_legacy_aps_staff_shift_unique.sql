-- PostgreSQL truncated the original generated constraint name to 63 characters.
-- Keeping it would prevent the same shift number from existing in multiple weeks.
alter table public.aps_staff_shifts
  drop constraint if exists aps_staff_shifts_organization_id_work_center_id_shift_numbe_key;

-- Also cover databases where the untruncated name was created explicitly.
alter table public.aps_staff_shifts
  drop constraint if exists aps_staff_shifts_organization_id_work_center_id_shift_number_key;

-- Ensure the intended weekly uniqueness exists after removing the legacy key.
alter table public.aps_staff_shifts
  drop constraint if exists aps_staff_shifts_org_center_week_number_key;
alter table public.aps_staff_shifts
  add constraint aps_staff_shifts_org_center_week_number_key
  unique (organization_id, work_center_id, week_start, shift_number);
