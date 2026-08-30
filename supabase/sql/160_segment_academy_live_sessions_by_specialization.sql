alter table public.academy_lessons
add column if not exists specialization_slug text;

comment on column public.academy_lessons.specialization_slug is
  'Track specialization that owns a live-session recording, for example plc-technician-rockwell.';

create index if not exists academy_lessons_live_session_specialization_idx
on public.academy_lessons (specialization_slug, course_id, order_index)
where content_group = 'live_session';

-- The live-session catalog that predates specialization support contains the
-- existing Rockwell / Studio 5000 recordings confirmed during this migration.
update public.academy_lessons
set specialization_slug = 'plc-technician-rockwell'
where content_group = 'live_session'
  and specialization_slug is null;
