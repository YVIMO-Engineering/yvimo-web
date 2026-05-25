create table if not exists public.academy_lesson_resources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  title text not null,
  description text,
  file_name text not null,
  file_size bigint,
  mime_type text,
  storage_path text,
  public_url text,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path is not null or public_url is not null)
);

create table if not exists public.academy_lesson_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  file_name text not null,
  file_size bigint,
  mime_type text,
  storage_path text not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'reviewed', 'returned')),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists academy_lesson_resources_lesson_idx
  on public.academy_lesson_resources(lesson_id, order_index);

create index if not exists academy_lesson_submissions_user_lesson_idx
  on public.academy_lesson_submissions(user_id, lesson_id, submitted_at desc);

drop trigger if exists set_academy_lesson_resources_updated_at on public.academy_lesson_resources;
create trigger set_academy_lesson_resources_updated_at
before update on public.academy_lesson_resources
for each row
execute function public.set_updated_at();

drop trigger if exists set_academy_lesson_submissions_updated_at on public.academy_lesson_submissions;
create trigger set_academy_lesson_submissions_updated_at
before update on public.academy_lesson_submissions
for each row
execute function public.set_updated_at();

alter table public.academy_lesson_resources enable row level security;
alter table public.academy_lesson_submissions enable row level security;

grant select on public.academy_lesson_resources to anon, authenticated;
grant insert, update, delete on public.academy_lesson_resources to authenticated;
grant select, insert on public.academy_lesson_submissions to authenticated;

drop policy if exists "Users can read academy lesson resources" on public.academy_lesson_resources;
create policy "Users can read academy lesson resources"
on public.academy_lesson_resources
for select
using (
  exists (
    select 1
    from public.academy_lessons l
    where l.id = lesson_id
      and l.status = 'published'
  )
);

drop policy if exists "Admins can manage academy lesson resources" on public.academy_lesson_resources;
create policy "Admins can manage academy lesson resources"
on public.academy_lesson_resources
using (
  public.is_admin_user(auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.subscription_tier in ('Instructor', 'Owner')
  )
)
with check (
  public.is_admin_user(auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.subscription_tier in ('Instructor', 'Owner')
  )
);

drop policy if exists "Users can read own lesson submissions" on public.academy_lesson_submissions;
create policy "Users can read own lesson submissions"
on public.academy_lesson_submissions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own lesson submissions" on public.academy_lesson_submissions;
create policy "Users can insert own lesson submissions"
on public.academy_lesson_submissions
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.academy_lessons l
    where l.id = lesson_id
      and l.course_id = course_id
      and l.status = 'published'
  )
);

drop policy if exists "Admins can manage lesson submissions" on public.academy_lesson_submissions;
create policy "Admins can manage lesson submissions"
on public.academy_lesson_submissions
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('academy-lesson-resources', 'academy-lesson-resources', false, 104857600),
  ('academy-lesson-submissions', 'academy-lesson-submissions', false, 262144000)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

update storage.buckets
set file_size_limit = 262144000
where id = 'academy-lesson-submissions';

drop policy if exists "Admins can manage lesson resource files" on storage.objects;
create policy "Admins can manage lesson resource files"
on storage.objects
using (
  bucket_id = 'academy-lesson-resources'
  and (
    public.is_admin_user(auth.uid())
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.subscription_tier in ('Instructor', 'Owner')
    )
  )
)
with check (
  bucket_id = 'academy-lesson-resources'
  and (
    public.is_admin_user(auth.uid())
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.subscription_tier in ('Instructor', 'Owner')
    )
  )
);

drop policy if exists "Users can read lesson resource files" on storage.objects;
create policy "Users can read lesson resource files"
on storage.objects
for select
using (bucket_id = 'academy-lesson-resources');

drop policy if exists "Users can upload own lesson submissions" on storage.objects;
create policy "Users can upload own lesson submissions"
on storage.objects
for insert
with check (
  bucket_id = 'academy-lesson-submissions'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can read own lesson submission files" on storage.objects;
create policy "Users can read own lesson submission files"
on storage.objects
for select
using (
  bucket_id = 'academy-lesson-submissions'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Admins can read lesson submission files" on storage.objects;
create policy "Admins can read lesson submission files"
on storage.objects
for select
using (bucket_id = 'academy-lesson-submissions' and public.is_admin_user(auth.uid()));
