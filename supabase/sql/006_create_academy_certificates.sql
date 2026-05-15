create table if not exists public.academy_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  certificate_code text not null unique,
  student_name text not null,
  student_email text not null,
  course_title text not null,
  course_slug text not null,
  course_category text,
  completed_lessons integer not null,
  total_lessons integer not null,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, course_id)
);

create index if not exists academy_certificates_user_issued_idx
  on public.academy_certificates(user_id, issued_at desc);

create or replace function public.has_completed_academy_course(
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
    from public.academy_lessons l
    where l.course_id = check_course_id
      and l.status = 'published'
    having count(l.id) > 0
      and count(l.id) = (
        select count(p.id)
        from public.academy_lesson_progress p
        where p.user_id = check_user_id
          and p.course_id = check_course_id
          and p.completed = true
      )
  );
$$;

drop trigger if exists set_academy_certificates_updated_at on public.academy_certificates;
create trigger set_academy_certificates_updated_at
before update on public.academy_certificates
for each row
execute function public.set_updated_at();

alter table public.academy_certificates enable row level security;

grant select, insert on public.academy_certificates to authenticated;
grant execute on function public.has_completed_academy_course(uuid, uuid) to authenticated;

drop policy if exists "Users can read own academy certificates" on public.academy_certificates;
create policy "Users can read own academy certificates"
on public.academy_certificates
for select
using (auth.uid() = user_id or public.is_admin_user(auth.uid()));

drop policy if exists "Users can create own academy certificates" on public.academy_certificates;
create policy "Users can create own academy certificates"
on public.academy_certificates
for insert
with check (
  auth.uid() = user_id
  and public.has_completed_academy_course(auth.uid(), course_id)
);

drop policy if exists "Admins can manage academy certificates" on public.academy_certificates;
create policy "Admins can manage academy certificates"
on public.academy_certificates
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));
