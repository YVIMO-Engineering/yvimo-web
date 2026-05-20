alter table public.academy_courses
  add column if not exists track_id uuid references public.academy_tracks(id) on delete set null,
  add column if not exists specialization_id uuid,
  add column if not exists course_number integer,
  add column if not exists is_common boolean not null default false,
  add column if not exists display_order integer;

create table if not exists public.academy_track_specializations (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.academy_tracks(id) on delete cascade,
  slug text unique not null,
  title text not null,
  short_title text not null,
  description text,
  platform_name text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(track_id, slug)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'academy_courses_specialization_id_fkey'
  ) then
    alter table public.academy_courses
      add constraint academy_courses_specialization_id_fkey
      foreign key (specialization_id)
      references public.academy_track_specializations(id)
      on delete set null;
  end if;
end
$$;

create table if not exists public.user_track_specializations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.academy_tracks(id) on delete cascade,
  specialization_id uuid not null references public.academy_track_specializations(id) on delete cascade,
  selected_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, track_id, specialization_id)
);

alter table public.academy_track_courses
  add column if not exists specialization_id uuid references public.academy_track_specializations(id) on delete cascade,
  add column if not exists is_common boolean not null default false,
  add column if not exists course_number integer,
  add column if not exists display_order integer;

alter table public.academy_track_courses
  drop constraint if exists academy_track_courses_track_id_step_key;

create unique index if not exists academy_track_courses_track_path_step_idx
  on public.academy_track_courses(track_id, (coalesce(specialization_id, '00000000-0000-0000-0000-000000000000'::uuid)), step);

create index if not exists academy_courses_track_path_order_idx
  on public.academy_courses(track_id, specialization_id, display_order);

create index if not exists user_track_specializations_user_active_idx
  on public.user_track_specializations(user_id, track_id, is_active);

