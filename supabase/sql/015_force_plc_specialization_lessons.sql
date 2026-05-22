-- Force the specialized PLC Technician lesson catalog to match the approved Siemens and Rockwell curricula.
-- Run after 012_seed_plc_technician_full_curriculum.sql, 013_cleanup_plc_curriculum_modules.sql,
-- and 014_force_plc_technician_lessons.sql.

with course_seed as (
  select *
  from (
    values
      (
        'siemens-hmi-fundamentals-wincc',
        array[
          'What is an HMI?',
          'UI vs UX for machine operators',
          'WinCC overview',
          'HMI tags and PLC connection',
          'Screen navigation',
          'Buttons, indicators and numeric displays',
          'Alarm configuration',
          'Recipes and setpoints',
          'Basic diagnostics screens',
          'Good HMI design practices',
          'Mini project: operator panel for a Siemens machine sequence'
        ]
      ),
      (
        'industrial-networks-siemens-plc-technicians',
        array[
          'Industrial Ethernet basics',
          'IP addresses and subnets',
          'PROFINET overview',
          'Device names and IP assignment',
          'TIA Portal network view',
          'GSDML files',
          'ET 200 remote I/O architecture',
          'Module and device diagnostics',
          'Basic Profibus overview',
          'PUT and GET communication overview',
          'TCON, TSEND and TRCV concepts',
          'Network troubleshooting checklist',
          'Mini project: Siemens PLC with remote I/O and HMI'
        ]
      ),
      (
        'advanced-siemens-plc-programming-scl-fb-fc-db',
        array[
          'When to use structured text / SCL',
          'Variables and assignments',
          'IF / THEN / ELSE',
          'CASE statements',
          'FOR loops',
          'WHILE loops',
          'Calling functions',
          'Timers and counters in SCL',
          'FC vs FB',
          'Data blocks and instance DBs',
          'UDTs and reusable structures',
          'Multi-instance programming',
          'Mini project: reusable Siemens machine control block'
        ]
      ),
      (
        'siemens-plc-troubleshooting-online-diagnostics',
        array[
          'Going online with a Siemens PLC',
          'Monitoring ladder and block logic',
          'Watch tables',
          'Force tables and safety considerations',
          'Cross-reference tools',
          'Diagnostics buffer',
          'Module diagnostics',
          'Finding missing permissives',
          'Finding active interlocks',
          'Troubleshooting communication faults',
          'Troubleshooting analog values',
          'Practical case: Siemens machine does not start'
        ]
      ),
      (
        'siemens-plc-technician-capstone-project',
        array[
          'Project requirements',
          'I/O list',
          'Electrical and control architecture',
          'Siemens PLC program structure',
          'Manual mode',
          'Automatic mode',
          'Fault handling',
          'WinCC HMI screens',
          'PROFINET and remote I/O configuration',
          'Testing and simulation with PLCSIM',
          'Troubleshooting scenarios',
          'Final review and certificate submission'
        ]
      ),
      (
        'rockwell-hmi-fundamentals-factorytalk-view',
        array[
          'What is an HMI?',
          'UI vs UX for machine operators',
          'FactoryTalk View overview',
          'HMI tags and PLC connection',
          'Display navigation',
          'Buttons, indicators and numeric displays',
          'Alarm configuration',
          'Recipes and setpoints',
          'Basic diagnostics displays',
          'Good HMI design practices',
          'Mini project: operator panel for a Rockwell machine sequence'
        ]
      ),
      (
        'industrial-networks-rockwell-plc-technicians',
        array[
          'Industrial Ethernet basics',
          'IP addresses and subnets',
          'EtherNet/IP overview',
          'RSLinx / FactoryTalk Linx overview',
          'EDS files',
          'POINT I/O and remote I/O architecture',
          'Module properties and connection faults',
          'Produced and consumed tags overview',
          'Device status and diagnostics',
          'Common EtherNet/IP troubleshooting cases',
          'Network troubleshooting checklist',
          'Mini project: Rockwell PLC with remote I/O and HMI'
        ]
      ),
      (
        'advanced-rockwell-plc-programming-st-aoi-udt',
        array[
          'When to use structured text',
          'Variables and assignments',
          'IF / THEN / ELSE',
          'CASE statements',
          'FOR loops',
          'WHILE loops',
          'Calling routines and instructions',
          'Timers and counters in structured text',
          'UDTs and arrays',
          'Add-On Instructions',
          'Produced and consumed tags overview',
          'Reusable machine logic patterns',
          'Mini project: reusable Rockwell machine control block'
        ]
      ),
      (
        'rockwell-plc-troubleshooting-online-diagnostics',
        array[
          'Going online with a Rockwell PLC',
          'Monitoring ladder and routines',
          'Controller tags and watch tools',
          'Forces and safety considerations',
          'Cross-reference tools',
          'Trends',
          'Controller and module fault codes',
          'Module status',
          'Finding missing permissives',
          'Finding active interlocks',
          'Troubleshooting communication faults',
          'Practical case: Rockwell machine does not start'
        ]
      ),
      (
        'rockwell-plc-technician-capstone-project',
        array[
          'Project requirements',
          'I/O list',
          'Electrical and control architecture',
          'Rockwell PLC program structure',
          'Manual mode',
          'Automatic mode',
          'Fault handling',
          'FactoryTalk View HMI displays',
          'EtherNet/IP and remote I/O configuration',
          'Testing and simulation workflow',
          'Troubleshooting scenarios',
          'Final review and certificate submission'
        ]
      )
  ) as seed(course_slug, lessons)
),
course_pick as (
  select distinct
    c.id as course_id,
    c.slug as course_slug,
    seed.lessons
  from public.academy_courses c
  join course_seed seed on seed.course_slug = c.slug
),
module_upsert as (
  insert into public.academy_course_modules (course_id, title, description, order_index)
  select
    course_id,
    'Curriculum',
    'Structured lessons for this PLC Technician course.',
    1
  from course_pick
  on conflict (course_id, title) do update
  set
    description = excluded.description,
    order_index = excluded.order_index
  returning id, course_id
),
module_pick as (
  select distinct
    m.id as module_id,
    course.course_id,
    course.course_slug,
    course.lessons
  from public.academy_course_modules m
  join course_pick course on course.course_id = m.course_id
  where m.title = 'Curriculum'
),
lesson_seed as (
  select
    module_pick.course_id,
    module_pick.module_id,
    module_pick.course_slug,
    lower(regexp_replace(regexp_replace(lesson.title, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) as lesson_slug,
    lesson.title,
    lesson.order_index
  from module_pick
  cross join lateral unnest(module_pick.lessons) with ordinality as lesson(title, order_index)
),
archive_old_lessons as (
  update public.academy_lessons lesson
  set status = 'archived'
  from course_pick course
  where lesson.course_id = course.course_id
    and not exists (
      select 1
      from lesson_seed seed
      where seed.course_id = lesson.course_id
        and seed.lesson_slug = lesson.slug
    )
  returning lesson.id
)
insert into public.academy_lessons (
  course_id,
  module_id,
  slug,
  title,
  description,
  lesson_type,
  video_provider,
  video_id,
  video_url,
  duration_seconds,
  order_index,
  is_preview,
  status
)
select
  course_id,
  module_id,
  lesson_slug,
  title,
  'Lesson content will be attached here. This row is part of the official PLC Technician curriculum in Supabase.',
  'video',
  null,
  null,
  null,
  null,
  order_index,
  order_index = 1,
  'published'
from lesson_seed
on conflict (course_id, slug) do update
set
  module_id = excluded.module_id,
  title = excluded.title,
  description = excluded.description,
  lesson_type = excluded.lesson_type,
  video_provider = excluded.video_provider,
  video_id = excluded.video_id,
  video_url = excluded.video_url,
  duration_seconds = excluded.duration_seconds,
  order_index = excluded.order_index,
  is_preview = excluded.is_preview,
  status = excluded.status;
