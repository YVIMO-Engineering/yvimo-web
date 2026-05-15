create table if not exists public.academy_course_translations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  language_code text not null,
  title text,
  subtitle text,
  description text,
  category text,
  difficulty_level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(course_id, language_code)
);

create table if not exists public.academy_module_translations (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.academy_course_modules(id) on delete cascade,
  language_code text not null,
  title text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(module_id, language_code)
);

create table if not exists public.academy_lesson_translations (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  language_code text not null,
  title text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lesson_id, language_code)
);

create index if not exists academy_course_translations_language_idx
  on public.academy_course_translations(language_code);

create index if not exists academy_module_translations_language_idx
  on public.academy_module_translations(language_code);

create index if not exists academy_lesson_translations_language_idx
  on public.academy_lesson_translations(language_code);

drop trigger if exists set_academy_course_translations_updated_at on public.academy_course_translations;
create trigger set_academy_course_translations_updated_at
before update on public.academy_course_translations
for each row
execute function public.set_updated_at();

drop trigger if exists set_academy_module_translations_updated_at on public.academy_module_translations;
create trigger set_academy_module_translations_updated_at
before update on public.academy_module_translations
for each row
execute function public.set_updated_at();

drop trigger if exists set_academy_lesson_translations_updated_at on public.academy_lesson_translations;
create trigger set_academy_lesson_translations_updated_at
before update on public.academy_lesson_translations
for each row
execute function public.set_updated_at();

alter table public.academy_course_translations enable row level security;
alter table public.academy_module_translations enable row level security;
alter table public.academy_lesson_translations enable row level security;

grant select on public.academy_course_translations to anon, authenticated;
grant select on public.academy_module_translations to anon, authenticated;
grant select on public.academy_lesson_translations to anon, authenticated;
grant insert, update, delete on public.academy_course_translations to authenticated;
grant insert, update, delete on public.academy_module_translations to authenticated;
grant insert, update, delete on public.academy_lesson_translations to authenticated;

drop policy if exists "Public can read academy course translations" on public.academy_course_translations;
create policy "Public can read academy course translations"
on public.academy_course_translations
for select
using (
  exists (
    select 1
    from public.academy_courses c
    where c.id = course_id
      and (c.status = 'published' or public.is_admin_user(auth.uid()))
  )
);

drop policy if exists "Public can read academy module translations" on public.academy_module_translations;
create policy "Public can read academy module translations"
on public.academy_module_translations
for select
using (
  exists (
    select 1
    from public.academy_course_modules m
    join public.academy_courses c on c.id = m.course_id
    where m.id = module_id
      and (c.status = 'published' or public.is_admin_user(auth.uid()))
  )
);

drop policy if exists "Public can read academy lesson translations" on public.academy_lesson_translations;
create policy "Public can read academy lesson translations"
on public.academy_lesson_translations
for select
using (
  exists (
    select 1
    from public.academy_lessons l
    join public.academy_courses c on c.id = l.course_id
    where l.id = lesson_id
      and l.status = 'published'
      and (c.status = 'published' or public.is_admin_user(auth.uid()))
  )
);

drop policy if exists "Admins can manage academy course translations" on public.academy_course_translations;
create policy "Admins can manage academy course translations"
on public.academy_course_translations
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "Admins can manage academy module translations" on public.academy_module_translations;
create policy "Admins can manage academy module translations"
on public.academy_module_translations
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "Admins can manage academy lesson translations" on public.academy_lesson_translations;
create policy "Admins can manage academy lesson translations"
on public.academy_lesson_translations
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));
