alter table public.academy_lessons
drop constraint if exists academy_lessons_video_provider_check;

alter table public.academy_lessons
add constraint academy_lessons_video_provider_check
check (
  video_provider is null
  or video_provider in (
    'youtube',
    'cloudflare_stream',
    'mux',
    'vimeo',
    'sharepoint',
    'local',
    'supabase'
  )
);
