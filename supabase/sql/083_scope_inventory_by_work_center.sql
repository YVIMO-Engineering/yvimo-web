alter table public.mes_inventory_items
  add column if not exists work_center_id uuid references public.mes_work_centers(id) on delete restrict;

update public.mes_inventory_items item
set work_center_id = coalesce(
  (
    select station.work_center_id
    from public.mes_inventory_item_stations link
    join public.mes_work_center_stations station on station.id = link.station_id
    where link.inventory_item_id = item.id
    group by station.work_center_id
    order by count(*) desc
    limit 1
  ),
  (
    select center.id
    from public.mes_work_centers center
    where center.organization_id = item.organization_id
    order by
      case when lower(btrim(center.name)) = 'gleason norte' then 0 else 1 end,
      center.created_at,
      center.id
    limit 1
  )
)
where item.work_center_id is null;

do $$
begin
  if not exists (select 1 from public.mes_inventory_items where work_center_id is null) then
    alter table public.mes_inventory_items alter column work_center_id set not null;
  end if;
end;
$$;

create index if not exists mes_inventory_items_work_center_idx
  on public.mes_inventory_items (organization_id, work_center_id, section_id);

comment on column public.mes_inventory_items.work_center_id is
  'Work Center location whose inventory owns this item.';
