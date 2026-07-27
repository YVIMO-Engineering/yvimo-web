alter table public.academy_lessons
add column if not exists video_object_key text,
add column if not exists video_filename text,
add column if not exists video_mime_type text,
add column if not exists video_size_bytes bigint,
add column if not exists video_duration_seconds integer,
add column if not exists video_status text,
add column if not exists video_uploaded_at timestamptz;

alter table public.academy_lessons
drop constraint if exists academy_lessons_video_provider_check;

alter table public.academy_lessons
add constraint academy_lessons_video_provider_check
check (
  video_provider is null
  or video_provider in (
    'youtube', 'cloudflare_stream', 'cloudflare_r2', 'mux', 'vimeo',
    'sharepoint', 'local', 'supabase'
  )
);

alter table public.academy_lessons
drop constraint if exists academy_lessons_video_status_check;

alter table public.academy_lessons
add constraint academy_lessons_video_status_check
check (
  video_status is null
  or video_status in ('pending', 'uploading', 'verifying', 'ready', 'failed')
);

create table if not exists public.academy_recording_uploads (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  lesson_id uuid references public.academy_lessons(id) on delete set null,
  object_key text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type = 'video/mp4'),
  expected_size_bytes bigint not null check (expected_size_bytes > 0),
  verified_size_bytes bigint,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'claimed', 'failed')),
  expires_at timestamptz not null,
  verified_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists academy_recording_uploads_user_status_idx
  on public.academy_recording_uploads(user_id, status, expires_at);

alter table public.academy_recording_uploads enable row level security;
grant select, insert, update, delete on public.academy_recording_uploads to authenticated;

drop policy if exists "Staff can manage own academy recording uploads" on public.academy_recording_uploads;
create policy "Staff can manage own academy recording uploads"
on public.academy_recording_uploads
for all
using (
  auth.uid() = user_id
  and public.has_academy_staff_access(auth.uid())
)
with check (
  auth.uid() = user_id
  and public.has_academy_staff_access(auth.uid())
);

drop policy if exists "Staff can manage academy live sessions" on public.academy_lessons;
create policy "Staff can manage academy live sessions"
on public.academy_lessons
for all
using (
  content_group = 'live_session'
  and public.has_academy_staff_access(auth.uid())
)
with check (
  content_group = 'live_session'
  and public.has_academy_staff_access(auth.uid())
  and (
    video_provider is distinct from 'cloudflare_r2'
    or exists (
      select 1
      from public.academy_recording_uploads upload
      where upload.user_id = auth.uid()
        and upload.course_id = academy_lessons.course_id
        and upload.object_key = academy_lessons.video_object_key
        and upload.status = 'verified'
        and upload.claimed_at is null
        and upload.expires_at > now()
    )
  )
);

create or replace function public.claim_academy_r2_recording(
  target_upload_id uuid,
  target_course_id uuid,
  target_lesson_id uuid,
  target_slug text,
  target_title text,
  target_description text,
  target_status text,
  target_order_index integer
)
returns public.academy_lessons
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_upload public.academy_recording_uploads;
  saved_lesson public.academy_lessons;
begin
  if current_user_id is null or not public.has_academy_staff_access(current_user_id) then
    raise exception 'Academy staff access required.';
  end if;

  if target_upload_id is null then
    if target_lesson_id is null then
      raise exception 'A verified R2 upload is required for a new recording.';
    end if;
    update public.academy_lessons
    set slug = target_slug,
        title = target_title,
        description = nullif(target_description, ''),
        status = target_status
    where id = target_lesson_id
      and course_id = target_course_id
      and content_group = 'live_session'
      and video_provider = 'cloudflare_r2'
    returning * into saved_lesson;
    if saved_lesson.id is null then
      raise exception 'R2 live session recording not found.';
    end if;
    return saved_lesson;
  end if;

  select *
  into target_upload
  from public.academy_recording_uploads
  where id = target_upload_id
    and user_id = current_user_id
    and course_id = target_course_id
    and status = 'verified'
    and claimed_at is null
    and expires_at > now()
  for update;

  if target_upload.id is null then
    raise exception 'Verified upload not found, expired, or already claimed.';
  end if;

  if target_lesson_id is null then
    insert into public.academy_lessons (
      course_id, module_id, slug, title, description, lesson_type,
      video_provider, video_id, video_url, duration_seconds, order_index,
      is_preview, status, content_group, video_object_key, video_filename,
      video_mime_type, video_size_bytes, video_duration_seconds,
      video_status, video_uploaded_at
    ) values (
      target_course_id, null, target_slug, target_title, nullif(target_description, ''), 'video',
      'cloudflare_r2', null, null, null, target_order_index,
      false, target_status, 'live_session', target_upload.object_key,
      target_upload.original_filename, target_upload.mime_type,
      target_upload.verified_size_bytes, null, 'ready', target_upload.verified_at
    )
    returning * into saved_lesson;
  else
    update public.academy_lessons
    set
      slug = target_slug,
      title = target_title,
      description = nullif(target_description, ''),
      status = target_status,
      video_provider = 'cloudflare_r2',
      video_id = null,
      video_url = null,
      video_object_key = target_upload.object_key,
      video_filename = target_upload.original_filename,
      video_mime_type = target_upload.mime_type,
      video_size_bytes = target_upload.verified_size_bytes,
      video_status = 'ready',
      video_uploaded_at = target_upload.verified_at
    where id = target_lesson_id
      and course_id = target_course_id
      and content_group = 'live_session'
    returning * into saved_lesson;

    if saved_lesson.id is null then
      raise exception 'Live session recording not found.';
    end if;
  end if;

  update public.academy_recording_uploads
  set status = 'claimed', lesson_id = saved_lesson.id, claimed_at = now()
  where id = target_upload.id;

  return saved_lesson;
end;
$$;

grant execute on function public.claim_academy_r2_recording(
  uuid, uuid, uuid, text, text, text, text, integer
) to authenticated;

create table if not exists public.academy_r2_deletion_queue (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null,
  requested_by uuid references auth.users(id) on delete set null,
  object_key text not null unique,
  created_at timestamptz not null default now()
);

alter table public.academy_r2_deletion_queue enable row level security;
grant select, delete on public.academy_r2_deletion_queue to authenticated;

drop policy if exists "Staff can process own R2 deletion queue" on public.academy_r2_deletion_queue;
create policy "Staff can process own R2 deletion queue"
on public.academy_r2_deletion_queue
for all
using (
  requested_by = auth.uid()
  and public.has_academy_staff_access(auth.uid())
);

create or replace function public.queue_replaced_academy_r2_object()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.video_provider = 'cloudflare_r2'
    and old.video_object_key is not null
    and (
      tg_op = 'DELETE'
      or old.video_object_key is distinct from new.video_object_key
    )
  then
    insert into public.academy_r2_deletion_queue(recording_id, requested_by, object_key)
    values (old.id, auth.uid(), old.video_object_key)
    on conflict (object_key) do nothing;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists queue_replaced_academy_r2_object on public.academy_lessons;
create trigger queue_replaced_academy_r2_object
after update of video_object_key or delete on public.academy_lessons
for each row execute function public.queue_replaced_academy_r2_object();
