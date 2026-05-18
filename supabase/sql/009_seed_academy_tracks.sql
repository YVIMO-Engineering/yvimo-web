with required_courses as (
  select *
  from (
    values
      ('industrial-software-fundamentals', 'Industrial Software Fundamentals', 'Understand how software connects machines, operators, and production data.', 'Understand how software connects machines, operators, and production data.', 'Industrial Software', 'Intermediate', 1),
      ('plant-floor-data-architecture', 'Plant-Floor Data Architecture', 'Learn how production data moves from machines to dashboards and systems.', 'Learn how production data moves from machines to dashboards and systems.', 'Industrial Software', 'Intermediate', 2),
      ('dashboards-and-apis', 'Dashboards and APIs', 'Build interfaces and integrations that make industrial data useful.', 'Build interfaces and integrations that make industrial data useful.', 'Industrial Software', 'Intermediate', 3),
      ('connected-manufacturing-applications', 'Connected Manufacturing Applications', 'Apply software concepts to real connected manufacturing workflows.', 'Apply software concepts to real connected manufacturing workflows.', 'Industrial Software', 'Intermediate', 4),
      ('automation-career-foundations', 'Automation Career Foundations', 'Understand the skills, roles, and growth paths in industrial automation.', 'Understand the skills, roles, and growth paths in industrial automation.', 'Career Growth', 'All levels', 1),
      ('industrial-project-communication', 'Industrial Project Communication', 'Learn how to communicate technical ideas, project updates, and automation value.', 'Learn how to communicate technical ideas, project updates, and automation value.', 'Career Growth', 'All levels', 2),
      ('portfolio-and-certification-readiness', 'Portfolio and Certification Readiness', 'Prepare your learning evidence, project portfolio, and certification path.', 'Prepare your learning evidence, project portfolio, and certification path.', 'Career Growth', 'All levels', 3)
  ) as seed(slug, title, subtitle, description, category, difficulty_level, order_index)
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
    0,
    'USD',
    'published'
  from required_courses
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
module_upsert as (
  insert into public.academy_course_modules (course_id, title, description, order_index)
  select c.id, 'Getting Started', 'Core concepts and first practical steps for this course.', 1
  from public.academy_courses c
  join required_courses seed on seed.slug = c.slug
  on conflict (course_id, title) do update
  set
    description = excluded.description,
    order_index = excluded.order_index
  returning id, course_id
),
module_pick as (
  select m.id, m.course_id
  from public.academy_course_modules m
  join public.academy_courses c on c.id = m.course_id
  join required_courses seed on seed.slug = c.slug
  where m.title = 'Getting Started'
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
  lesson.slug,
  lesson.title,
  lesson.description,
  'video',
  'youtube',
  lesson.video_id,
  null,
  lesson.duration_seconds,
  lesson.order_index,
  lesson.is_preview,
  'published'
from module_pick
cross join (
  values
    ('overview', 'Course Overview', 'Understand what this course covers and how to approach the learning path.', 'dQw4w9WgXcQ', 180, 1, true),
    ('core-concepts', 'Core Concepts', 'Learn the core terms, patterns, and decisions behind this topic.', 'ysz5S6PUM-U', 360, 2, false),
    ('practice-lab', 'Practice Lab', 'Apply the topic with a practical scenario and review checklist.', 'jNQXAC9IVRw', 420, 3, false)
) as lesson(slug, title, description, video_id, duration_seconds, order_index, is_preview)
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

with track_seed as (
  select *
  from (
    values
      ('plc-technician', 'PLC Technician Track', 'PLC Technician', 'Build a strong foundation in PLC logic, machine control, field signals, and troubleshooting.', 'A structured learning path for building practical PLC, machine control, and troubleshooting skills.', 'Beginner to Intermediate', 'Certificate track', 'Self-paced'),
      ('robotics-integration', 'Robotics Technician Track', 'Robotics Technician', 'Learn robot cells, motion, safety, and robot-to-PLC coordination for real automation systems.', 'A structured learning path for robot cells, motion, safety, and robot-to-PLC coordination.', 'Beginner to Intermediate', 'Certificate track', 'Self-paced'),
      ('industrial-software', 'Industrial Software Track', 'Industrial Software', 'Develop practical skills in dashboards, APIs, plant-floor data, and connected manufacturing systems.', 'A structured learning path for dashboards, APIs, plant-floor data, and connected manufacturing systems.', 'Intermediate', 'Certificate track', 'Self-paced'),
      ('automation-career-growth', 'Automation Career Growth Track', 'Career Growth', 'Strengthen your professional path with guided learning, certifications, and practical development.', 'A structured learning path for professional growth, certifications, and practical automation development.', 'All levels', 'Professional development', 'Self-paced')
  ) as seed(slug, title, short_title, description, subtitle, level, certificate_type, estimated_duration)
),
track_upsert as (
  insert into public.academy_tracks (
    slug,
    title,
    short_title,
    description,
    subtitle,
    level,
    certificate_type,
    estimated_duration,
    status
  )
  select
    slug,
    title,
    short_title,
    description,
    subtitle,
    level,
    certificate_type,
    estimated_duration,
    'published'
  from track_seed
  on conflict (slug) do update
  set
    title = excluded.title,
    short_title = excluded.short_title,
    description = excluded.description,
    subtitle = excluded.subtitle,
    level = excluded.level,
    certificate_type = excluded.certificate_type,
    estimated_duration = excluded.estimated_duration,
    status = excluded.status
  returning id, slug
),
track_course_seed as (
  select *
  from (
    values
      ('plc-technician', 'industrial-automation-fundamentals', 1),
      ('plc-technician', 'plc-programming-fundamentals', 2),
      ('plc-technician', 'ladder-logic-for-machine-control', 3),
      ('plc-technician', 'plc-troubleshooting-field-signals', 4),
      ('robotics-integration', 'robotics-cell-fundamentals', 1),
      ('robotics-integration', 'robot-motion-and-frames', 2),
      ('robotics-integration', 'robot-plc-handshaking', 3),
      ('robotics-integration', 'robot-safety-and-recovery', 4),
      ('industrial-software', 'industrial-software-fundamentals', 1),
      ('industrial-software', 'plant-floor-data-architecture', 2),
      ('industrial-software', 'dashboards-and-apis', 3),
      ('industrial-software', 'connected-manufacturing-applications', 4),
      ('automation-career-growth', 'automation-career-foundations', 1),
      ('automation-career-growth', 'industrial-project-communication', 2),
      ('automation-career-growth', 'portfolio-and-certification-readiness', 3)
  ) as seed(track_slug, course_slug, step)
)
insert into public.academy_track_courses (
  track_id,
  course_id,
  step,
  required_for_certificate
)
select
  t.id,
  c.id,
  seed.step,
  true
from track_course_seed seed
join public.academy_tracks t on t.slug = seed.track_slug
join public.academy_courses c on c.slug = seed.course_slug
on conflict (track_id, course_id) do update
set
  step = excluded.step,
  required_for_certificate = excluded.required_for_certificate;
