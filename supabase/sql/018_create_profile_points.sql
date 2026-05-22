alter table public.profiles
add column if not exists yvimo_points integer not null default 0;

alter table public.profiles
add column if not exists experience_points integer not null default 0;

alter table public.profiles
add column if not exists profile_level integer not null default 1;

alter table public.profiles
add column if not exists profile_level_progress integer not null default 0;

alter table public.profiles
drop constraint if exists profiles_yvimo_points_check;

alter table public.profiles
add constraint profiles_yvimo_points_check
check (yvimo_points >= 0);

alter table public.profiles
drop constraint if exists profiles_experience_points_check;

alter table public.profiles
add constraint profiles_experience_points_check
check (experience_points >= 0);

alter table public.profiles
drop constraint if exists profiles_profile_level_check;

alter table public.profiles
add constraint profiles_profile_level_check
check (profile_level >= 1);

alter table public.profiles
drop constraint if exists profiles_profile_level_progress_check;

alter table public.profiles
add constraint profiles_profile_level_progress_check
check (profile_level_progress >= 0 and profile_level_progress <= 100);

create table if not exists public.profile_point_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  points_delta integer not null check (points_delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  event_key text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profile_point_events enable row level security;

drop policy if exists "Users can select their own point events" on public.profile_point_events;
create policy "Users can select their own point events"
on public.profile_point_events
for select
using (auth.uid() = profile_id);

create index if not exists profile_point_events_profile_id_created_at_idx
on public.profile_point_events (profile_id, created_at desc);

create table if not exists public.profile_experience_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  experience_delta integer not null check (experience_delta <> 0),
  experience_after integer not null check (experience_after >= 0),
  level_after integer not null check (level_after >= 1),
  level_progress_after integer not null check (level_progress_after >= 0 and level_progress_after <= 100),
  event_key text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profile_experience_events enable row level security;

drop policy if exists "Users can select their own experience events" on public.profile_experience_events;
create policy "Users can select their own experience events"
on public.profile_experience_events
for select
using (auth.uid() = profile_id);

create index if not exists profile_experience_events_profile_id_created_at_idx
on public.profile_experience_events (profile_id, created_at desc);

grant select on public.profiles to authenticated;
revoke insert, update on public.profiles from authenticated;
grant insert (id, full_name, company_name, role) on public.profiles to authenticated;
grant update (full_name, company_name, role) on public.profiles to authenticated;
grant select on public.profile_point_events to authenticated;
grant select on public.profile_experience_events to authenticated;

create or replace function public.get_profile_level_for_experience(total_experience integer)
returns integer
language sql
immutable
as $$
  select greatest(
    1,
    floor((1 + sqrt(1 + (8 * greatest(total_experience, 0)::numeric / 100))) / 2)::integer
  );
$$;

create or replace function public.get_profile_level_start_experience(profile_level integer)
returns integer
language sql
immutable
as $$
  select ((greatest(profile_level, 1) - 1) * greatest(profile_level, 1) / 2) * 100;
$$;

create or replace function public.get_profile_level_progress(total_experience integer)
returns integer
language plpgsql
immutable
as $$
declare
  current_level integer;
  current_start integer;
  next_start integer;
begin
  current_level := public.get_profile_level_for_experience(total_experience);
  current_start := public.get_profile_level_start_experience(current_level);
  next_start := public.get_profile_level_start_experience(current_level + 1);

  if next_start <= current_start then
    return 0;
  end if;

  return greatest(
    0,
    least(
      100,
      floor(((greatest(total_experience, 0) - current_start)::numeric / (next_start - current_start)) * 100)::integer
    )
  );
end;
$$;

create or replace function public.record_profile_points(
  target_profile_id uuid,
  points_delta integer,
  event_key text,
  description text default null,
  metadata jsonb default '{}'::jsonb
)
returns public.profile_point_events
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
  inserted_event public.profile_point_events;
begin
  if points_delta = 0 then
    raise exception 'points_delta must not be zero';
  end if;

  update public.profiles
  set yvimo_points = yvimo_points + points_delta
  where id = target_profile_id
    and yvimo_points + points_delta >= 0
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'profile not found or resulting balance is negative';
  end if;

  insert into public.profile_point_events (
    profile_id,
    points_delta,
    balance_after,
    event_key,
    description,
    metadata,
    created_by
  )
  values (
    target_profile_id,
    points_delta,
    updated_profile.yvimo_points,
    event_key,
    description,
    coalesce(metadata, '{}'::jsonb),
    auth.uid()
  )
  returning * into inserted_event;

  return inserted_event;
end;
$$;

revoke all on function public.record_profile_points(uuid, integer, text, text, jsonb) from public;
revoke all on function public.record_profile_points(uuid, integer, text, text, jsonb) from authenticated;

create or replace function public.record_profile_experience(
  target_profile_id uuid,
  experience_delta integer,
  event_key text,
  description text default null,
  metadata jsonb default '{}'::jsonb
)
returns public.profile_experience_events
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
  next_level integer;
  next_progress integer;
  inserted_event public.profile_experience_events;
begin
  if experience_delta = 0 then
    raise exception 'experience_delta must not be zero';
  end if;

  update public.profiles
  set experience_points = experience_points + experience_delta
  where id = target_profile_id
    and experience_points + experience_delta >= 0
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'profile not found or resulting experience is negative';
  end if;

  next_level := public.get_profile_level_for_experience(updated_profile.experience_points);
  next_progress := public.get_profile_level_progress(updated_profile.experience_points);

  update public.profiles
  set
    profile_level = next_level,
    profile_level_progress = next_progress
  where id = target_profile_id
  returning * into updated_profile;

  insert into public.profile_experience_events (
    profile_id,
    experience_delta,
    experience_after,
    level_after,
    level_progress_after,
    event_key,
    description,
    metadata,
    created_by
  )
  values (
    target_profile_id,
    experience_delta,
    updated_profile.experience_points,
    updated_profile.profile_level,
    updated_profile.profile_level_progress,
    event_key,
    description,
    coalesce(metadata, '{}'::jsonb),
    auth.uid()
  )
  returning * into inserted_event;

  return inserted_event;
end;
$$;

revoke all on function public.record_profile_experience(uuid, integer, text, text, jsonb) from public;
revoke all on function public.record_profile_experience(uuid, integer, text, text, jsonb) from authenticated;
