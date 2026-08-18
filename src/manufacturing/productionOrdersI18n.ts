import React from 'react';

const es: Record<string, string> = {
  'MES Applications': 'Aplicaciones MES', 'MES / Production Orders': 'MES / Órdenes de producción', 'Production Orders': 'Órdenes de producción',
  'Create, release, execute, and close orders with live quantities and shop-floor actions.': 'Crea, libera, ejecuta y cierra órdenes con cantidades en vivo y acciones de piso de producción.',
  From: 'Desde', To: 'Hasta', 'Add Production Order': 'Agregar orden de producción', 'Pending Work Report': 'Reporte de trabajo pendiente', 'Daily Production Report': 'Reporte diario de producción', 'Loading Report': 'Cargando reporte',
  'Last produced part': 'Última pieza producida', 'Last Produced Part': 'Última pieza producida', 'All work centers · Live shop-floor update': 'Todos los centros de trabajo · Actualización en vivo',
  'Part type': 'Tipo de pieza', 'Part Type': 'Tipo de pieza', Order: 'Orden', Client: 'Cliente', Serial: 'Serie', Produced: 'Producido', 'Search orders': 'Buscar órdenes', 'Order, part, client, status': 'Orden, pieza, cliente, estado',
  'Order register': 'Registro de órdenes', 'Production order queue': 'Cola de órdenes de producción', 'All clients': 'Todos los clientes', 'All work centers': 'Todos los centros de trabajo', All: 'Todas', 'In progress': 'En progreso', Completed: 'Completadas', Priority: 'Prioridad',
  'Order controls': 'Controles de orden', 'Selected order': 'Orden seleccionada', 'Order Details': 'Detalles de la orden', Edit: 'Editar', Delete: 'Eliminar', 'Work Center': 'Centro de trabajo', Created: 'Creada', Progress: 'Progreso', 'Job Queue': 'Cola de trabajo', Traceability: 'Trazabilidad',
  Planned: 'Planeado', Scrap: 'Desecho', Status: 'Estado', Due: 'Entrega', Normal: 'Normal', High: 'Alta', Low: 'Baja', 'Loading production orders...': 'Cargando órdenes de producción...',
  'Add New Production Order': 'Agregar nueva orden de producción', 'Edit Production Order': 'Editar orden de producción', 'Create Production Order': 'Crear orden de producción', 'Update Production Order': 'Actualizar orden de producción', Cancel: 'Cancelar', Save: 'Guardar', 'Saving...': 'Guardando...',
  Customer: 'Cliente', 'Select customer': 'Seleccionar cliente', 'Production Type': 'Tipo de producción', 'Single-step': 'Un solo paso', 'Multi-step': 'Múltiples pasos', 'Part Number': 'Número de parte', 'Part Name': 'Nombre de pieza', 'Planned Quantity': 'Cantidad planeada', 'Due Date': 'Fecha de entrega', 'Assigned Work Center': 'Centro de trabajo asignado', 'Select work center': 'Seleccionar centro de trabajo', Notes: 'Notas',
  'Quality Check': 'Control de calidad', 'Assign Serial Numbers': 'Asignar números de serie', 'Assign Tool IDs and Serial Numbers': 'Asignar Tool IDs y números de serie', Enabled: 'Habilitado', Disabled: 'Deshabilitado', 'Tool ID': 'Tool ID', 'Serial Number': 'Número de serie', Station: 'Estación', 'Select station': 'Seleccionar estación',
  Close: 'Cerrar', Download: 'Descargar', 'Downloading...': 'Descargando...', 'Production Order Details': 'Detalles de orden de producción', 'Production Quantity': 'Cantidad de producción', 'Time Spent': 'Tiempo transcurrido', 'Order Timeline': 'Cronología de la orden', Reception: 'Recepción', Production: 'Producción', Quality: 'Calidad', Damage: 'Daño', Coating: 'Recubrimiento', Pieces: 'Piezas', Measurements: 'Mediciones', Evidence: 'Evidencia',
  'No measurements': 'Sin mediciones', 'Not captured': 'No registrado', 'No documents': 'Sin documentos', None: 'Ninguno', Pending: 'Pendiente', Running: 'En ejecución', Setup: 'Preparación', Good: 'Buena', Released: 'Liberada', 'Release Piece': 'Liberar pieza', Release: 'Liberar', Reason: 'Motivo', 'Confirmation code': 'Código de confirmación',
  'Current job': 'Trabajo actual', 'No active job': 'Sin trabajo activo', 'No production reported': 'Sin producción reportada', 'All machines': 'Todas las máquinas', 'No machine snapshots available': 'No hay datos disponibles de máquinas', 'Pending Work': 'Trabajo pendiente', Generated: 'Generado', 'Total pending': 'Total pendiente', Manufacturing: 'Manufactura', Inspection: 'Inspección', Quotation: 'Cotización', Machines: 'Máquinas', 'Work center': 'Centro de trabajo', 'Open quantity': 'Cantidad abierta', 'Current state': 'Estado actual',
  'Daily Production': 'Producción diaria', 'Weekly production': 'Producción semanal', 'Good produced': 'Producción buena', 'Orders worked': 'Órdenes trabajadas', 'Machines active': 'Máquinas activas', 'Production activity': 'Actividad de producción', 'No production activity was recorded for this period.': 'No se registró actividad de producción para este periodo.',
  Previous: 'Anterior', Next: 'Siguiente', Page: 'Página', of: 'de', showing: 'mostrando', visible: 'visibles', total: 'total', Today: 'Hoy', 'This week': 'Esta semana', 'This month': 'Este mes', 'Last month': 'Mes anterior', 'This year': 'Este año', Search: 'Buscar', 'No evidence': 'Sin evidencia', 'Not linked': 'Sin vínculo', Available: 'Disponible', Waiting: 'En espera', Complete: 'Completar', 'In Progress': 'En progreso',
  'Delete Production Order': 'Eliminar orden de producción', 'Are you sure you want to delete this production order?': '¿Seguro que deseas eliminar esta orden de producción?', Confirm: 'Confirmar', 'Working...': 'Procesando...', 'No orders found': 'No se encontraron órdenes', 'No production orders found': 'No se encontraron órdenes de producción',
  'Production Order': 'Orden de producción', 'Add new production order': 'Agregar nueva orden de producción', 'Order Number': 'Número de orden', Date: 'Fecha',
  'Order number': 'Número de orden', 'Part number': 'Número de parte', 'Part name': 'Nombre de pieza',
  'Planned quantity': 'Cantidad planeada', 'Completed quantity': 'Cantidad completada', 'Scrap quantity': 'Cantidad de desecho',
  'Due date': 'Fecha de entrega', 'Assigned work center': 'Centro de trabajo asignado',
  'Select part type': 'Seleccionar tipo de pieza', 'Completed Quantity': 'Cantidad completada', Expedite: 'Urgente', 'Planned Shifts': 'Turnos planeados',
  'Shift 1': 'Turno 1', 'Shift 2': 'Turno 2', 'Shift 3': 'Turno 3', 'Used to calculate scheduled utilization and machine load.': 'Se utiliza para calcular la utilización programada y la carga de las máquinas.',
  'Preload each planned piece so Operator Terminal can pick from the available list.': 'Precarga cada pieza planeada para que la Terminal del Operador pueda seleccionarla de la lista disponible.',
  'Configure the inspections required for every serialized piece in this order.': 'Configura las inspecciones requeridas para cada pieza serializada de esta orden.',
  'Manufacturing Type': 'Tipo de manufactura', 'Multiple Steps': 'Múltiples pasos', 'Single Operation': 'Operación única',
  'Route this order through a production flow.': 'Procesa esta orden mediante un flujo de producción.', 'Run this order on one station.': 'Ejecuta esta orden en una estación.',
  'Assign stations': 'Asignar estaciones', 'Save order': 'Guardar orden', 'Assign Tool IDs and serial numbers': 'Asignar Tool IDs y números de serie', Done: 'Listo',
  'Edit assignments': 'Editar asignaciones', 'Production order priority': 'Prioridad de la orden de producción',
  'Production order manufacturing type': 'Tipo de manufactura de la orden de producción',
  Part: 'Pieza', 'Before Sharpening Notch Length': 'Longitud de muesca antes del afilado', 'Before Sharpening Tooth Length': 'Longitud de diente antes del afilado',
  'Stock to Remove': 'Material por remover', 'Reception Inspection': 'Inspección de recepción', 'Source Quotation': 'Cotización de origen', 'Legacy Price': 'Precio histórico',
  'Select Tool ID': 'Seleccionar Tool ID', 'Select Serial Number': 'Seleccionar número de serie', 'Photo / PDF': 'Foto / PDF', 'Select quotation': 'Seleccionar cotización', 'Select / enter price': 'Seleccionar / ingresar precio',
  'Multi-step Order': 'Orden de múltiples pasos', 'Assign Stations to Pieces': 'Asignar estaciones a las piezas', 'Compatible Stations (Select at least one)': 'Estaciones compatibles (selecciona al menos una)',
  'Serial pending': 'Serie pendiente', 'Select a Work Center with configured stations.': 'Selecciona un centro de trabajo con estaciones configuradas.',
  'ORDER NUMBER': 'NÚMERO DE ORDEN', 'PART NUMBER': 'NÚMERO DE PARTE', 'PART NAME': 'NOMBRE DE PIEZA', 'PLANNED QUANTITY': 'CANTIDAD PLANEADA', 'COMPLETED QUANTITY': 'CANTIDAD COMPLETADA',
  'DUE DATE': 'FECHA DE ENTREGA', 'ASSIGNED WORK CENTER': 'CENTRO DE TRABAJO ASIGNADO',
  LOW: 'BAJA', HIGH: 'ALTA', EXPEDITE: 'URGENTE',
  'pieces assigned': 'piezas asignadas', 'pieces assigned to compatible stations': 'piezas asignadas a estaciones compatibles', 'to compatible stations': 'a estaciones compatibles',
  'Before Sharpening': 'Antes del afilado', Height: 'Altura', 'Notch Length': 'Longitud de muesca', 'Tooth Length': 'Longitud de diente',
  'Compatible stations (select at least one)': 'Estaciones compatibles (selecciona al menos una)',
  'Select work center first': 'Selecciona primero un centro de trabajo', 'No stations configured for this Work Center yet.': 'Aún no hay estaciones configuradas para este centro de trabajo.',
  'Close assignments': 'Cerrar asignaciones',
};