drop trigger if exists set_academy_track_specializations_updated_at on public.academy_track_specializations;
create trigger set_academy_track_specializations_updated_at
before update on public.academy_track_specializations
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_track_specializations_updated_at on public.user_track_specializations;
create trigger set_user_track_specializations_updated_at
before update on public.user_track_specializations
for each row
execute function public.set_updated_at();

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
      ('industrial-automation-fundamentals', null, 1, true, 'Industrial Automation Fundamentals', 'Build the foundation for understanding industrial automation systems, control architecture, sensors, actuators, signals, and basic machine behavior.', array['What is a PLC?','Industrial control architecture','Inputs, outputs, sensors and actuators','Digital vs analog signals','Control panels, power, safety and wiring basics','Relay logic and ladder thinking','Machine sequences and states','Troubleshooting mindset for automation technicians']),
      ('plc-programming-fundamentals', null, 2, true, 'PLC Programming Fundamentals', 'Learn the universal PLC programming concepts used across major industrial platforms.', array['PLC scan cycle','Tags, variables and memory','Ladder logic structure','Contacts, coils and seal-in circuits','Timers','Counters','Comparators','Math instructions','Move instructions','Analog scaling','Basic machine sequence','Faults, interlocks and permissives']),
      ('electrical-field-signals-plc-technicians', null, 3, true, 'Electrical & Field Signals for PLC Technicians', 'Learn how PLC logic connects to the real machine through sensors, outputs, wiring, electrical diagrams, and field troubleshooting.', array['Reading electrical diagrams for PLC troubleshooting','Tracing an input signal','Tracing an output signal','Sensor troubleshooting','Solenoid and actuator troubleshooting','Relay and contactor basics','Analog signal troubleshooting','Using a multimeter in PLC troubleshooting','Common field signal failures','Building a field troubleshooting checklist']),
      ('siemens-plc-platform-fundamentals-tia-portal', 'plc-technician-siemens', 4, false, 'Siemens PLC Platform Fundamentals: TIA Portal', 'Learn how to create, configure, simulate, download, upload, and monitor Siemens PLC projects using TIA Portal.', array['TIA Portal environment','Creating a new Siemens PLC project','S7-1200 and S7-1500 overview','Hardware configuration','Device and network setup','Tag tables and PLC variables','Data blocks','FC and FB structure','Instance DBs and multi-instance concepts','Online monitoring','Downloading and uploading projects','PLCSIM simulation workflow','Basic diagnostics in TIA Portal']),
      ('siemens-hmi-fundamentals-wincc', 'plc-technician-siemens', 5, false, 'Siemens HMI Fundamentals: WinCC', 'Build basic operator interfaces connected to Siemens PLC logic using WinCC concepts.', array['What is an HMI?','UI vs UX for machine operators','WinCC overview','HMI tags and PLC connection','Screen navigation','Buttons, indicators and numeric displays','Alarm configuration','Recipes and setpoints','Basic diagnostics screens','Good HMI design practices','Mini project: operator panel for a Siemens machine sequence']),
      ('industrial-networks-siemens-plc-technicians', 'plc-technician-siemens', 6, false, 'Industrial Networks for Siemens PLC Technicians', 'Learn the networking concepts required to configure and troubleshoot Siemens PLC systems, PROFINET devices, remote I/O, and basic PLC communication.', array['Industrial Ethernet basics','IP addresses and subnets','PROFINET overview','Device names and IP assignment','TIA Portal network view','GSDML files','ET 200 remote I/O architecture','Module and device diagnostics','Basic Profibus overview','PUT and GET communication overview','TCON, TSEND and TRCV concepts','Network troubleshooting checklist','Mini project: Siemens PLC with remote I/O and HMI']),
      ('advanced-siemens-plc-programming-scl-fb-fc-db', 'plc-technician-siemens', 7, false, 'Advanced Siemens PLC Programming: SCL, FB, FC and DB', 'Develop reusable Siemens PLC logic using structured programming concepts, SCL, function blocks, data blocks, UDTs, and modular machine logic.', array['When to use structured text / SCL','Variables and assignments','IF / THEN / ELSE','CASE statements','FOR loops','WHILE loops','Calling functions','Timers and counters in SCL','FC vs FB','Data blocks and instance DBs','UDTs and reusable structures','Multi-instance programming','Mini project: reusable Siemens machine control block']),
      ('siemens-plc-troubleshooting-online-diagnostics', 'plc-technician-siemens', 8, false, 'Siemens PLC Troubleshooting and Online Diagnostics', 'Learn how to diagnose machine problems using TIA Portal online tools, monitoring, cross-reference, force tables, watch tables, and diagnostics.', array['Going online with a Siemens PLC','Monitoring ladder and block logic','Watch tables','Force tables and safety considerations','Cross-reference tools','Diagnostics buffer','Module diagnostics','Finding missing permissives','Finding active interlocks','Troubleshooting communication faults','Troubleshooting analog values','Practical case: Siemens machine does not start']),
      ('siemens-plc-technician-capstone-project', 'plc-technician-siemens', 9, false, 'Siemens PLC Technician Capstone Project', 'Build and document a complete Siemens PLC-controlled machine project with logic, HMI, remote I/O, alarms, diagnostics, testing, and simulation.', array['Project requirements','I/O list','Electrical and control architecture','Siemens PLC program structure','Manual mode','Automatic mode','Fault handling','WinCC HMI screens','PROFINET and remote I/O configuration','Testing and simulation with PLCSIM','Troubleshooting scenarios','Final review and certificate submission']),
      ('rockwell-plc-platform-fundamentals-studio-5000', 'plc-technician-rockwell', 4, false, 'Rockwell PLC Platform Fundamentals: Studio 5000', 'Learn how to create, configure, download, upload, monitor, and troubleshoot Rockwell Logix projects using Studio 5000.', array['Studio 5000 environment','CompactLogix and ControlLogix overview','Creating a new Logix project','Controller and chassis configuration','Controller organizer structure','Tags and data types','Programs, routines and tasks','Add-On Instructions overview','Online edits','Downloading and uploading projects','Monitoring tools','Basic diagnostics in Studio 5000']),
      ('rockwell-hmi-fundamentals-factorytalk-view', 'plc-technician-rockwell', 5, false, 'Rockwell HMI Fundamentals: FactoryTalk View', 'Build basic operator interfaces connected to Rockwell PLC logic using FactoryTalk View concepts.', array['What is an HMI?','UI vs UX for machine operators','FactoryTalk View overview','HMI tags and PLC connection','Display navigation','Buttons, indicators and numeric displays','Alarm configuration','Recipes and setpoints','Basic diagnostics displays','Good HMI design practices','Mini project: operator panel for a Rockwell machine sequence']),
      ('industrial-networks-rockwell-plc-technicians', 'plc-technician-rockwell', 6, false, 'Industrial Networks for Rockwell PLC Technicians', 'Learn the networking concepts required to configure and troubleshoot Rockwell PLC systems, EtherNet/IP devices, remote I/O, and basic PLC communication.', array['Industrial Ethernet basics','IP addresses and subnets','EtherNet/IP overview','RSLinx / FactoryTalk Linx overview','EDS files','POINT I/O and remote I/O architecture','Module properties and connection faults','Produced and consumed tags overview','Device status and diagnostics','Common EtherNet/IP troubleshooting cases','Network troubleshooting checklist','Mini project: Rockwell PLC with remote I/O and HMI']),
      ('advanced-rockwell-plc-programming-st-aoi-udt', 'plc-technician-rockwell', 7, false, 'Advanced Rockwell PLC Programming: ST, AOI and UDT', 'Develop reusable Rockwell PLC logic using structured text, Add-On Instructions, UDTs, arrays, and modular machine logic.', array['When to use structured text','Variables and assignments','IF / THEN / ELSE','CASE statements','FOR loops','WHILE loops','Calling routines and instructions','Timers and counters in structured text','UDTs and arrays','Add-On Instructions','Produced and consumed tags overview','Reusable machine logic patterns','Mini project: reusable Rockwell machine control block']),
      ('rockwell-plc-troubleshooting-online-diagnostics', 'plc-technician-rockwell', 8, false, 'Rockwell PLC Troubleshooting and Online Diagnostics', 'Learn how to diagnose machine problems using Studio 5000 online tools, cross-reference, controller tags, forces, trends, faults, and module status.', array['Going online with a Rockwell PLC','Monitoring ladder and routines','Controller tags and watch tools','Forces and safety considerations','Cross-reference tools','Trends','Controller and module fault codes','Module status','Finding missing permissives','Finding active interlocks','Troubleshooting communication faults','Practical case: Rockwell machine does not start']),
      ('rockwell-plc-technician-capstone-project', 'plc-technician-rockwell', 9, false, 'Rockwell PLC Technician Capstone Project', 'Build and document a complete Rockwell PLC-controlled machine project with logic, HMI, remote I/O, alarms, diagnostics, testing, and simulation.', array['Project requirements','I/O list','Electrical and control architecture','Rockwell PLC program structure','Manual mode','Automatic mode','Fault handling','FactoryTalk View HMI displays','EtherNet/IP and remote I/O configuration','Testing and simulation workflow','Troubleshooting scenarios','Final review and certificate submission'])
  ) as seed(slug, specialization_slug, course_number, is_common, title, description, lessons)
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
    seed.description,
    seed.description,
    'PLC Technician',
    'Beginner to Intermediate',
    null,
    0,
    'USD',
    'published',
    track_pick.id,
    spec.id,
    seed.course_number,
    seed.is_common,
    seed.course_number
  from course_seed seed
  cross join track_pick
  left join public.academy_track_specializations spec on spec.slug = seed.specialization_slug
  on conflict (slug) do update
  set
    title = excluded.title,
    subtitle = excluded.subtitle,
    description = excluded.description,
    category = excluded.category,
    difficulty_level = excluded.difficulty_level,
    status = excluded.status,
    track_id = excluded.track_id,
    specialization_id = excluded.specialization_id,
    course_number = excluded.course_number,
    is_common = excluded.is_common,
    display_order = excluded.display_order
  returning id, slug
),
module_upsert as (
  insert into public.academy_course_modules (course_id, title, description, order_index)
  select c.id, 'Course Lessons', 'Structured lessons for this PLC Technician course.', 1
  from public.academy_courses c
  join course_seed seed on seed.slug = c.slug
  on conflict (course_id, title) do update
  set description = excluded.description,
      order_index = excluded.order_index
  returning id, course_id
),
module_pick as (
  select m.id, m.course_id, c.slug as course_slug
  from public.academy_course_modules m
  join public.academy_courses c on c.id = m.course_id
  join course_seed seed on seed.slug = c.slug
  where m.title = 'Course Lessons'
),
lesson_seed as (
  select
    seed.slug as course_slug,
    lower(regexp_replace(regexp_replace(lesson.title, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) as lesson_slug,
    lesson.title,
    lesson.order_index
  from course_seed seed
  cross join lateral unnest(seed.lessons) with ordinality as lesson(title, order_index)
)
insert into public.academy_lessons (
  course_id,
  module_id,
  slug,
  title,
  description,
  lesson_type,
  order_index,
  is_preview,
  status
)
select
  module_pick.course_id,
  module_pick.id,
  lesson_seed.lesson_slug,
  lesson_seed.title,
  'Placeholder lesson content for the PLC Technician curriculum.',
  'video',
  lesson_seed.order_index,
  lesson_seed.order_index = 1,
  'published'
from lesson_seed
join module_pick on module_pick.course_slug = lesson_seed.course_slug
on conflict (course_id, slug) do update
set
  module_id = excluded.module_id,
  title = excluded.title,
  description = excluded.description,
  lesson_type = excluded.lesson_type,
  order_index = excluded.order_index,
  is_preview = excluded.is_preview,
  status = excluded.status;

delete from public.academy_track_courses
where track_id = (select id from public.academy_tracks where slug = 'plc-technician');

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
  c.track_id,
  c.id,
  c.course_number,
  true,
  c.specialization_id,
  c.is_common,
  c.course_number,
  c.display_order
from public.academy_courses c
where c.track_id = (select id from public.academy_tracks where slug = 'plc-technician')
  and c.slug in (
    'industrial-automation-fundamentals',
    'plc-programming-fundamentals',
    'electrical-field-signals-plc-technicians',
    'siemens-plc-platform-fundamentals-tia-portal',
    'siemens-hmi-fundamentals-wincc',
    'industrial-networks-siemens-plc-technicians',
    'advanced-siemens-plc-programming-scl-fb-fc-db',
    'siemens-plc-troubleshooting-online-diagnostics',
    'siemens-plc-technician-capstone-project',
    'rockwell-plc-platform-fundamentals-studio-5000',
    'rockwell-hmi-fundamentals-factorytalk-view',
    'industrial-networks-rockwell-plc-technicians',
    'advanced-rockwell-plc-programming-st-aoi-udt',
    'rockwell-plc-troubleshooting-online-diagnostics',
    'rockwell-plc-technician-capstone-project'
  )
on conflict do nothing;

create or replace view public.academy_specialization_track_progress_summary as
with track_users as (
  select user_id from public.academy_lesson_progress
  union
  select user_id from public.academy_certificates
  union
  select user_id from public.user_track_specializations
),
path_courses as (
  select
    s.id as specialization_id,
    s.slug as specialization_slug,
    t.id as track_id,
    t.slug as track_slug,
    c.id as course_id
  from public.academy_track_specializations s
  join public.academy_tracks t on t.id = s.track_id
  join public.academy_courses c on c.track_id = t.id
  where c.status = 'published'
    and (c.is_common = true or c.specialization_id = s.id)
)
select
  tu.user_id,
  pc.track_id,
  pc.track_slug,
  pc.specialization_id,
  pc.specialization_slug,
  count(l.id) as total_lessons,
  count(lp.id) filter (where lp.completed = true) as completed_lessons,
  case
    when count(l.id) = 0 then 0
    else round((count(lp.id) filter (where lp.completed = true)::numeric / count(l.id)::numeric) * 100, 2)
  end as path_progress_percent
from track_users tu
join path_courses pc on true
join public.academy_lessons l on l.course_id = pc.course_id and l.status = 'published'
left join public.academy_lesson_progress lp
  on lp.user_id = tu.user_id
  and lp.lesson_id = l.id
group by tu.user_id, pc.track_id, pc.track_slug, pc.specialization_id, pc.specialization_slug;

alter table public.academy_track_specializations enable row level security;
alter table public.user_track_specializations enable row level security;

grant select on public.academy_track_specializations to anon, authenticated;
grant select, insert, update on public.user_track_specializations to authenticated;
grant select on public.academy_specialization_track_progress_summary to authenticated;

drop policy if exists "Public can read academy track specializations" on public.academy_track_specializations;
create policy "Public can read academy track specializations"
on public.academy_track_specializations
for select
using (
  public.is_admin_user(auth.uid())
  or exists (
    select 1 from public.academy_tracks t
    where t.id = track_id and t.status = 'published'
  )
);

drop policy if exists "Admins can manage academy track specializations" on public.academy_track_specializations;
create policy "Admins can manage academy track specializations"
on public.academy_track_specializations
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "Users can read own track specialization choices" on public.user_track_specializations;
create policy "Users can read own track specialization choices"
on public.user_track_specializations
for select
using (auth.uid() = user_id or public.is_admin_user(auth.uid()));

drop policy if exists "Users can select own track specialization" on public.user_track_specializations;
create policy "Users can select own track specialization"
on public.user_track_specializations
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own track specialization" on public.user_track_specializations;
create policy "Users can update own track specialization"
on public.user_track_specializations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
