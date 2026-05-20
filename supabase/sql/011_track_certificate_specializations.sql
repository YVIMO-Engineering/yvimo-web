-- Distinguish parent track certificates by specialization path.
-- Example: PLC Technician Track can issue separate Siemens and Rockwell packages.

alter table public.academy_track_certificates
  add column if not exists specialization_id uuid references public.academy_track_specializations(id) on delete set null,
  add column if not exists specialization_slug text,
  add column if not exists specialization_title text;

update public.academy_track_certificates certificate
set
  specialization_id = specialization.id,
  specialization_slug = coalesce(certificate.specialization_slug, specialization.slug),
  specialization_title = coalesce(certificate.specialization_title, specialization.title)
from public.academy_track_specializations specialization
where certificate.specialization_id = specialization.id
  and (certificate.specialization_slug is null or certificate.specialization_title is null);

alter table public.academy_track_certificates
  drop constraint if exists academy_track_certificates_user_id_track_id_key;

drop index if exists academy_track_certificates_user_track_specialization_key;
create unique index academy_track_certificates_user_track_specialization_key
  on public.academy_track_certificates(user_id, track_id, coalesce(specialization_slug, ''));

create index if not exists academy_track_certificates_specialization_idx
  on public.academy_track_certificates(track_id, specialization_slug);
