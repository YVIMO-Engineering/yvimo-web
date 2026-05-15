create table if not exists public.academy_lesson_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, lesson_id)
);

create index if not exists academy_lesson_notes_user_course_idx
  on public.academy_lesson_notes(user_id, course_id);

drop trigger if exists set_academy_lesson_notes_updated_at on public.academy_lesson_notes;
create trigger set_academy_lesson_notes_updated_at
before update on public.academy_lesson_notes
for each row
execute function public.set_updated_at();

alter table public.academy_lesson_notes enable row level security;

grant select, insert, update on public.academy_lesson_notes to authenticated;

drop policy if exists "Users can read own academy lesson notes" on public.academy_lesson_notes;
create policy "Users can read own academy lesson notes"
on public.academy_lesson_notes
for select
using (auth.uid() = user_id or public.is_admin_user(auth.uid()));

drop policy if exists "Users can insert own academy lesson notes" on public.academy_lesson_notes;
create policy "Users can insert own academy lesson notes"
on public.academy_lesson_notes
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

drop policy if exists "Users can update own academy lesson notes" on public.academy_lesson_notes;
create policy "Users can update own academy lesson notes"
on public.academy_lesson_notes
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

drop policy if exists "Admins can manage academy lesson notes" on public.academy_lesson_notes;
create policy "Admins can manage academy lesson notes"
on public.academy_lesson_notes
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));
