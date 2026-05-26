create or replace function public.complete_academy_activity(
  target_activity_id uuid,
  score_value numeric default 100,
  attempt_payload jsonb default '{}'::jsonb
)
returns public.academy_activity_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_activity public.academy_activities;
  existing_attempt public.academy_activity_attempts;
  saved_attempt public.academy_activity_attempts;
  normalized_score numeric;
  awarded_points integer;
begin
  if current_user_id is null then
    raise exception 'Sign in to complete activities.';
  end if;

  select *
  into target_activity
  from public.academy_activities
  where id = target_activity_id
    and is_published = true;

  if target_activity.id is null then
    raise exception 'Activity not found or not published.';
  end if;

  if not exists (
    select 1
    from public.academy_lessons l
    where l.id = target_activity.lesson_id
      and l.course_id = target_activity.course_id
      and l.status = 'published'
      and (
        l.is_preview = true
        or public.has_active_academy_enrollment(current_user_id, l.course_id)
      )
  ) then
    raise exception 'Activity is locked.';
  end if;

  select *
  into existing_attempt
  from public.academy_activity_attempts
  where user_id = current_user_id
    and activity_id = target_activity_id;

  if existing_attempt.status = 'completed' then
    return existing_attempt;
  end if;

  normalized_score := least(greatest(coalesce(score_value, 100), 0), 100);
  awarded_points := round(target_activity.points_reward * (normalized_score / 100.0))::integer;

  if awarded_points > 0 then
    perform public.record_profile_points(
      current_user_id,
      awarded_points,
      'academy_activity_completed:' || target_activity_id::text,
      'Academy activity completed',
      jsonb_build_object(
        'activity_id', target_activity.id,
        'course_id', target_activity.course_id,
        'lesson_id', target_activity.lesson_id,
        'activity_type', target_activity.type,
        'score', normalized_score,
        'configured_points_reward', target_activity.points_reward,
        'points_awarded', awarded_points
      )
    );
  end if;

  insert into public.academy_activity_attempts (
    user_id,
    activity_id,
    status,
    score,
    points_awarded,
    attempt_data_json,
    completed_at
  )
  values (
    current_user_id,
    target_activity_id,
    'completed',
    normalized_score,
    awarded_points,
    coalesce(attempt_payload, '{}'::jsonb),
    now()
  )
  on conflict (user_id, activity_id) do update
  set
    status = 'completed',
    score = excluded.score,
    points_awarded = excluded.points_awarded,
    attempt_data_json = excluded.attempt_data_json,
    completed_at = coalesce(public.academy_activity_attempts.completed_at, now())
  returning * into saved_attempt;

  return saved_attempt;
end;
$$;

revoke all on function public.complete_academy_activity(uuid, numeric, jsonb) from public;
grant execute on function public.complete_academy_activity(uuid, numeric, jsonb) to authenticated;
