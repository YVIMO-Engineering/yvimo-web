-- Customer asset service events are presented as sharpening cycles in Assets.
-- Their stored service_type may retain a legacy technical label such as
-- "Manufacturing / Processing", so every non-skipped event consumes one cycle.
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

update public.mes_customer_assets asset
set estimated_life_percent = greatest(0, least(100,
      round(((asset.max_sharpenings - (
        select count(*)::integer
        from public.mes_customer_asset_service_events service
        where service.asset_id = asset.id
          and service.result <> 'skipped'
      ))::numeric / asset.max_sharpenings) * 100, 1)
    )),
    updated_at = now()
where asset.max_sharpenings is not null;
