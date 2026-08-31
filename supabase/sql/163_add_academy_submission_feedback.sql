alter table public.academy_lesson_submissions
  add column if not exists reviewer_feedback text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

create index if not exists academy_lesson_submissions_reviewed_by_idx
  on public.academy_lesson_submissions(reviewed_by, reviewed_at desc);
