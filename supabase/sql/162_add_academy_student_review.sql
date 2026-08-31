create or replace function public.list_academy_students()
returns table (
  id uuid,
  name text,
  email text,
  avatar_url text,
  subscription_tier text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name as name, u.email::text, p.avatar_url, p.subscription_tier
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin_user(auth.uid())
     or exists (
       select 1 from public.profiles staff
       where staff.id = auth.uid()
         and (
           lower(coalesce(staff.role, '')) in ('admin', 'owner', 'mentor')
           or lower(coalesce(staff.subscription_tier, '')) in ('owner', 'instructor', 'enterprise-admin')
         )
     )
  order by coalesce(nullif(p.full_name, ''), u.email::text);
$$;

revoke all on function public.list_academy_students() from public;
grant execute on function public.list_academy_students() to authenticated;

drop policy if exists "Academy staff can review lesson submissions" on public.academy_lesson_submissions;
create policy "Academy staff can review lesson submissions"
on public.academy_lesson_submissions
for all
using (
  public.is_admin_user(auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('owner', 'mentor')
        or lower(coalesce(p.subscription_tier, '')) in ('owner', 'instructor', 'enterprise-admin')
      )
  )
)
with check (
  public.is_admin_user(auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('owner', 'mentor')
        or lower(coalesce(p.subscription_tier, '')) in ('owner', 'instructor', 'enterprise-admin')
      )
  )
);

drop policy if exists "Academy staff can read submission files" on storage.objects;
create policy "Academy staff can read submission files"
on storage.objects for select
using (
  bucket_id = 'academy-lesson-submissions'
  and (
    public.is_admin_user(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          lower(coalesce(p.role, '')) in ('owner', 'mentor')
          or lower(coalesce(p.subscription_tier, '')) in ('owner', 'instructor', 'enterprise-admin')
        )
    )
  )
);

drop policy if exists "Academy staff can read activity attempts" on public.academy_activity_attempts;
create policy "Academy staff can read activity attempts"
on public.academy_activity_attempts for select
using (
  public.is_admin_user(auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('owner', 'mentor')
        or lower(coalesce(p.subscription_tier, '')) in ('owner', 'instructor', 'enterprise-admin')
      )
  )
);
