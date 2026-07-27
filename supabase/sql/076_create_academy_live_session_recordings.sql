alter table public.academy_lessons
add column if not exists content_group text not null default 'curriculum'
check (content_group in ('curriculum', 'live_session'));

create or replace function public.has_academy_staff_access(check_user_id uuid)
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
      and (
        lower(coalesce(role, '')) in ('admin', 'owner', 'mentor')
        or lower(coalesce(subscription_tier, '')) in ('instructor', 'owner', 'enterprise-admin')
      )
  );
$$;

create or replace function public.has_academy_live_session_access(check_user_id uuid)
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
      and (
        lower(coalesce(role, '')) in ('admin', 'owner', 'mentor')
        or lower(coalesce(subscription_tier, '')) in
          ('enterprise', 'beta tester', 'instructor', 'owner', 'enterprise-admin')
      )
  );
$$;

grant execute on function public.has_academy_live_session_access(uuid) to anon, authenticated;
grant insert, update, delete on public.academy_lessons to authenticated;

drop policy if exists "Users can read accessible academy lessons" on public.academy_lessons;
create policy "Users can read accessible academy lessons"
on public.academy_lessons
for select
using (
  public.is_admin_user(auth.uid())
  or public.has_academy_staff_access(auth.uid())
  or (
    content_group = 'live_session'
    and status = 'published'
    and public.has_academy_live_session_access(auth.uid())
    and exists (
      select 1 from public.academy_courses c
      where c.id = course_id and c.status = 'published'
    )
  )
  or (
    content_group = 'curriculum'
    and status = 'published'
    and (
      is_preview = true
      or public.has_active_academy_enrollment(auth.uid(), course_id)
    )
    and exists (
      select 1 from public.academy_courses c
      where c.id = course_id and c.status = 'published'
    )
  )
);

drop policy if exists "Staff can manage academy live sessions" on public.academy_lessons;
create policy "Staff can manage academy live sessions"
on public.academy_lessons
for all
using (content_group = 'live_session' and public.has_academy_staff_access(auth.uid()))
with check (content_group = 'live_session' and public.has_academy_staff_access(auth.uid()));

create or replace view public.academy_lesson_catalog as
select
  l.id, l.course_id, l.module_id, l.slug, l.title, l.description, l.lesson_type,
  case when l.is_preview then l.video_provider else null end as video_provider,
  case when l.is_preview then l.video_id else null end as video_id,
  case when l.is_preview then l.video_url else null end as video_url,
  l.duration_seconds, l.order_index, l.is_preview, l.status,
  l.created_at, l.updated_at, l.content_group
from public.academy_lessons l
join public.academy_courses c on c.id = l.course_id
where c.status = 'published'
  and l.status = 'published'
  and l.content_group = 'curriculum';

create or replace view public.academy_course_progress_summary as
select
  p.user_id, l.course_id, count(l.id) as total_lessons,
  count(p.id) filter (where p.completed = true) as completed_lessons,
  case when count(l.id) = 0 then 0 else round(
    (count(p.id) filter (where p.completed = true)::numeric / count(l.id)::numeric) * 100, 2
  ) end as course_progress_percent
from public.academy_lessons l
left join public.academy_lesson_progress p on p.lesson_id = l.id
where l.status = 'published' and l.content_group = 'curriculum'
group by p.user_id, l.course_id;

grant select on public.academy_lesson_catalog to anon, authenticated;
grant select on public.academy_course_progress_summary to authenticated;
