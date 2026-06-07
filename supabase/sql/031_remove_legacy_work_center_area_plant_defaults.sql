alter table public.mes_work_centers
  alter column plant set default '',
  alter column area set default '';

update public.mes_work_centers
set
  plant = '',
  area = ''
where plant = 'Main Plant'
  and area = 'Receiving';