const months: Record<string, string> = { Jan: 'ene', Feb: 'feb', Mar: 'mar', Apr: 'abr', May: 'may', Jun: 'jun', Jul: 'jul', Aug: 'ago', Sep: 'sep', Oct: 'oct', Nov: 'nov', Dec: 'dic', January: 'enero', February: 'febrero', March: 'marzo', April: 'abril', June: 'junio', July: 'julio', August: 'agosto', September: 'septiembre', October: 'octubre', November: 'noviembre', December: 'diciembre' };
const scopes = '.production-orders-workspace,[class*="production-order"],[class*="pending-work-report"],[class*="daily-production"]';

function translate(value: string) {
  const trimmed = value.trim(); if (!trimmed) return value;
  let next = es[trimmed] ?? trimmed;
  next = next.replace(/\b(January|February|March|April|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (month) => months[month] ?? month)
    .replace(/(\d+) showing \/ (\d+) visible \/ (\d+) total/i, '$1 mostrando / $2 visibles / $3 total').replace(/^Page (\d+) of (\d+)$/, 'Página $1 de $2')
    .replace(/^(\d+) pieces$/, '$1 piezas').replace(/^(\d+) pending$/, '$1 pendientes').replace(/^(\d+) of (\d+) pieces assigned to compatible stations$/, '$1 de $2 piezas asignadas a estaciones compatibles').replace(/^Due (.+)$/, 'Entrega $1').replace(/ · Generated /g, ' · Generado ');
  return value.replace(trimmed, next);
}

function localize(root: ParentNode) {
  root.querySelectorAll(scopes).forEach((scope) => {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT); const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    nodes.forEach((node) => { const next = translate(node.data); if (next !== node.data) node.data = next; });
    scope.querySelectorAll<HTMLElement>('[placeholder],[title],[aria-label]').forEach((element) => ['placeholder', 'title', 'aria-label'].forEach((attribute) => { const value = element.getAttribute(attribute); if (value) { const next = translate(value); if (next !== value) element.setAttribute(attribute, next); } }));
  });
}

export function useProductionOrdersI18n(languageCode: string) {
  React.useEffect(() => {
    if (languageCode !== 'es') return;
    let queued = false; const run = () => { queued = false; localize(document); }; run();
    const observer = new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(run); } });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [languageCode]);
}
