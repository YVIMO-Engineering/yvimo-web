alter table public.health_patients
  add column if not exists sex text,
  add column if not exists age integer;

update public.health_patients set sex = 'Masculino' where sex is null;
update public.health_patients set age = 0 where age is null;

alter table public.health_patients
  alter column sex set not null,
  alter column age set not null;

alter table public.health_patients drop constraint if exists health_patients_sex_check;
alter table public.health_patients add constraint health_patients_sex_check check (sex in ('Masculino', 'Femenino'));
alter table public.health_patients drop constraint if exists health_patients_age_check;
alter table public.health_patients add constraint health_patients_age_check check (age between 0 and 130);
