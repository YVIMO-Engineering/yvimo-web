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
        lower(coalesce(role, '')) in ('admin', 'owner')
        or subscription_tier in ('Instructor', 'Owner')
      )
  );
$$;

create table if not exists public.academy_activities (
  id uuid primary key default gen_random_uuid(),
  track_id uuid references public.academy_tracks(id) on delete set null,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  type text not null check (type in ('quick_check', 'industrial_scenario', 'simulation_task')),
  title text not null,
  instructions text,
  difficulty text,
  points_reward integer not null default 0 check (points_reward >= 0),
  is_required boolean not null default true,
  is_published boolean not null default false,
  order_index integer not null default 0,
  config_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_activity_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.academy_activities(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'failed')),
  score numeric(5,2),
  points_awarded integer not null default 0 check (points_awarded >= 0),
  attempt_data_json jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id, activity_id)
);

create index if not exists academy_activities_lesson_order_idx
  on public.academy_activities(lesson_id, order_index);

create index if not exists academy_activities_course_order_idx
  on public.academy_activities(course_id, order_index);

create unique index if not exists academy_activities_lesson_title_idx
  on public.academy_activities(lesson_id, title);

create index if not exists academy_activity_attempts_user_activity_idx
  on public.academy_activity_attempts(user_id, activity_id);

drop trigger if exists set_academy_activities_updated_at on public.academy_activities;
create trigger set_academy_activities_updated_at
before update on public.academy_activities
for each row
execute function public.set_updated_at();

alter table public.academy_activities enable row level security;
alter table public.academy_activity_attempts enable row level security;

grant select on public.academy_activities to anon, authenticated;
grant insert, update, delete on public.academy_activities to authenticated;
grant select, insert, update on public.academy_activity_attempts to authenticated;
grant execute on function public.has_academy_staff_access(uuid) to anon, authenticated;

drop policy if exists "Users can read published academy activities" on public.academy_activities;
create policy "Users can read published academy activities"
on public.academy_activities
for select
using (
  public.has_academy_staff_access(auth.uid())
  or (
    is_published = true
    and exists (
      select 1
      from public.academy_courses c
      where c.id = course_id
        and c.status = 'published'
    )
    and exists (
      select 1
      from public.academy_lessons l
      where l.id = lesson_id
        and l.status = 'published'
    )
  )
);

drop policy if exists "Staff can manage academy activities" on public.academy_activities;
create policy "Staff can manage academy activities"
on public.academy_activities
for all
using (public.has_academy_staff_access(auth.uid()))
with check (public.has_academy_staff_access(auth.uid()));

drop policy if exists "Users can read own academy activity attempts" on public.academy_activity_attempts;
create policy "Users can read own academy activity attempts"
on public.academy_activity_attempts
for select
using (auth.uid() = user_id or public.has_academy_staff_access(auth.uid()));

drop policy if exists "Users can insert own academy activity attempts" on public.academy_activity_attempts;
create policy "Users can insert own academy activity attempts"
on public.academy_activity_attempts
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.academy_activities a
    join public.academy_lessons l on l.id = a.lesson_id
    where a.id = activity_id
      and a.is_published = true
      and l.status = 'published'
      and (
        l.is_preview = true
        or public.has_active_academy_enrollment(auth.uid(), a.course_id)
      )
  )
);

