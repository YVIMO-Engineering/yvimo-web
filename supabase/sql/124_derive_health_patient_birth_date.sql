alter table public.health_patients add column if not exists birth_date date;

update public.health_patients
set birth_date = make_date(
  (case when substring(curp from 17 for 1) ~ '^[A-Z]$' then 2000 else 1900 end) + substring(curp from 5 for 2)::integer,
  substring(curp from 7 for 2)::integer,
  substring(curp from 9 for 2)::integer
)
where birth_date is null
  and curp ~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$';

alter table public.health_patients alter column birth_date set not null;
alter table public.health_patients drop column if exists age;

alter table public.health_patients drop constraint if exists health_patients_birth_date_check;
alter table public.health_patients add constraint health_patients_birth_date_check
  check (birth_date >= date '1895-01-01' and birth_date <= date '2100-12-31');
