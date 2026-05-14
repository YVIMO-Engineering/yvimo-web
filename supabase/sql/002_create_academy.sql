create table if not exists public.academy_courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  subtitle text,
  description text,
  category text,
  difficulty_level text,
  thumbnail_url text,
  price numeric(10,2),
  currency text default 'USD',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  title text not null,
  description text,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  module_id uuid references public.academy_course_modules(id) on delete set null,
  slug text not null,
  title text not null,
  description text,
  lesson_type text not null default 'video'
    check (lesson_type in ('video', 'text', 'quiz', 'assignment')),
  video_provider text
    check (
      video_provider is null
      or video_provider in ('youtube', 'cloudflare_stream', 'mux', 'vimeo', 'local', 'supabase')
    ),
  video_id text,
  video_url text,
  duration_seconds integer,
  order_index integer not null default 0,
  is_preview boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(course_id, slug)
);

create table if not exists public.academy_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  access_type text not null default 'manual'
    check (access_type in ('free', 'manual', 'paid', 'corporate', 'trial', 'admin')),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'expired', 'revoked')),
  enrolled_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, course_id)
);

create table if not exists public.academy_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  progress_seconds integer not null default 0,
  progress_percent numeric(5,2) not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  last_watched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, lesson_id)
);

create index if not exists academy_course_modules_course_order_idx
  on public.academy_course_modules(course_id, order_index);

create unique index if not exists academy_course_modules_course_title_idx
  on public.academy_course_modules(course_id, title);

create index if not exists academy_lessons_course_order_idx
  on public.academy_lessons(course_id, order_index);

create index if not exists academy_enrollments_user_course_idx
  on public.academy_enrollments(user_id, course_id);

create index if not exists academy_lesson_progress_user_course_idx
  on public.academy_lesson_progress(user_id, course_id);

drop trigger if exists set_academy_courses_updated_at on public.academy_courses;
create trigger set_academy_courses_updated_at
before update on public.academy_courses
for each row
execute function public.set_updated_at();

drop trigger if exists set_academy_course_modules_updated_at on public.academy_course_modules;
create trigger set_academy_course_modules_updated_at
before update on public.academy_course_modules
for each row
execute function public.set_updated_at();

drop trigger if exists set_academy_lessons_updated_at on public.academy_lessons;
create trigger set_academy_lessons_updated_at
before update on public.academy_lessons
for each row
execute function public.set_updated_at();

drop trigger if exists set_academy_enrollments_updated_at on public.academy_enrollments;
create trigger set_academy_enrollments_updated_at
before update on public.academy_enrollments
for each row
execute function public.set_updated_at();

drop trigger if exists set_academy_lesson_progress_updated_at on public.academy_lesson_progress;
create trigger set_academy_lesson_progress_updated_at
before update on public.academy_lesson_progress
for each row
execute function public.set_updated_at();

create or replace function public.is_admin_user(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = check_user_id
      and lower(coalesce(role, '')) in ('admin', 'owner')
  );
$$;

create or replace function public.has_active_academy_enrollment(
  check_user_id uuid,
  check_course_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.academy_enrollments e
    where e.user_id = check_user_id
      and e.course_id = check_course_id
      and e.status = 'active'
      and (e.expires_at is null or e.expires_at > now())
  );
$$;

alter table public.academy_courses enable row level security;
alter table public.academy_course_modules enable row level security;
alter table public.academy_lessons enable row level security;
alter table public.academy_enrollments enable row level security;
alter table public.academy_lesson_progress enable row level security;

grant select on public.academy_courses to anon, authenticated;
grant select on public.academy_course_modules to anon, authenticated;
grant select on public.academy_lessons to anon, authenticated;
grant select, insert, update on public.academy_enrollments to authenticated;
grant select, insert, update on public.academy_lesson_progress to authenticated;
grant execute on function public.is_admin_user(uuid) to anon, authenticated;
grant execute on function public.has_active_academy_enrollment(uuid, uuid) to anon, authenticated;

drop policy if exists "Public can read published academy courses" on public.academy_courses;
create policy "Public can read published academy courses"
on public.academy_courses
for select
using (status = 'published' or public.is_admin_user(auth.uid()));

drop policy if exists "Admins can manage academy courses" on public.academy_courses;
create policy "Admins can manage academy courses"
on public.academy_courses
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "Public can read modules for published courses" on public.academy_course_modules;
create policy "Public can read modules for published courses"
on public.academy_course_modules
for select
using (
  public.is_admin_user(auth.uid())
  or exists (
    select 1
    from public.academy_courses c
    where c.id = course_id
      and c.status = 'published'
  )
);

drop policy if exists "Admins can manage academy modules" on public.academy_course_modules;
create policy "Admins can manage academy modules"
on public.academy_course_modules
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "Users can read accessible academy lessons" on public.academy_lessons;
create policy "Users can read accessible academy lessons"
on public.academy_lessons
for select
using (
  public.is_admin_user(auth.uid())
  or (
    status = 'published'
    and is_preview = true
    and exists (
      select 1
      from public.academy_courses c
      where c.id = course_id
        and c.status = 'published'
    )
  )
  or (
    status = 'published'
    and public.has_active_academy_enrollment(auth.uid(), course_id)
  )
);

drop policy if exists "Admins can manage academy lessons" on public.academy_lessons;
create policy "Admins can manage academy lessons"
on public.academy_lessons
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "Users can read own academy enrollments" on public.academy_enrollments;
create policy "Users can read own academy enrollments"
on public.academy_enrollments
for select
using (auth.uid() = user_id or public.is_admin_user(auth.uid()));

