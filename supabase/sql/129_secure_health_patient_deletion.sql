create extension if not exists pgcrypto;

create or replace function public.delete_health_patient_with_password(p_patient_id uuid, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  patient_organization_id uuid;
begin
  if encode(digest(coalesce(p_password, ''), 'sha256'), 'hex') <> '900a2a973f16a40b9b15f18628e4cb6982aaf96075c2e4f2d36ddab7a2153775' then
    raise exception 'Invalid deletion password';
  end if;
  select organization_id into patient_organization_id from public.health_patients where id = p_patient_id;
  if patient_organization_id is null then raise exception 'Patient not found'; end if;
  if not public.is_manufacturing_organization_member(patient_organization_id, auth.uid()) then raise exception 'Organization membership required'; end if;
  delete from public.health_patients where id = p_patient_id;
  return true;
end;
$$;

revoke all on function public.delete_health_patient_with_password(uuid, text) from public;
grant execute on function public.delete_health_patient_with_password(uuid, text) to authenticated;
