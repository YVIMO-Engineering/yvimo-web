alter table public.academy_track_certificates
  add column if not exists specialization_id uuid references public.academy_track_specializations(id) on delete set null,
  add column if not exists specialization_slug text,
  add column if not exists specialization_title text;

alter table public.academy_track_certificates
  drop constraint if exists academy_track_certificates_user_id_track_id_key;

drop index if exists academy_track_certificates_user_track_specialization_key;
create unique index academy_track_certificates_user_track_specialization_key
  on public.academy_track_certificates(user_id, track_id, coalesce(specialization_slug, ''));

create or replace function public.has_completed_academy_track_path(
  check_user_id uuid,
  check_track_id uuid,
  check_specialization_slug text default null
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with specialization as (
    select id
    from public.academy_track_specializations
    where track_id = check_track_id
      and slug = check_specialization_slug
    limit 1
  ),
  required_courses as (
    select c.id
    from public.academy_courses c
    where c.track_id = check_track_id
      and c.status = 'published'
      and (
        (
          check_specialization_slug is not null
          and exists (select 1 from specialization)
          and (
            c.is_common = true
            or c.specialization_id = (select id from specialization)
          )
        )
        or (
          check_specialization_slug is null
          and exists (
            select 1
            from public.academy_track_courses tc
            where tc.track_id = check_track_id
              and tc.course_id = c.id
              and tc.required_for_certificate = true
          )
        )
      )
  )
  select exists (select 1 from required_courses)
    and not exists (
      select 1
      from required_courses rc
      where not (
        public.has_completed_academy_course(check_user_id, rc.id)
        or exists (
          select 1
          from public.academy_certificates cert
          where cert.user_id = check_user_id
            and cert.course_id = rc.id
        )
      )
    );
$$;

grant execute on function public.has_completed_academy_track_path(uuid, uuid, text) to authenticated;

drop policy if exists "Users can create own academy track certificates" on public.academy_track_certificates;
create policy "Users can create own academy track certificates"
on public.academy_track_certificates
for insert
with check (
  auth.uid() = user_id
  and public.has_completed_academy_track_path(auth.uid(), track_id, specialization_slug)
);
