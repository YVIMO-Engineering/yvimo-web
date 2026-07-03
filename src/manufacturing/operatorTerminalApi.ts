import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type { ProductionOrder, ProductionOrderManufacturingType, ProductionOrderPriority, ProductionOrderStatus } from './mesTypes';

type ProductionOrderRow = {
  id: string;
  order_number: string;
  part_number: string;
  part_name: string;
  client_name?: string | null;
  customer_id?: string | null;
  planned_quantity: number;
  completed_quantity: number;
  scrap_quantity: number;
  status: ProductionOrderStatus;
  priority: ProductionOrderPriority;
  due_date: string;
  assigned_work_center: string;
  planned_shifts?: string[] | null;
  manufacturing_type?: ProductionOrderManufacturingType | null;
  production_flow?: string | null;
  assigned_station?: string | null;
};

type StationRow = {
  id: string;
  work_center_id: string;
  code: string;
  name: string;
  type: string;
  image_url: string | null;
  status: string;
  operator: string;
  process_step: string;
};

type WorkCenterRow = {
  id: string;
  code: string;
  name: string;
};

type OperatorTerminalEventRow = {
  id: string;
  production_order_id: string | null;
  work_center_code: string;
  station_code: string;
  event_type: string;
  quantity: number;
  reason: string | null;
  comment: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type OperatorScrapEvent = {
  id: string;
  timestamp: string;
  quantity: number;
  reason: string;
  comment: string;
  partNumber: string;
  partName: string;
  orderNumber: string;
  reportedTotal: number | null;
};

export type OperatorTerminalSnapshot = {
  currentOrder: ProductionOrder | null;
  activeOrders: ProductionOrder[];
  queuedOrders: ProductionOrder[];
  workCenterOptions: Array<{ id: string; code: string; name: string }>;
  stationOptions: Array<{
    id: string;
    workCenterId: string;
    workCenterCode: string;
    code: string;
    name: string;
    type: string;
    imageUrl: string;
    status: string;
    operator: string;
    shift: string;
    processStep: string;
  }>;
  station: {
    id: string;
    code: string;
    name: string;
    type: string;
    imageUrl: string;
    status: string;
    operator: string;
    shift: string;
    processStep: string;
  } | null;
  workCenter: {
    id: string;
    code: string;
    name: string;
  } | null;
};

type OperatorClient = SupabaseClient;

function mapProductionOrderRow(row: ProductionOrderRow): ProductionOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    partNumber: row.part_number,
    partName: row.part_name,
    clientName: row.client_name ?? '',
    customerId: row.customer_id ?? '',
    plannedQuantity: row.planned_quantity,
    completedQuantity: row.completed_quantity,
    scrapQuantity: row.scrap_quantity,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    assignedWorkCenter: row.assigned_work_center,
    plannedShifts: row.planned_shifts ?? [],
    manufacturingType: row.manufacturing_type ?? 'multi-step',
    productionFlow: row.production_flow ?? '',
    assignedStation: row.assigned_station ?? '',
  };
}