drop policy if exists "Users can update own academy activity attempts" on public.academy_activity_attempts;
create policy "Users can update own academy activity attempts"
on public.academy_activity_attempts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Staff can manage academy activity attempts" on public.academy_activity_attempts;
create policy "Staff can manage academy activity attempts"
on public.academy_activity_attempts
for all
using (public.has_academy_staff_access(auth.uid()))
with check (public.has_academy_staff_access(auth.uid()));

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

  if target_activity.points_reward > 0 then
    perform public.record_profile_points(
      current_user_id,
      target_activity.points_reward,
      'academy_activity_completed:' || target_activity_id::text,
      'Academy activity completed',
      jsonb_build_object(
        'activity_id', target_activity.id,
        'course_id', target_activity.course_id,
        'lesson_id', target_activity.lesson_id,
        'activity_type', target_activity.type
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
    least(greatest(coalesce(score_value, 100), 0), 100),
    target_activity.points_reward,
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

with target_course as (
  select id
  from public.academy_courses
  where slug = 'plc-programming-fundamentals'
  union all
  select id
  from public.academy_courses
  where slug = 'industrial-automation-fundamentals'
  limit 1
),
target_track as (
  select tc.track_id, tc.course_id
  from public.academy_track_courses tc
  join target_course c on c.id = tc.course_id
  limit 1
),
ranked_lessons as (
  select
    l.*,
    row_number() over (order by l.order_index, l.created_at) as rn
  from public.academy_lessons l
  join target_course c on c.id = l.course_id
  where l.status = 'published'
)
insert into public.academy_activities (
  track_id,
  course_id,
  lesson_id,
  type,
  title,
  instructions,
  difficulty,
  points_reward,
  is_required,
  is_published,
  order_index,
  config_json
)
select
  tt.track_id,
  l.course_id,
  l.id,
  case
    when l.rn in (6, 7, 8) then 'industrial_scenario'
    when l.rn in (9, 10) then 'simulation_task'
    else 'quick_check'
  end,
  case
    when l.rn in (6, 7, 8) then 'Industrial Scenario - ' || l.title
    when l.rn in (9, 10) then 'Simulation Task - ' || l.title
    else 'Quick Check - ' || l.title
  end,
  'Complete this activity to reinforce the lesson before moving on.',
  case when l.rn <= 4 then 'Beginner' when l.rn <= 8 then 'Intermediate' else 'Applied' end,
  case when l.rn in (9, 10) then 20 when l.rn in (6, 7, 8) then 15 else 10 end,
  true,
  true,
  l.order_index,
  case
    when l.rn in (6, 7, 8) then jsonb_build_object(
      'context', 'PLC is in RUN and the machine is waiting for a real field condition.',
      'problemDescription', 'Use the status values to choose the best next troubleshooting step.',
      'machineStatus', 'Stopped with permissive missing',
      'statusTags', jsonb_build_array(
        jsonb_build_object('label', 'I0.0 Start Button', 'value', 'ON'),
        jsonb_build_object('label', 'I0.1 E-stop OK', 'value', 'ON'),
        jsonb_build_object('label', 'I0.2 Sensor', 'value', 'OFF'),
        jsonb_build_object('label', 'Q0.0 Motor Output', 'value', 'OFF')
      ),
      'question', 'What should you check first?',
      'choices', jsonb_build_array(
        jsonb_build_object('id', 'a', 'text', 'Ethernet switch color'),
        jsonb_build_object('id', 'b', 'text', 'Sensor alignment or missing permissive'),
        jsonb_build_object('id', 'c', 'text', 'HMI language setting')
      ),
      'correctChoiceId', 'b',
      'explanation', 'The sensor/permissive is OFF, so the sequence may be waiting before energizing the output.'
    )
    when l.rn in (9, 10) then jsonb_build_object(
      'simulationType', case when l.rn = 9 then 'start_stop_latch' else 'alarm_reset' end,
      'objective', case when l.rn = 9 then 'Start the motor, then stop it correctly.' else 'Acknowledge the alarm and reset it safely.' end,
      'initialState', case when l.rn = 9
        then jsonb_build_object('startButton', false, 'stopButton', false, 'estopOk', true, 'motorRunning', false)
        else jsonb_build_object('alarmActive', true, 'resetPressed', false, 'systemReady', false)
      end,
      'successCondition', case when l.rn = 9
        then jsonb_build_object('requiredEvents', jsonb_build_array('motor_started', 'motor_stopped'))
        else jsonb_build_object('requiredEvents', jsonb_build_array('alarm_seen', 'alarm_reset'))
      end,
      'explanation', 'This frontend simulation checks the expected operator sequence without connecting to a real PLC.'
    )
    else jsonb_build_object(
      'questions', jsonb_build_array(
        jsonb_build_object(
          'id', 'q1',
          'type', 'multiple_choice',
          'question', 'Which answer best matches the main idea from "' || l.title || '"?',
          'options', jsonb_build_array(
            jsonb_build_object('id', 'a', 'text', 'Ignore field signals and only check the screen'),
            jsonb_build_object('id', 'b', 'text', 'Connect PLC logic to real machine conditions'),
            jsonb_build_object('id', 'c', 'text', 'Replace every sensor before troubleshooting')
          ),
          'correctOptionId', 'b',
          'explanation', 'PLC work connects program logic, field devices, and machine behavior.'
        )
      )
    )
  end
from ranked_lessons l
left join target_track tt on tt.course_id = l.course_id
on conflict do nothing;
