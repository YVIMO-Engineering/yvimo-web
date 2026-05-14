grant select on public.academy_courses to anon, authenticated;
grant select on public.academy_course_modules to anon, authenticated;
grant select on public.academy_lessons to anon, authenticated;
grant select on public.academy_lesson_catalog to anon, authenticated;
grant select on public.academy_course_progress_summary to authenticated;

grant select, insert, update on public.academy_enrollments to authenticated;
grant select, insert, update on public.academy_lesson_progress to authenticated;

grant execute on function public.is_admin_user(uuid) to anon, authenticated;
grant execute on function public.has_active_academy_enrollment(uuid, uuid) to anon, authenticated;
