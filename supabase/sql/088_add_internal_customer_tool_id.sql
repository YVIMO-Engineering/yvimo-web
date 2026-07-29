alter table public.mes_customer_tool_ids
  add column if not exists internal_tool_id text not null default '';

comment on column public.mes_customer_tool_ids.internal_tool_id is
  'Optional factory-specific identifier used internally for a customer Tool ID.';

create index if not exists mes_customer_tool_ids_internal_tool_idx
  on public.mes_customer_tool_ids (organization_id, lower(btrim(internal_tool_id)))
  where length(btrim(internal_tool_id)) > 0;
