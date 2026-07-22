alter table public.mes_customer_assets
  add column if not exists max_sharpenings integer
  check (max_sharpenings is null or max_sharpenings > 0);

create or replace function public.refresh_customer_asset_useful_life(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_sharpenings integer;
  v_completed_sharpenings integer;
begin
  select asset.max_sharpenings
    into v_max_sharpenings
  from public.mes_customer_assets asset
  where asset.id = p_asset_id;

  if v_max_sharpenings is null then
    return;
  end if;

  select count(*)::integer
    into v_completed_sharpenings
  from public.mes_customer_asset_service_events service
  where service.asset_id = p_asset_id
    and service.result <> 'skipped';

  update public.mes_customer_assets
  set estimated_life_percent = greatest(0, least(100,
        round(((v_max_sharpenings - v_completed_sharpenings)::numeric / v_max_sharpenings) * 100, 1)
      )),
      updated_at = now()
  where id = p_asset_id;
end;
$$;

create or replace function public.refresh_customer_asset_useful_life_from_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_customer_asset_useful_life(coalesce(new.asset_id, old.asset_id));
  if tg_op = 'UPDATE' and old.asset_id is distinct from new.asset_id then
    perform public.refresh_customer_asset_useful_life(old.asset_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_customer_asset_useful_life_from_service
  on public.mes_customer_asset_service_events;
create trigger refresh_customer_asset_useful_life_from_service
  after insert or update or delete on public.mes_customer_asset_service_events
  for each row execute function public.refresh_customer_asset_useful_life_from_service();

create or replace function public.refresh_customer_asset_useful_life_from_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.max_sharpenings is distinct from old.max_sharpenings then
    perform public.refresh_customer_asset_useful_life(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_customer_asset_useful_life_from_limit
  on public.mes_customer_assets;
create trigger refresh_customer_asset_useful_life_from_limit
  after insert or update of max_sharpenings on public.mes_customer_assets
  for each row execute function public.refresh_customer_asset_useful_life_from_limit();

update public.mes_customer_assets asset
set estimated_life_percent = greatest(0, least(100,
      round(((asset.max_sharpenings - (
        select count(*)::integer
        from public.mes_customer_asset_service_events service
        where service.asset_id = asset.id
          and service.result <> 'skipped'
      ))::numeric / asset.max_sharpenings) * 100, 1)
    ))
where asset.max_sharpenings is not null;