export async function fetchOperatorTerminalSnapshot(organizationId: string, client: OperatorClient = supabase): Promise<OperatorTerminalSnapshot> {
  const { data: ordersData, error: ordersError } = await client
    .from('mes_production_orders')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('manufacturing_type', 'single-operation')
    .in('status', ['released', 'running', 'paused'])
    .order('status', { ascending: false })
    .order('due_date', { ascending: true });

  if (ordersError) throw ordersError;

  const orders = ((ordersData ?? []) as ProductionOrderRow[]).map(mapProductionOrderRow);
  const currentOrder = orders.find((order) => order.status === 'running')
    ?? orders.find((order) => order.status === 'paused')
    ?? orders[0]
    ?? null;
  const stationCode = currentOrder?.assignedStation ?? '';
  const workCenterCode = currentOrder?.assignedWorkCenter ?? '';

  const [{ data: workCentersData, error: workCentersError }, { data: stationsData, error: stationsError }] = await Promise.all([
    client.from('mes_work_centers').select('id, code, name').eq('organization_id', organizationId).order('name', { ascending: true }),
    client.from('mes_work_center_stations').select('id, work_center_id, code, name, type, image_url, status, operator, process_step').eq('organization_id', organizationId).order('name', { ascending: true }),
  ]);

  if (workCentersError) throw workCentersError;
  if (stationsError) throw stationsError;

  const workCenters = (workCentersData ?? []) as WorkCenterRow[];
  const stations = (stationsData ?? []) as StationRow[];
  const workCenter = workCenters.find((candidate) => candidate.code === workCenterCode) ?? workCenters[0] ?? null;
  const station = stations.find((candidate) => candidate.code === stationCode && candidate.work_center_id === workCenter?.id)
    ?? stations.find((candidate) => candidate.work_center_id === workCenter?.id)
    ?? null;
  const workCenterCodeById = new Map(workCenters.map((candidate) => [candidate.id, candidate.code]));

  return {
    currentOrder,
    activeOrders: orders,
    queuedOrders: currentOrder ? orders.filter((order) => order.id !== currentOrder.id) : orders,
    workCenterOptions: workCenters.map((option) => ({ id: option.id, code: option.code, name: option.name })),
    stationOptions: stations.map((option) => ({
      id: option.id,
      workCenterId: option.work_center_id,
      workCenterCode: workCenterCodeById.get(option.work_center_id) ?? '',
      code: option.code,
      name: option.name,
      type: option.type,
      imageUrl: option.image_url ?? '',
      status: option.status,
      operator: option.operator,
      shift: 'A / Day',
      processStep: option.process_step,
    })),
    workCenter: workCenter ? { id: workCenter.id, code: workCenter.code, name: workCenter.name } : null,
    station: station ? {
      id: station.id,
      code: station.code,
      name: station.name,
      type: station.type,
      imageUrl: station.image_url ?? '',
      status: station.status,
      operator: station.operator,
      shift: 'A / Day',
      processStep: station.process_step,
    } : null,
  };
}

export async function reportOperatorProduction(
  input: {
    orderId: string;
    organizationId: string;
    stationCode: string;
    shift?: string;
    goodDelta?: number;
    scrapDelta?: number;
    serialNumber: string;
    traceability: Record<string, unknown>;
    reason?: string;
    comment?: string;
  },
  client: OperatorClient = supabase,
): Promise<ProductionOrder> {
  const { data, error } = await client.rpc('mes_operator_report_serialized_production', {
    p_order_id: input.orderId,
    p_organization_id: input.organizationId,
    p_station_code: input.stationCode,
    p_serial_number: input.serialNumber,
    p_result: input.scrapDelta ? 'scrap' : 'good',
    p_reason: input.reason ?? null,
    p_comment: input.comment ?? null,
    p_shift: input.shift ?? null,
    p_traceability: input.traceability,
  });

  if (error) throw error;
  return mapProductionOrderRow(data as ProductionOrderRow);
}

export async function fetchOperatorScrapEvents(
  input: {
    orderId: string;
    organizationId: string;
    stationCode: string;
    fallbackOrder?: Pick<ProductionOrder, 'orderNumber' | 'partNumber' | 'partName'>;
  },
  client: OperatorClient = supabase,
): Promise<OperatorScrapEvent[]> {
  const { data, error } = await client
    .from('mes_operator_terminal_events')
    .select('id, production_order_id, work_center_code, station_code, event_type, quantity, reason, comment, payload, created_at')
    .eq('production_order_id', input.orderId)
    .eq('organization_id', input.organizationId)
    .eq('station_code', input.stationCode)
    .eq('event_type', 'production-scrap')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as OperatorTerminalEventRow[]).map((row) => {
    const payload = row.payload ?? {};
    return {
      id: row.id,
      timestamp: row.created_at,
      quantity: row.quantity,
      reason: row.reason ?? 'Scrap reported',
      comment: row.comment ?? '',
      partNumber: typeof payload.part_number === 'string' ? payload.part_number : input.fallbackOrder?.partNumber ?? '',
      partName: typeof payload.part_name === 'string' ? payload.part_name : input.fallbackOrder?.partName ?? '',
      orderNumber: typeof payload.order_number === 'string' ? payload.order_number : input.fallbackOrder?.orderNumber ?? '',
      reportedTotal: typeof payload.reported_total === 'number' ? payload.reported_total : null,
    };
  });
}

