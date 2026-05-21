-- PLC Technician Track full curriculum seed.
-- Keeps Supabase as the source of truth for track courses and lesson catalogs.

with plc_track as (
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
  values (
    'plc-technician',
    'PLC Technician Track',
    'PLC Technician',
    'A practical learning path for building real PLC programming, troubleshooting, HMI, networking, and machine control skills. Students learn core PLC concepts first, then choose a Siemens or Rockwell specialization.',
    'A practical learning path for building real PLC programming, troubleshooting, HMI, networking, and machine control skills.',
    'Beginner to Intermediate',
    'Certificate track',
    'Siemens or Rockwell path',
    'published'
  )
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
  returning id
),
track_pick as (
  select id from plc_track
  union all
  select id from public.academy_tracks where slug = 'plc-technician'
  limit 1
),
specialization_seed as (
  select *
  from (
    values
      ('plc-technician-siemens', 'Siemens / TIA Portal', 'Siemens', 'Learn PLC programming, diagnostics, HMI and PROFINET workflows using Siemens automation tools.', 'TIA Portal', 1),
      ('plc-technician-rockwell', 'Rockwell / Studio 5000', 'Rockwell', 'Learn PLC programming, diagnostics, HMI and EtherNet/IP workflows using Rockwell automation tools.', 'Studio 5000', 2)
  ) as seed(slug, title, short_title, description, platform_name, display_order)
)
insert into public.academy_track_specializations (
  track_id,
  slug,
  title,
  short_title,
  description,
  platform_name,
  display_order
)
select
  track_pick.id,
  seed.slug,
  seed.title,
  seed.short_title,
  seed.description,
  seed.platform_name,
  seed.display_order
from specialization_seed seed
cross join track_pick
on conflict (slug) do update
set
  track_id = excluded.track_id,
  title = excluded.title,
  short_title = excluded.short_title,
  description = excluded.description,
  platform_name = excluded.platform_name,
  display_order = excluded.display_order;

