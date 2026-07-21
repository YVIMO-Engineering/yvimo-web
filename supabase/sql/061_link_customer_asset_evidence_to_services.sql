alter table public.mes_customer_asset_attachments
  add column if not exists service_event_id uuid
  references public.mes_customer_asset_service_events(id) on delete set null;

create index if not exists mes_customer_asset_attachments_service_event_idx
  on public.mes_customer_asset_attachments (service_event_id);

create or replace function public.link_customer_asset_attachment_to_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.service_event_id is null and new.storage_bucket = 'mes-quality-inspection-documents' then
    select service.id
      into new.service_event_id
    from public.mes_quality_inspection_documents document
    join public.mes_customer_asset_service_events service
      on service.organization_id = new.organization_id
      and service.asset_id = new.asset_id
      and service.production_order_id = document.production_order_id
    where document.organization_id = new.organization_id
      and document.file_path = new.file_path
    order by service.service_date desc
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists link_customer_asset_attachment_to_service
  on public.mes_customer_asset_attachments;
create trigger link_customer_asset_attachment_to_service
  before insert or update of file_path, service_event_id
  on public.mes_customer_asset_attachments
  for each row execute function public.link_customer_asset_attachment_to_service();

update public.mes_customer_asset_attachments attachment
set service_event_id = service.id
from public.mes_quality_inspection_documents document
join public.mes_customer_asset_service_events service
  on service.organization_id = document.organization_id
  and service.production_order_id = document.production_order_id
where attachment.service_event_id is null
  and attachment.storage_bucket = 'mes-quality-inspection-documents'
  and attachment.organization_id = document.organization_id
  and attachment.file_path = document.file_path
  and service.asset_id = attachment.asset_id;
