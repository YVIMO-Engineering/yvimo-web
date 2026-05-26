create or replace function public.reset_academy_activity_attempts_on_content_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_record public.academy_activity_attempts;
begin
  if old.type is distinct from new.type
    or old.config_json is distinct from new.config_json then
    for attempt_record in
      select *
      from public.academy_activity_attempts
      where activity_id = new.id
        and status = 'completed'
        and points_awarded > 0
    loop
      perform public.record_profile_points(
        attempt_record.user_id,
        -attempt_record.points_awarded,
        'academy_activity_content_reset:' || new.id::text || ':' || attempt_record.id::text,
        'Academy activity points revoked after content update',
        jsonb_build_object(
          'activity_id', new.id,
          'attempt_id', attempt_record.id,
          'course_id', new.course_id,
          'lesson_id', new.lesson_id,
          'previous_activity_type', old.type,
          'new_activity_type', new.type,
          'points_revoked', attempt_record.points_awarded
        )
      );
    end loop;

    delete from public.academy_activity_attempts
    where activity_id = new.id;
  end if;

  return new;
end;
$$;