drop policy if exists "Users can enroll themselves in free academy courses" on public.academy_enrollments;
create policy "Users can enroll themselves in free academy courses"
on public.academy_enrollments
for insert
with check (
  auth.uid() = user_id
  and access_type = 'free'
  and status = 'active'
  and exists (
    select 1
    from public.academy_courses c
    where c.id = course_id
      and c.status = 'published'
      and coalesce(c.price, 0) = 0
  )
);

drop policy if exists "Users can refresh own free academy enrollment" on public.academy_enrollments;
create policy "Users can refresh own free academy enrollment"
on public.academy_enrollments
for update
using (auth.uid() = user_id and access_type = 'free')
with check (
  auth.uid() = user_id
  and access_type = 'free'
  and status = 'active'
  and exists (
    select 1
    from public.academy_courses c
    where c.id = course_id
      and c.status = 'published'
      and coalesce(c.price, 0) = 0
  )
);

drop policy if exists "Admins can manage academy enrollments" on public.academy_enrollments;
create policy "Admins can manage academy enrollments"
on public.academy_enrollments
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "Users can read own academy progress" on public.academy_lesson_progress;
create policy "Users can read own academy progress"
on public.academy_lesson_progress
for select
using (auth.uid() = user_id or public.is_admin_user(auth.uid()));

drop policy if exists "Users can insert own academy progress" on public.academy_lesson_progress;
create policy "Users can insert own academy progress"
on public.academy_lesson_progress
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.academy_lessons l
    where l.id = lesson_id
      and l.course_id = course_id
      and l.status = 'published'
      and (
        l.is_preview = true
        or public.has_active_academy_enrollment(auth.uid(), l.course_id)
      )
  )
);

drop policy if exists "Users can update own academy progress" on public.academy_lesson_progress;
create policy "Users can update own academy progress"
on public.academy_lesson_progress
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.academy_lessons l
    where l.id = lesson_id
      and l.course_id = course_id
      and l.status = 'published'
      and (
        l.is_preview = true
        or public.has_active_academy_enrollment(auth.uid(), l.course_id)
      )
  )
);

drop policy if exists "Admins can manage academy progress" on public.academy_lesson_progress;
create policy "Admins can manage academy progress"
on public.academy_lesson_progress
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

create or replace view public.academy_lesson_catalog as
select
  l.id,
  l.course_id,
  l.module_id,
  l.slug,
  l.title,
  l.description,
  l.lesson_type,
  case when l.is_preview then l.video_provider else null end as video_provider,
  case when l.is_preview then l.video_id else null end as video_id,
  case when l.is_preview then l.video_url else null end as video_url,
  l.duration_seconds,
  l.order_index,
  l.is_preview,
  l.status,
  l.created_at,
  l.updated_at
from public.academy_lessons l
join public.academy_courses c on c.id = l.course_id
where c.status = 'published'
  and l.status = 'published';

create or replace view public.academy_course_progress_summary as
select
  p.user_id,
  l.course_id,
  count(l.id) as total_lessons,
  count(p.id) filter (where p.completed = true) as completed_lessons,
  case
    when count(l.id) = 0 then 0
    else round(
      (count(p.id) filter (where p.completed = true)::numeric / count(l.id)::numeric) * 100,
      2
    )
  end as course_progress_percent
from public.academy_lessons l
left join public.academy_lesson_progress p
  on p.lesson_id = l.id
where l.status = 'published'
group by p.user_id, l.course_id;

grant select on public.academy_lesson_catalog to anon, authenticated;
grant select on public.academy_course_progress_summary to authenticated;

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
values (
  'industrial-automation-fundamentals',
  'Industrial Automation Fundamentals',
  'A beginner-friendly introduction to PLCs, signals, and ladder logic.',
  'Learn the basic building blocks of industrial automation: what PLCs do, how digital inputs and outputs work, and how ladder logic represents machine behavior.',
  'Industrial Automation',
  'Beginner',
  null,
  0,
  'USD',
  'published'
)
on conflict (slug) do update
set
  title = excluded.title,
  subtitle = excluded.subtitle,
  description = excluded.description,
  category = excluded.category,
  difficulty_level = excluded.difficulty_level,
  price = excluded.price,
  currency = excluded.currency,
  status = excluded.status;

with course as (
  select id from public.academy_courses where slug = 'industrial-automation-fundamentals'
),
module_upsert as (
  insert into public.academy_course_modules (course_id, title, description, order_index)
  select id, 'Introduction to PLCs', 'Start with the core device behind modern machine control.', 1
  from course
  on conflict (course_id, title) do update
  set
    description = excluded.description,
    order_index = excluded.order_index
  returning id, course_id
),
module_pick as (
  select id, course_id from module_upsert
  union all
  select m.id, m.course_id
  from public.academy_course_modules m
  join course c on c.id = m.course_id
  where m.title = 'Introduction to PLCs'
  limit 1
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
    (
      'what-is-a-plc',
      'What is a PLC?',
      'A first look at programmable logic controllers and where they sit in industrial systems.',
      'dQw4w9WgXcQ',
      210,
      1,
      true
    ),
    (
      'digital-inputs-and-outputs',
      'Digital Inputs and Outputs',
      'Understand the basic signal flow between sensors, PLCs, and output devices.',
      'ysz5S6PUM-U',
      360,
      2,
      false
    ),
    (
      'basic-ladder-logic',
      'Basic Ladder Logic',
      'Read the first rung-level patterns used to express industrial control behavior.',
      'jNQXAC9IVRw',
      420,
      3,
      false
    )
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
