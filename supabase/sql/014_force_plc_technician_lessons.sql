-- Force the PLC Technician lesson catalog to match the approved curriculum.
-- Run after 012_seed_plc_technician_full_curriculum.sql and 013_cleanup_plc_curriculum_modules.sql.

with lesson_seed as (
  select *
  from (
    values
      ('industrial-automation-fundamentals', 'what-is-a-plc', 'What is a PLC?', 1, true),
      ('industrial-automation-fundamentals', 'industrial-control-architecture', 'Industrial control architecture', 2, false),
      ('industrial-automation-fundamentals', 'inputs-outputs-sensors-and-actuators', 'Inputs, outputs, sensors and actuators', 3, false),
      ('industrial-automation-fundamentals', 'digital-vs-analog-signals', 'Digital vs analog signals', 4, false),
      ('industrial-automation-fundamentals', 'control-panels-power-safety-and-wiring-basics', 'Control panels, power, safety and wiring basics', 5, false),
      ('industrial-automation-fundamentals', 'relay-logic-and-ladder-thinking', 'Relay logic and ladder thinking', 6, false),
      ('industrial-automation-fundamentals', 'machine-sequences-and-states', 'Machine sequences and states', 7, false),
      ('industrial-automation-fundamentals', 'troubleshooting-mindset-for-automation-technicians', 'Troubleshooting mindset for automation technicians', 8, false),

      ('plc-programming-fundamentals', 'plc-scan-cycle', 'PLC scan cycle', 1, true),
      ('plc-programming-fundamentals', 'tags-variables-and-memory', 'Tags, variables and memory', 2, false),
      ('plc-programming-fundamentals', 'ladder-logic-structure', 'Ladder logic structure', 3, false),
      ('plc-programming-fundamentals', 'contacts-coils-and-seal-in-circuits', 'Contacts, coils and seal-in circuits', 4, false),
      ('plc-programming-fundamentals', 'timers', 'Timers', 5, false),
      ('plc-programming-fundamentals', 'counters', 'Counters', 6, false),
      ('plc-programming-fundamentals', 'comparators', 'Comparators', 7, false),
      ('plc-programming-fundamentals', 'math-instructions', 'Math instructions', 8, false),
      ('plc-programming-fundamentals', 'move-instructions', 'Move instructions', 9, false),
      ('plc-programming-fundamentals', 'analog-scaling', 'Analog scaling', 10, false),
      ('plc-programming-fundamentals', 'basic-machine-sequence', 'Basic machine sequence', 11, false),
      ('plc-programming-fundamentals', 'faults-interlocks-and-permissives', 'Faults, interlocks and permissives', 12, false),

      ('electrical-field-signals-plc-technicians', 'reading-electrical-diagrams-for-plc-troubleshooting', 'Reading electrical diagrams for PLC troubleshooting', 1, true),
      ('electrical-field-signals-plc-technicians', 'tracing-an-input-signal', 'Tracing an input signal', 2, false),
      ('electrical-field-signals-plc-technicians', 'tracing-an-output-signal', 'Tracing an output signal', 3, false),
      ('electrical-field-signals-plc-technicians', 'sensor-troubleshooting', 'Sensor troubleshooting', 4, false),
      ('electrical-field-signals-plc-technicians', 'solenoid-and-actuator-troubleshooting', 'Solenoid and actuator troubleshooting', 5, false),
      ('electrical-field-signals-plc-technicians', 'relay-and-contactor-basics', 'Relay and contactor basics', 6, false),
      ('electrical-field-signals-plc-technicians', 'analog-signal-troubleshooting', 'Analog signal troubleshooting', 7, false),
      ('electrical-field-signals-plc-technicians', 'using-a-multimeter-in-plc-troubleshooting', 'Using a multimeter in PLC troubleshooting', 8, false),
      ('electrical-field-signals-plc-technicians', 'common-field-signal-failures', 'Common field signal failures', 9, false),
      ('electrical-field-signals-plc-technicians', 'building-a-field-troubleshooting-checklist', 'Building a field troubleshooting checklist', 10, false),

      ('siemens-plc-platform-fundamentals-tia-portal', 'tia-portal-environment', 'TIA Portal environment', 1, true),
      ('siemens-plc-platform-fundamentals-tia-portal', 'creating-a-new-siemens-plc-project', 'Creating a new Siemens PLC project', 2, false),
      ('siemens-plc-platform-fundamentals-tia-portal', 's7-1200-and-s7-1500-overview', 'S7-1200 and S7-1500 overview', 3, false),
      ('siemens-plc-platform-fundamentals-tia-portal', 'hardware-configuration', 'Hardware configuration', 4, false),
      ('siemens-plc-platform-fundamentals-tia-portal', 'device-and-network-setup', 'Device and network setup', 5, false),
      ('siemens-plc-platform-fundamentals-tia-portal', 'tag-tables-and-plc-variables', 'Tag tables and PLC variables', 6, false),
      ('siemens-plc-platform-fundamentals-tia-portal', 'data-blocks', 'Data blocks', 7, false),
      ('siemens-plc-platform-fundamentals-tia-portal', 'fc-and-fb-structure', 'FC and FB structure', 8, false),
      ('siemens-plc-platform-fundamentals-tia-portal', 'instance-dbs-and-multi-instance-concepts', 'Instance DBs and multi-instance concepts', 9, false),
      ('siemens-plc-platform-fundamentals-tia-portal', 'online-monitoring', 'Online monitoring', 10, false),
      ('siemens-plc-platform-fundamentals-tia-portal', 'downloading-and-uploading-projects', 'Downloading and uploading projects', 11, false),
      ('siemens-plc-platform-fundamentals-tia-portal', 'plcsim-simulation-workflow', 'PLCSIM simulation workflow', 12, false),
      ('siemens-plc-platform-fundamentals-tia-portal', 'basic-diagnostics-in-tia-portal', 'Basic diagnostics in TIA Portal', 13, false),

      ('rockwell-plc-platform-fundamentals-studio-5000', 'studio-5000-environment', 'Studio 5000 environment', 1, true),
      ('rockwell-plc-platform-fundamentals-studio-5000', 'compactlogix-and-controllogix-overview', 'CompactLogix and ControlLogix overview', 2, false),
      ('rockwell-plc-platform-fundamentals-studio-5000', 'creating-a-new-logix-project', 'Creating a new Logix project', 3, false),
      ('rockwell-plc-platform-fundamentals-studio-5000', 'controller-and-chassis-configuration', 'Controller and chassis configuration', 4, false),
      ('rockwell-plc-platform-fundamentals-studio-5000', 'controller-organizer-structure', 'Controller organizer structure', 5, false),
      ('rockwell-plc-platform-fundamentals-studio-5000', 'tags-and-data-types', 'Tags and data types', 6, false),
      ('rockwell-plc-platform-fundamentals-studio-5000', 'programs-routines-and-tasks', 'Programs, routines and tasks', 7, false),
      ('rockwell-plc-platform-fundamentals-studio-5000', 'add-on-instructions-overview', 'Add-On Instructions overview', 8, false),
      ('rockwell-plc-platform-fundamentals-studio-5000', 'online-edits', 'Online edits', 9, false),
      ('rockwell-plc-platform-fundamentals-studio-5000', 'downloading-and-uploading-projects', 'Downloading and uploading projects', 10, false),
      ('rockwell-plc-platform-fundamentals-studio-5000', 'monitoring-tools', 'Monitoring tools', 11, false),
      ('rockwell-plc-platform-fundamentals-studio-5000', 'basic-diagnostics-in-studio-5000', 'Basic diagnostics in Studio 5000', 12, false)
  ) as seed(course_slug, lesson_slug, title, order_index, is_preview)
),
course_pick as (
  select distinct
    c.id as course_id,
    c.slug as course_slug
  from public.academy_courses c
  where c.slug in (
    select distinct course_slug
    from lesson_seed
  )
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
  select distinct m.id as module_id, m.course_id
  from public.academy_course_modules m
  join course_pick c on c.course_id = m.course_id
  where m.title = 'Curriculum'
),
archive_old_lessons as (
  update public.academy_lessons l
  set status = 'archived'
  from course_pick c
  where l.course_id = c.course_id
    and not exists (
      select 1
      from lesson_seed seed
      where seed.course_slug = c.course_slug
        and seed.lesson_slug = l.slug
    )
  returning l.id
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
  c.course_id,
  m.module_id,
  seed.lesson_slug,
  seed.title,
  'Lesson content will be attached here. This row is part of the official PLC Technician curriculum in Supabase.',
  'video',
  null,
  null,
  null,
  null,
  seed.order_index,
  seed.is_preview,
  'published'
from lesson_seed seed
join course_pick c on c.course_slug = seed.course_slug
join module_pick m on m.course_id = c.course_id
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
