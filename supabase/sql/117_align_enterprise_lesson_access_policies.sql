create or replace function public.can_access_academy_lesson(
  check_user_id uuid,
  check_lesson_id uuid
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
    join public.academy_courses c on c.id = l.course_id
    where l.id = check_lesson_id
      and l.status = 'published'
      and c.status = 'published'
      and (
        (
          l.content_group = 'live_session'
          and public.has_academy_live_session_access(check_user_id)
        )
        or (
          l.content_group = 'curriculum'
          and (
            l.is_preview = true
            or public.has_active_academy_enrollment(check_user_id, l.course_id)
          )
        )
      )
  );
$$;

revoke all on function public.can_access_academy_lesson(uuid, uuid) from public;
grant execute on function public.can_access_academy_lesson(uuid, uuid) to anon, authenticated;

drop policy if exists "Users can insert own academy lesson notes" on public.academy_lesson_notes;
create policy "Users can insert own academy lesson notes"
on public.academy_lesson_notes
for insert
with check (
  auth.uid() = user_id
  and public.can_access_academy_lesson(auth.uid(), lesson_id)
  and exists (
    select 1
    from public.academy_lessons l
    where l.id = lesson_id
      and l.course_id = course_id
  )
);

drop policy if exists "Users can update own academy lesson notes" on public.academy_lesson_notes;
create policy "Users can update own academy lesson notes"
on public.academy_lesson_notes
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and public.can_access_academy_lesson(auth.uid(), lesson_id)
  and exists (
    select 1
    from public.academy_lessons l
    where l.id = lesson_id
      and l.course_id = course_id
  )
);

drop policy if exists "Users can read academy lesson resources" on public.academy_lesson_resources;
create policy "Users can read academy lesson resources"
on public.academy_lesson_resources
for select
using (public.can_access_academy_lesson(auth.uid(), lesson_id));

drop policy if exists "Users can insert own lesson submissions" on public.academy_lesson_submissions;
create policy "Users can insert own lesson submissions"
on public.academy_lesson_submissions
for insert
with check (
  auth.uid() = user_id
  and public.can_access_academy_lesson(auth.uid(), lesson_id)
  and exists (
    select 1
    from public.academy_lessons l
    where l.id = lesson_id
      and l.course_id = course_id
  )
);

drop policy if exists "Users can read lesson resource files" on storage.objects;
create policy "Users can read lesson resource files"
on storage.objects
for select
using (
  bucket_id = 'academy-lesson-resources'
  and exists (
    select 1
    from public.academy_lesson_resources resource
    where resource.storage_path = name
      and public.can_access_academy_lesson(auth.uid(), resource.lesson_id)
  )
);

drop policy if exists "Users can upload own lesson submissions" on storage.objects;
create policy "Users can upload own lesson submissions"
on storage.objects
for insert
with check (
  bucket_id = 'academy-lesson-submissions'
  and auth.uid()::text = (storage.foldername(name))[1]
  and case
    when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.can_access_academy_lesson(
      auth.uid(),
      ((storage.foldername(name))[2])::uuid
    )
    else false
  end
);
