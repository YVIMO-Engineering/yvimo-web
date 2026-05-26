create or replace function public.reset_academy_activity_attempts_on_content_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.type is distinct from new.type
    or old.config_json is distinct from new.config_json then
    delete from public.academy_activity_attempts
    where activity_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists reset_academy_activity_attempts_after_content_change on public.academy_activities;
create trigger reset_academy_activity_attempts_after_content_change
after update of type, config_json on public.academy_activities
for each row
execute function public.reset_academy_activity_attempts_on_content_change();