export async function setOperatorTerminalState(
  input: {
    orderId: string;
    organizationId: string;
    stationCode: string;
    shift?: string;
    state: 'running' | 'paused' | 'down' | 'completed';
    reason?: string;
    comment?: string;
  },
  client: OperatorClient = supabase,
): Promise<ProductionOrder> {
  const { data, error } = await client.rpc('mes_operator_set_state', {
    p_order_id: input.orderId,
    p_organization_id: input.organizationId,
    p_station_code: input.stationCode,
    p_state: input.state,
    p_reason: input.reason ?? null,
    p_comment: input.comment ?? null,
    p_shift: input.shift ?? null,
  });

  if (error) throw error;
  return mapProductionOrderRow(data as ProductionOrderRow);
}

export async function switchOperatorActiveOrder(
  input: {
    orderId: string;
    organizationId: string;
    stationCode: string;
    shift?: string;
    comment?: string;
  },
  client: OperatorClient = supabase,
): Promise<ProductionOrder> {
  const { data, error } = await client.rpc('mes_operator_switch_active_order', {
    p_order_id: input.orderId,
    p_organization_id: input.organizationId,
    p_station_code: input.stationCode,
    p_comment: input.comment ?? null,
    p_shift: input.shift ?? null,
  });

  if (!error) return mapProductionOrderRow(data as ProductionOrderRow);

  const { data: selectedData, error: selectedError } = await client
    .from('mes_production_orders')
    .select('*')
    .eq('id', input.orderId)
    .eq('organization_id', input.organizationId)
    .single();

  if (selectedError) throw error;

  const selectedOrder = selectedData as ProductionOrderRow;
  const stationCode = input.stationCode || selectedOrder.assigned_station || '';

  await client
    .from('mes_production_orders')
    .update({ status: 'paused' })
    .neq('id', input.orderId)
    .eq('organization_id', input.organizationId)
    .eq('manufacturing_type', 'single-operation')
    .eq('assigned_work_center', selectedOrder.assigned_work_center)
    .eq('assigned_station', stationCode)
    .eq('status', 'running');

  const { data: updatedData, error: updateError } = await client
    .from('mes_production_orders')
    .update({ status: 'running' })
    .eq('id', input.orderId)
    .eq('organization_id', input.organizationId)
    .select('*')
    .single();

  if (updateError) throw error;

  await client
    .from('mes_work_center_stations')
    .update({
      current_job: selectedOrder.order_number,
      status: 'running',
      last_event: 'Active order changed',
    })
    .eq('organization_id', input.organizationId)
    .eq('code', stationCode);

  await client
    .from('mes_operator_terminal_events')
    .insert({
      production_order_id: input.orderId,
      organization_id: input.organizationId,
      work_center_code: selectedOrder.assigned_work_center,
      station_code: stationCode,
      event_type: 'job-resumed',
      comment: input.comment ?? null,
      payload: { action: 'active-order-switch', fallback: true, shift: input.shift ?? null },
    });

  return mapProductionOrderRow(updatedData as ProductionOrderRow);
}

export async function saveOperatorTraceability(
  input: {
    orderId: string;
    organizationId: string;
    stationCode: string;
    templateId: string;
    partLabel?: string;
    toolId?: string;
    serialNumber?: string;
    dimensionsUnit?: string;
    beforeNotch?: number | null;
    beforeToothLength?: number | null;
    damageCodes?: string[];
    damageImageUrl?: string | null;
    stockToRemove?: number | null;
    afterToothLength?: number | null;
    payload?: Record<string, unknown>;
  },
  client: OperatorClient = supabase,
) {
  const { data, error } = await client.rpc('mes_operator_save_traceability', {
    p_order_id: input.orderId,
    p_organization_id: input.organizationId,
    p_station_code: input.stationCode,
    p_template_id: input.templateId,
    p_part_label: input.partLabel ?? null,
    p_tool_id: input.toolId ?? null,
    p_serial_number: input.serialNumber ?? null,
    p_dimensions_unit: input.dimensionsUnit ?? 'in',
    p_before_notch: input.beforeNotch ?? null,
    p_before_tooth_length: input.beforeToothLength ?? null,
    p_damage_codes: input.damageCodes ?? [],
    p_damage_image_url: input.damageImageUrl ?? null,
    p_stock_to_remove: input.stockToRemove ?? null,
    p_after_tooth_length: input.afterToothLength ?? null,
    p_payload: input.payload ?? {},
  });

  if (error) throw error;
  return data;
}
