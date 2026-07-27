-- RLS continues to restrict these operations to rows with
-- content_group = 'live_session' and Academy staff users.
grant insert, update, delete on public.academy_lessons to authenticated;
