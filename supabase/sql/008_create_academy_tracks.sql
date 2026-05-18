create table if not exists public.academy_tracks (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  short_title text not null,
  description text,
  subtitle text,
  level text,
  certificate_type text not null default 'Certificate track',
  estimated_duration text default 'Self-paced',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_track_courses (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.academy_tracks(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  step integer not null,
  required_for_certificate boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(track_id, course_id),
  unique(track_id, step)
);

create table if not exists public.academy_track_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.academy_tracks(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'completed', 'revoked')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, track_id)
);

create table if not exists public.academy_track_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.academy_tracks(id) on delete cascade,
  certificate_code text not null unique,
  student_name text not null,
  student_email text not null,
  track_title text not null,
  track_slug text not null,
  completed_courses integer not null,
  total_courses integer not null,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, track_id)
);

create index if not exists academy_track_courses_track_step_idx
  on public.academy_track_courses(track_id, step);

create index if not exists academy_track_enrollments_user_track_idx
  on public.academy_track_enrollments(user_id, track_id);

create index if not exists academy_track_certificates_user_issued_idx
  on public.academy_track_certificates(user_id, issued_at desc);

drop trigger if exists set_academy_tracks_updated_at on public.academy_tracks;
create trigger set_academy_tracks_updated_at
before update on public.academy_tracks
for each row
execute function public.set_updated_at();

drop trigger if exists set_academy_track_courses_updated_at on public.academy_track_courses;
create trigger set_academy_track_courses_updated_at
before update on public.academy_track_courses
for each row
execute function public.set_updated_at();

drop trigger if exists set_academy_track_enrollments_updated_at on public.academy_track_enrollments;
create trigger set_academy_track_enrollments_updated_at
before update on public.academy_track_enrollments
for each row
execute function public.set_updated_at();

drop trigger if exists set_academy_track_certificates_updated_at on public.academy_track_certificates;
create trigger set_academy_track_certificates_updated_at
before update on public.academy_track_certificates
for each row
execute function public.set_updated_at();

create or replace function public.has_completed_academy_track(
  check_user_id uuid,
  check_track_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.academy_track_courses tc
    where tc.track_id = check_track_id
      and tc.required_for_certificate = true
    having count(tc.id) > 0
      and count(tc.id) = count(tc.id) filter (
        where public.has_completed_academy_course(check_user_id, tc.course_id)
          or exists (
            select 1
            from public.academy_certificates cert
            where cert.user_id = check_user_id
              and cert.course_id = tc.course_id
          )
      )
  );
$$;

create or replace view public.academy_track_progress_summary as
with track_users as (
  select user_id from public.academy_lesson_progress
  union
  select user_id from public.academy_certificates
  union
  select user_id from public.academy_track_enrollments
)
select
  tu.user_id,
  t.id as track_id,
  t.slug as track_slug,
  count(tc.id) filter (where tc.required_for_certificate = true) as total_courses,
  count(tc.id) filter (
    where tc.required_for_certificate = true
      and (
        cert.id is not null
        or (
          cps.total_lessons > 0
          and cps.completed_lessons = cps.total_lessons
        )
      )
  ) as completed_courses,
  case
    when count(tc.id) filter (where tc.required_for_certificate = true) = 0 then 0
    else round(
      (
        count(tc.id) filter (
          where tc.required_for_certificate = true
            and (
              cert.id is not null
              or (
                cps.total_lessons > 0
                and cps.completed_lessons = cps.total_lessons
              )
            )
        )::numeric
        / count(tc.id) filter (where tc.required_for_certificate = true)::numeric
      ) * 100,
      2
    )
  end as track_progress_percent
from track_users tu
cross join public.academy_tracks t
join public.academy_track_courses tc on tc.track_id = t.id
join public.academy_courses c on c.id = tc.course_id
left join public.academy_course_progress_summary cps
  on cps.user_id = tu.user_id
  and cps.course_id = c.id
left join public.academy_certificates cert
  on cert.user_id = tu.user_id
  and cert.course_id = c.id
where t.status = 'published'
  and c.status = 'published'
group by tu.user_id, t.id, t.slug;

alter table public.academy_tracks enable row level security;
alter table public.academy_track_courses enable row level security;
alter table public.academy_track_enrollments enable row level security;
alter table public.academy_track_certificates enable row level security;

grant select on public.academy_tracks to anon, authenticated;
grant select on public.academy_track_courses to anon, authenticated;
grant select, insert, update on public.academy_track_enrollments to authenticated;
grant select, insert on public.academy_track_certificates to authenticated;
grant select on public.academy_track_progress_summary to authenticated;
grant execute on function public.has_completed_academy_track(uuid, uuid) to authenticated;

drop policy if exists "Public can read published academy tracks" on public.academy_tracks;
create policy "Public can read published academy tracks"
on public.academy_tracks
for select
using (status = 'published' or public.is_admin_user(auth.uid()));

drop policy if exists "Admins can manage academy tracks" on public.academy_tracks;
create policy "Admins can manage academy tracks"
on public.academy_tracks
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "Public can read courses for published academy tracks" on public.academy_track_courses;
create policy "Public can read courses for published academy tracks"
on public.academy_track_courses
for select
using (
  public.is_admin_user(auth.uid())
  or exists (
    select 1
    from public.academy_tracks t
    where t.id = track_id
      and t.status = 'published'
  )
);

drop policy if exists "Admins can manage academy track courses" on public.academy_track_courses;
create policy "Admins can manage academy track courses"
on public.academy_track_courses
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "Users can read own academy track enrollments" on public.academy_track_enrollments;
create policy "Users can read own academy track enrollments"
on public.academy_track_enrollments
for select
using (auth.uid() = user_id or public.is_admin_user(auth.uid()));

drop policy if exists "Users can start published academy tracks" on public.academy_track_enrollments;
create policy "Users can start published academy tracks"
on public.academy_track_enrollments
for insert
with check (
  auth.uid() = user_id
  and status = 'active'
  and exists (
    select 1
    from public.academy_tracks t
    where t.id = track_id
      and t.status = 'published'
  )
);

drop policy if exists "Users can update own academy track enrollments" on public.academy_track_enrollments;
create policy "Users can update own academy track enrollments"
on public.academy_track_enrollments
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Admins can manage academy track enrollments" on public.academy_track_enrollments;
create policy "Admins can manage academy track enrollments"
on public.academy_track_enrollments
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "Users can read own academy track certificates" on public.academy_track_certificates;
create policy "Users can read own academy track certificates"
on public.academy_track_certificates
for select
using (auth.uid() = user_id or public.is_admin_user(auth.uid()));

drop policy if exists "Users can create own academy track certificates" on public.academy_track_certificates;
create policy "Users can create own academy track certificates"
on public.academy_track_certificates
for insert
with check (
  auth.uid() = user_id
  and public.has_completed_academy_track(auth.uid(), track_id)
);

drop policy if exists "Admins can manage academy track certificates" on public.academy_track_certificates;
create policy "Admins can manage academy track certificates"
on public.academy_track_certificates
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));
