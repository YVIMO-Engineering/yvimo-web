drop function if exists public.get_customer_portal_production_tracking(uuid, uuid);
create function public.get_customer_portal_production_tracking(p_organization_id uuid, p_customer_id uuid)
returns table (production_order_id uuid, order_number text, received_at timestamptz, piece_type text, part_number text, order_status text, production_serial_id uuid, piece_sequence integer, tool_id text, serial_number text, before_notch numeric, before_tooth_length numeric, stock_to_remove numeric, after_tooth_length numeric, traceability_payload jsonb, machine text, reported_at timestamptz, result text, reception_status text)
language sql security definer stable set search_path = public as $$
select o.id,o.order_number,r.received_at,o.piece_type,o.part_number,o.status,s.id,s.piece_sequence,
 coalesce(nullif(btrim(s.tool_id),''),nullif(btrim(t.tool_id),'')),coalesce(nullif(btrim(s.serial_number),''),nullif(btrim(t.serial_number),'')),
 s.before_notch,s.before_tooth_length,s.stock_to_remove,t.after_tooth_length,t.payload,
 coalesce(st.name,nullif(btrim(s.assigned_station),''),nullif(btrim(o.assigned_station),'')),s.reported_at,s.result,
 case when r.sent_at is not null then 'sent' when r.coating_returned_at is not null then 'waiting-delivery' when r.coating_sent_at is not null then 'coating' when s.result='good' then 'quality-inspection' when r.reception_item_id is null then 'not-linked' else 'manufacturing' end
from public.mes_production_orders o
left join public.mes_production_serials s on s.production_order_id=o.id and s.organization_id=o.organization_id
left join lateral (select x.tool_id,x.serial_number,x.after_tooth_length,x.payload from public.mes_operator_terminal_traceability x where x.organization_id=o.organization_id and x.production_order_id=o.id and (x.id=s.traceability_id or lower(btrim(x.serial_number))=lower(btrim(s.serial_number))) order by (x.id=s.traceability_id) desc,x.created_at desc limit 1) t on true
left join lateral (select x.name from public.mes_work_center_stations x where x.organization_id=o.organization_id and x.code=coalesce(nullif(btrim(s.assigned_station),''),nullif(btrim(o.assigned_station),'')) order by x.updated_at desc limit 1) st on true
left join lateral (select i.id reception_item_id,coalesce(v.received_at,v.created_at) received_at,coalesce(p.coating_sent_at,i.coating_sent_at) coating_sent_at,coalesce(p.coating_returned_at,i.coating_returned_at) coating_returned_at,coalesce(p.sent_at,i.sent_at) sent_at from public.mes_customer_reception_items i join public.mes_customer_reception_vouchers v on v.id=i.reception_voucher_id left join public.mes_customer_reception_serial_progress p on p.reception_item_id=i.id and p.production_serial_id=s.id where i.production_order_id=o.id order by p.updated_at desc nulls last,i.created_at desc limit 1) r on true
where o.organization_id=p_organization_id and o.customer_id=p_customer_id and public.customer_portal_has_permission(p_organization_id,p_customer_id,'orders')
order by coalesce(r.received_at,o.created_at) desc,o.order_number desc,s.piece_sequence;
$$;
revoke all on function public.get_customer_portal_production_tracking(uuid, uuid) from public;
grant execute on function public.get_customer_portal_production_tracking(uuid, uuid) to authenticated;
