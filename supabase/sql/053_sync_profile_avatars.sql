alter table public.profiles
add column if not exists avatar_url text;

grant update (avatar_url) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    company_name,
    role,
    subscription_tier,
    yvimo_points,
    experience_points,
    profile_level,
    profile_level_progress,
    avatar_url
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'company_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', ''),
    'Explorer',
    0,
    0,
    1,
    0,
    nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.sync_profile_avatar_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set avatar_url = nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), '')
  where id = new.id
    and avatar_url is distinct from nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), '');

  return new;
end;
$$;

drop trigger if exists sync_profile_avatar_from_auth on auth.users;
create trigger sync_profile_avatar_from_auth
after update of raw_user_meta_data on auth.users
for each row
execute function public.sync_profile_avatar_from_auth();

update public.profiles profile
set avatar_url = nullif(btrim(auth_user.raw_user_meta_data ->> 'avatar_url'), '')
from auth.users auth_user
where profile.id = auth_user.id
  and nullif(btrim(profile.avatar_url), '') is null
  and nullif(btrim(auth_user.raw_user_meta_data ->> 'avatar_url'), '') is not null;
