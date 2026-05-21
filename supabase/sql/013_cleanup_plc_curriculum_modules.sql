-- Cleanup old generic PLC Technician modules left by earlier Academy seeds.
-- Run after 012_seed_plc_technician_full_curriculum.sql.

with plc_courses as (
  select c.id
  from public.academy_courses c
  join public.academy_tracks t on t.id = c.track_id
  where t.slug = 'plc-technician'
),
curriculum_modules as (
  insert into public.academy_course_modules (course_id, title, description, order_index)
  select
    id,
    'Curriculum',
    'Structured lessons for this PLC Technician course.',
    1
  from plc_courses
  on conflict (course_id, title) do update
  set
    description = excluded.description,
    order_index = excluded.order_index
  returning id, course_id
),
module_pick as (
  select id, course_id from curriculum_modules
  union
  select m.id, m.course_id
  from public.academy_course_modules m
  join plc_courses c on c.id = m.course_id
  where m.title = 'Curriculum'
),
move_lessons as (
  update public.academy_lessons lesson
  set module_id = module_pick.id
  from module_pick
  where lesson.course_id = module_pick.course_id
    and lesson.status = 'published'
  returning lesson.id
)
delete from public.academy_course_modules module
using plc_courses
where module.course_id = plc_courses.id
  and module.title <> 'Curriculum';