with track_pick as (
  select id from public.academy_tracks where slug = 'plc-technician'
),
course_seed as (
  select *
  from (
    values
      ('industrial-automation-fundamentals', null, 1, true, 'Industrial Automation Fundamentals', 'Automation Fundamentals', 'Build the foundation for understanding industrial automation systems, control architecture, sensors, actuators, signals, and basic machine behavior.', 'Beginner', array['What is a PLC?','Industrial control architecture','Inputs, outputs, sensors and actuators','Digital vs analog signals','Control panels, power, safety and wiring basics','Relay logic and ladder thinking','Machine sequences and states','Troubleshooting mindset for automation technicians']),
      ('plc-programming-fundamentals', null, 2, true, 'PLC Programming Fundamentals', 'PLC Programming', 'Learn the universal PLC programming concepts used across major industrial platforms.', 'Beginner', array['PLC scan cycle','Tags, variables and memory','Ladder logic structure','Contacts, coils and seal-in circuits','Timers','Counters','Comparators','Math instructions','Move instructions','Analog scaling','Basic machine sequence','Faults, interlocks and permissives']),
      ('electrical-field-signals-plc-technicians', null, 3, true, 'Electrical & Field Signals for PLC Technicians', 'Field Signals', 'Learn how PLC logic connects to the real machine through sensors, outputs, wiring, electrical diagrams, and field troubleshooting.', 'Beginner to Intermediate', array['Reading electrical diagrams for PLC troubleshooting','Tracing an input signal','Tracing an output signal','Sensor troubleshooting','Solenoid and actuator troubleshooting','Relay and contactor basics','Analog signal troubleshooting','Using a multimeter in PLC troubleshooting','Common field signal failures','Building a field troubleshooting checklist']),
      ('siemens-plc-platform-fundamentals-tia-portal', 'plc-technician-siemens', 4, false, 'Siemens PLC Platform Fundamentals: TIA Portal', 'TIA Portal', 'Learn how to create, configure, simulate, download, upload, and monitor Siemens PLC projects using TIA Portal.', 'Beginner to Intermediate', array['TIA Portal environment','Creating a new Siemens PLC project','S7-1200 and S7-1500 overview','Hardware configuration','Device and network setup','Tag tables and PLC variables','Data blocks','FC and FB structure','Instance DBs and multi-instance concepts','Online monitoring','Downloading and uploading projects','PLCSIM simulation workflow','Basic diagnostics in TIA Portal']),
      ('siemens-hmi-fundamentals-wincc', 'plc-technician-siemens', 5, false, 'Siemens HMI Fundamentals: WinCC', 'WinCC HMI', 'Build basic operator interfaces connected to Siemens PLC logic using WinCC concepts.', 'Beginner to Intermediate', array['What is an HMI?','UI vs UX for machine operators','WinCC overview','HMI tags and PLC connection','Screen navigation','Buttons, indicators and numeric displays','Alarm configuration','Recipes and setpoints','Basic diagnostics screens','Good HMI design practices','Mini project: operator panel for a Siemens machine sequence']),
      ('industrial-networks-siemens-plc-technicians', 'plc-technician-siemens', 6, false, 'Industrial Networks for Siemens PLC Technicians', 'Siemens Networks', 'Learn the networking concepts required to configure and troubleshoot Siemens PLC systems, PROFINET devices, remote I/O, and basic PLC communication.', 'Intermediate', array['Industrial Ethernet basics','IP addresses and subnets','PROFINET overview','Device names and IP assignment','TIA Portal network view','GSDML files','ET 200 remote I/O architecture','Module and device diagnostics','Basic Profibus overview','PUT and GET communication overview','TCON, TSEND and TRCV concepts','Network troubleshooting checklist','Mini project: Siemens PLC with remote I/O and HMI']),
      ('advanced-siemens-plc-programming-scl-fb-fc-db', 'plc-technician-siemens', 7, false, 'Advanced Siemens PLC Programming: SCL, FB, FC and DB', 'Advanced Siemens', 'Develop reusable Siemens PLC logic using structured programming concepts, SCL, function blocks, data blocks, UDTs, and modular machine logic.', 'Intermediate', array['When to use structured text / SCL','Variables and assignments','IF / THEN / ELSE','CASE statements','FOR loops','WHILE loops','Calling functions','Timers and counters in SCL','FC vs FB','Data blocks and instance DBs','UDTs and reusable structures','Multi-instance programming','Mini project: reusable Siemens machine control block']),
      ('siemens-plc-troubleshooting-online-diagnostics', 'plc-technician-siemens', 8, false, 'Siemens PLC Troubleshooting and Online Diagnostics', 'Siemens Diagnostics', 'Learn how to diagnose machine problems using TIA Portal online tools, monitoring, cross-reference, force tables, watch tables, and diagnostics.', 'Intermediate', array['Going online with a Siemens PLC','Monitoring ladder and block logic','Watch tables','Force tables and safety considerations','Cross-reference tools','Diagnostics buffer','Module diagnostics','Finding missing permissives','Finding active interlocks','Troubleshooting communication faults','Troubleshooting analog values','Practical case: Siemens machine does not start']),
      ('siemens-plc-technician-capstone-project', 'plc-technician-siemens', 9, false, 'Siemens PLC Technician Capstone Project', 'Siemens Capstone', 'Build and document a complete Siemens PLC-controlled machine project with logic, HMI, remote I/O, alarms, diagnostics, testing, and simulation.', 'Intermediate', array['Project requirements','I/O list','Electrical and control architecture','Siemens PLC program structure','Manual mode','Automatic mode','Fault handling','WinCC HMI screens','PROFINET and remote I/O configuration','Testing and simulation with PLCSIM','Troubleshooting scenarios','Final review and certificate submission']),
      ('rockwell-plc-platform-fundamentals-studio-5000', 'plc-technician-rockwell', 4, false, 'Rockwell PLC Platform Fundamentals: Studio 5000', 'Studio 5000', 'Learn how to create, configure, download, upload, monitor, and troubleshoot Rockwell Logix projects using Studio 5000.', 'Beginner to Intermediate', array['Studio 5000 environment','CompactLogix and ControlLogix overview','Creating a new Logix project','Controller and chassis configuration','Controller organizer structure','Tags and data types','Programs, routines and tasks','Add-On Instructions overview','Online edits','Downloading and uploading projects','Monitoring tools','Basic diagnostics in Studio 5000']),
      ('rockwell-hmi-fundamentals-factorytalk-view', 'plc-technician-rockwell', 5, false, 'Rockwell HMI Fundamentals: FactoryTalk View', 'FactoryTalk View', 'Build basic operator interfaces connected to Rockwell PLC logic using FactoryTalk View concepts.', 'Beginner to Intermediate', array['What is an HMI?','UI vs UX for machine operators','FactoryTalk View overview','HMI tags and PLC connection','Display navigation','Buttons, indicators and numeric displays','Alarm configuration','Recipes and setpoints','Basic diagnostics displays','Good HMI design practices','Mini project: operator panel for a Rockwell machine sequence']),
      ('industrial-networks-rockwell-plc-technicians', 'plc-technician-rockwell', 6, false, 'Industrial Networks for Rockwell PLC Technicians', 'Rockwell Networks', 'Learn the networking concepts required to configure and troubleshoot Rockwell PLC systems, EtherNet/IP devices, remote I/O, and basic PLC communication.', 'Intermediate', array['Industrial Ethernet basics','IP addresses and subnets','EtherNet/IP overview','RSLinx / FactoryTalk Linx overview','EDS files','POINT I/O and remote I/O architecture','Module properties and connection faults','Produced and consumed tags overview','Device status and diagnostics','Common EtherNet/IP troubleshooting cases','Network troubleshooting checklist','Mini project: Rockwell PLC with remote I/O and HMI']),
      ('advanced-rockwell-plc-programming-st-aoi-udt', 'plc-technician-rockwell', 7, false, 'Advanced Rockwell PLC Programming: ST, AOI and UDT', 'Advanced Rockwell', 'Develop reusable Rockwell PLC logic using structured text, Add-On Instructions, UDTs, arrays, and modular machine logic.', 'Intermediate', array['When to use structured text','Variables and assignments','IF / THEN / ELSE','CASE statements','FOR loops','WHILE loops','Calling routines and instructions','Timers and counters in structured text','UDTs and arrays','Add-On Instructions','Produced and consumed tags overview','Reusable machine logic patterns']),
      ('rockwell-plc-troubleshooting-online-diagnostics', 'plc-technician-rockwell', 8, false, 'Rockwell PLC Troubleshooting and Online Diagnostics', 'Rockwell Diagnostics', 'Learn how to diagnose machine problems using Studio 5000 online tools, cross-reference, controller tags, forces, trends, faults, and module status.', 'Intermediate', array['Going online with a Rockwell PLC','Monitoring ladder and routines','Controller tags and watch tools','Forces and safety considerations','Cross-reference tools','Trends','Controller and module fault codes','Module status','Finding missing permissives','Finding active interlocks','Troubleshooting communication faults','Practical case: Rockwell machine does not start']),
      ('rockwell-plc-technician-capstone-project', 'plc-technician-rockwell', 9, false, 'Rockwell PLC Technician Capstone Project', 'Rockwell Capstone', 'Build and document a complete Rockwell PLC-controlled machine project with logic, HMI, remote I/O, alarms, diagnostics, testing, and simulation.', 'Intermediate', array['Project requirements','I/O list','Electrical and control architecture','Rockwell PLC program structure','Manual mode','Automatic mode','Fault handling','FactoryTalk View HMI displays','EtherNet/IP and remote I/O configuration','Testing and simulation workflow','Troubleshooting scenarios','Final review and certificate submission'])
  ) as seed(slug, specialization_slug, course_number, is_common, title, subtitle, description, difficulty_level, lessons)
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
    status,
    track_id,
    specialization_id,
    course_number,
    is_common,
    display_order
  )
  select
    seed.slug,
    seed.title,
    seed.subtitle,
    seed.description,
    'PLC Technician',
    seed.difficulty_level,
    null,
    0,
    'USD',
    'published',
    track_pick.id,
    specialization.id,
    seed.course_number,
    seed.is_common,
    seed.course_number
  from course_seed seed
  cross join track_pick
  left join public.academy_track_specializations specialization on specialization.slug = seed.specialization_slug
  on conflict (slug) do update
  set
    title = excluded.title,
    subtitle = excluded.subtitle,
    description = excluded.description,
    category = excluded.category,
    difficulty_level = excluded.difficulty_level,
    price = excluded.price,
    currency = excluded.currency,
    status = excluded.status,
    track_id = excluded.track_id,
    specialization_id = excluded.specialization_id,
    course_number = excluded.course_number,
    is_common = excluded.is_common,
    display_order = excluded.display_order
  returning id, slug
),
seeded_courses as (
  select
    c.id,
    c.slug,
    seed.lessons
  from public.academy_courses c
  join course_seed seed on seed.slug = c.slug
),
archive_old_lessons as (
  update public.academy_lessons lesson
  set status = 'archived'
  from seeded_courses course
  where lesson.course_id = course.id
    and not exists (
      select 1
      from unnest(course.lessons) with ordinality as expected(title, order_index)
      where lesson.slug = lower(regexp_replace(regexp_replace(expected.title, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
    )
  returning lesson.id
),
module_upsert as (
  insert into public.academy_course_modules (course_id, title, description, order_index)
  select
    id,
    'Curriculum',
    'Structured lessons for this PLC Technician course.',
    1
  from seeded_courses
  on conflict (course_id, title) do update
  set
    description = excluded.description,
    order_index = excluded.order_index
  returning id, course_id
),
module_pick as (
  select
    module.id,
    module.course_id,
    course.slug as course_slug,
    course.lessons
  from public.academy_course_modules module
  join seeded_courses course on course.id = module.course_id
  where module.title = 'Curriculum'
),
lesson_seed as (
  select
    module_pick.course_id,
    module_pick.id as module_id,
    lower(regexp_replace(regexp_replace(lesson.title, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) as slug,
    lesson.title,
    lesson.order_index
  from module_pick
  cross join lateral unnest(module_pick.lessons) with ordinality as lesson(title, order_index)
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
  slug,
  title,
  'Lesson content will be attached here. This catalog row defines the official PLC Technician curriculum in Supabase.',
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

with track_pick as (
  select id from public.academy_tracks where slug = 'plc-technician'
),
expected_courses as (
  select *
  from (
    values
      ('industrial-automation-fundamentals'),
      ('plc-programming-fundamentals'),
      ('electrical-field-signals-plc-technicians'),
      ('siemens-plc-platform-fundamentals-tia-portal'),
      ('siemens-hmi-fundamentals-wincc'),
      ('industrial-networks-siemens-plc-technicians'),
      ('advanced-siemens-plc-programming-scl-fb-fc-db'),
      ('siemens-plc-troubleshooting-online-diagnostics'),
      ('siemens-plc-technician-capstone-project'),
      ('rockwell-plc-platform-fundamentals-studio-5000'),
      ('rockwell-hmi-fundamentals-factorytalk-view'),
      ('industrial-networks-rockwell-plc-technicians'),
      ('advanced-rockwell-plc-programming-st-aoi-udt'),
      ('rockwell-plc-troubleshooting-online-diagnostics'),
      ('rockwell-plc-technician-capstone-project')
  ) as seed(course_slug)
),
archive_old_track_links as (
  delete from public.academy_track_courses link
  using track_pick
  where link.track_id = track_pick.id
    and not exists (
      select 1
      from public.academy_courses course
      join expected_courses expected on expected.course_slug = course.slug
      where course.id = link.course_id
    )
  returning link.id
)
insert into public.academy_track_courses (
  track_id,
  course_id,
  step,
  required_for_certificate,
  specialization_id,
  is_common,
  course_number,
  display_order
)
select
  course.track_id,
  course.id,
  course.course_number,
  true,
  course.specialization_id,
  course.is_common,
  course.course_number,
  course.display_order
from public.academy_courses course
join track_pick on track_pick.id = course.track_id
join expected_courses expected on expected.course_slug = course.slug
on conflict (track_id, course_id) do update
set
  step = excluded.step,
  required_for_certificate = excluded.required_for_certificate,
  specialization_id = excluded.specialization_id,
  is_common = excluded.is_common,
  course_number = excluded.course_number,
  display_order = excluded.display_order;
