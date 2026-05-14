with course_seed as (
  select *
  from (
    values
      (
        'industrial-automation-fundamentals',
        'Industrial Automation Fundamentals',
        'A beginner-friendly introduction to PLCs, signals, and ladder logic.',
        'Learn the basic building blocks of industrial automation: what PLCs do, how digital inputs and outputs work, and how ladder logic represents machine behavior.',
        'PLC Programming',
        'Beginner',
        0::numeric,
        1
      ),
      (
        'plc-programming-fundamentals',
        'PLC Programming Fundamentals',
        'Start writing and reading PLC logic with confidence.',
        'A structured path through PLC scan cycles, tags, rungs, timers, counters, and practical machine-control patterns.',
        'PLC Programming',
        'Beginner',
        0::numeric,
        2
      ),
      (
        'ladder-logic-for-machine-control',
        'Ladder Logic for Machine Control',
        'Build control sequences that match real machine behavior.',
        'Practice common ladder patterns for interlocks, latches, modes, alarms, and step-based automation.',
        'PLC Programming',
        'Intermediate',
        0::numeric,
        3
      ),
      (
        'plc-troubleshooting-field-signals',
        'PLC Troubleshooting: Field Signals',
        'Diagnose sensors, outputs, wiring, and logic from the PLC outward.',
        'Learn how to reason through digital inputs, outputs, forcing, status bits, and electrical field conditions.',
        'PLC Programming',
        'Intermediate',
        0::numeric,
        4
      ),
      (
        'hmi-and-plc-alarm-design',
        'HMI and PLC Alarm Design',
        'Design clear operator feedback and maintainable alarm logic.',
        'Connect PLC states to HMI messages, priorities, acknowledgements, and troubleshooting guidance.',
        'PLC Programming',
        'Intermediate',
        0::numeric,
        5
      ),
      (
        'advanced-plc-sequencing',
        'Advanced PLC Sequencing',
        'Structure larger automation routines without losing clarity.',
        'Explore reusable sequence patterns, state machines, fault recovery, and production-safe logic organization.',
        'PLC Programming',
        'Advanced',
        0::numeric,
        6
      ),
      (
        'robotics-cell-fundamentals',
        'Robotics Cell Fundamentals',
        'Understand robot cells, fixtures, safety, and production flow.',
        'A practical introduction to robot workcells, industrial layouts, tooling, guarding, and automation objectives.',
        'Robotics',
        'Beginner',
        0::numeric,
        1
      ),
      (
        'robot-motion-and-frames',
        'Robot Motion and Frames',
        'Learn positions, frames, paths, and motion behavior.',
        'Build intuition around joint motion, linear motion, user frames, tool frames, and path quality.',
        'Robotics',
        'Beginner',
        0::numeric,
        2
      ),
      (
        'robot-plc-handshaking',
        'Robot and PLC Handshaking',
        'Connect robot programs with machine control logic.',
        'Study the signals, states, permissions, and recovery logic used between robots and PLCs.',
        'Robotics',
        'Intermediate',
        0::numeric,
        3
      ),
      (
        'robot-safety-and-recovery',
        'Robot Safety and Recovery',
        'Handle stops, faults, and safe restart conditions.',
        'Learn how cell safety, teach modes, stop categories, and fault recovery shape reliable robotic systems.',
        'Robotics',
        'Intermediate',
        0::numeric,
        4
      ),
      (
        'robot-vision-inspection-basics',
        'Robot Vision Inspection Basics',
        'Use vision concepts for detection, guidance, and validation.',
        'An introduction to cameras, part detection, offsets, inspection decisions, and robot guidance workflows.',
        'Robotics',
        'Intermediate',
        0::numeric,
        5
      ),
      (
        'offline-robot-simulation',
        'Offline Robot Simulation',
        'Plan and validate robot cells before deployment.',
        'Learn the core workflow for building simulation studies, checking reach, timing paths, and reviewing layout risks.',
        'Robotics',
        'Advanced',
        0::numeric,
        6
      )
  ) as seed(
    slug,
    title,
    subtitle,
    description,
    category,
    difficulty_level,
    price,
    order_index
  )
),
course_upsert as (
  insert into public.academy_courses (
    slug,
    title,
    subtitle,
    description,
    category,
    difficulty_level,
    thumbnail_url,
    price,
    currency,
    status
  )
  select
    slug,
    title,
    subtitle,
    description,
    category,
    difficulty_level,
    null,
    price,
    'USD',
    'published'
  from course_seed
  on conflict (slug) do update
  set
    title = excluded.title,
    subtitle = excluded.subtitle,
    description = excluded.description,
    category = excluded.category,
    difficulty_level = excluded.difficulty_level,
    price = excluded.price,
    currency = excluded.currency,
    status = excluded.status
  returning id, slug
),
all_courses as (
  select c.id, c.slug, s.category
  from course_upsert c
  join course_seed s on s.slug = c.slug
),
module_upsert as (
  insert into public.academy_course_modules (
    course_id,
    title,
    description,
    order_index
  )
  select
    id,
    'Getting Started',
    'Core concepts and first practical steps for this course.',
    1
  from all_courses
  on conflict (course_id, title) do update
  set
    description = excluded.description,
    order_index = excluded.order_index
  returning id, course_id
),
module_pick as (
  select m.id, m.course_id
  from public.academy_course_modules m
  join all_courses c on c.id = m.course_id
  where m.title = 'Getting Started'
),
lesson_seed as (
  select *
  from (
    values
      (
        'overview',
        'Course Overview',
        'Understand what this course covers and how to approach the learning path.',
        'dQw4w9WgXcQ',
        180,
        1,
        true
      ),
      (
        'core-concepts',
        'Core Concepts',
        'Learn the core terms, patterns, and decisions behind this topic.',
        'ysz5S6PUM-U',
        360,
        2,
        false
      ),
      (
        'practice-lab',
        'Practice Lab',
        'Apply the topic with a practical scenario and review checklist.',
        'jNQXAC9IVRw',
        420,
        3,
        false
      )
  ) as seed(slug, title, description, video_id, duration_seconds, order_index, is_preview)
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
  module_pick.course_id,
  module_pick.id,
  lesson_seed.slug,
  lesson_seed.title,
  lesson_seed.description,
  'video',
  'youtube',
  lesson_seed.video_id,
  null,
  lesson_seed.duration_seconds,
  lesson_seed.order_index,
  lesson_seed.is_preview,
  'published'
from module_pick
cross join lesson_seed
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
