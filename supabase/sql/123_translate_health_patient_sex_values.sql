alter table public.health_patients drop constraint if exists health_patients_sex_check;

update public.health_patients set sex = 'Male' where sex = 'Masculino';
update public.health_patients set sex = 'Female' where sex = 'Femenino';

alter table public.health_patients
  add constraint health_patients_sex_check check (sex in ('Male', 'Female'));
