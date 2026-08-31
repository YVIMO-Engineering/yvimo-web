create table if not exists public.academy_track_projects (
  id uuid primary key default gen_random_uuid(),
  track_slug text not null,
  specialization_slug text,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  title text not null,
  description text not null default '',
  resource_id uuid references public.academy_lesson_resources(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists academy_track_projects_track_specialization_idx
  on public.academy_track_projects (track_slug, coalesce(specialization_slug, ''));

drop trigger if exists set_academy_track_projects_updated_at on public.academy_track_projects;
create trigger set_academy_track_projects_updated_at
before update on public.academy_track_projects
for each row execute function public.set_updated_at();

alter table public.academy_track_projects enable row level security;
grant select on public.academy_track_projects to authenticated;
grant insert, update, delete on public.academy_track_projects to authenticated;

drop policy if exists "Enterprise users can read academy track projects" on public.academy_track_projects;
create policy "Enterprise users can read academy track projects"
on public.academy_track_projects for select
using (
  public.is_admin_user(auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.subscription_tier, '')) in ('enterprise', 'beta tester', 'instructor', 'owner', 'enterprise-admin')
  )
);

drop policy if exists "Academy staff can manage track projects" on public.academy_track_projects;
create policy "Academy staff can manage track projects"
on public.academy_track_projects
for all
using (
  public.is_admin_user(auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.subscription_tier, '')) in ('instructor', 'owner')
  )
)
with check (
  public.is_admin_user(auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.subscription_tier, '')) in ('instructor', 'owner')
  )
);
