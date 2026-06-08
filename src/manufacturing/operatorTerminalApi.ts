import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type { ProductionOrder, ProductionOrderManufacturingType, ProductionOrderPriority, ProductionOrderStatus } from './mesTypes';

type ProductionOrderRow = {
  id: string;
  order_number: string;
  part_number: string;
  part_name: string;
  planned_quantity: number;
  completed_quantity: number;
  scrap_quantity: number;
  status: ProductionOrderStatus;
  priority: ProductionOrderPriority;
  due_date: string;
  assigned_work_center: string;
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
    plannedQuantity: row.planned_quantity,
    completedQuantity: row.completed_quantity,
    scrapQuantity: row.scrap_quantity,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    assignedWorkCenter: row.assigned_work_center,
    manufacturingType: row.manufacturing_type ?? 'multi-step',
    productionFlow: row.production_flow ?? '',
    assignedStation: row.assigned_station ?? '',
  };
}

export async function fetchOperatorTerminalSnapshot(client: OperatorClient = supabase): Promise<OperatorTerminalSnapshot> {
  const { data: ordersData, error: ordersError } = await client
    .from('mes_production_orders')
    .select('*')
    .eq('manufacturing_type', 'single-operation')
    .in('status', ['released', 'running', 'paused'])
    .order('status', { ascending: false })
    .order('due_date', { ascending: true });

  if (ordersError) throw ordersError;

  const orders = ((ordersData ?? []) as ProductionOrderRow[]).map(mapProductionOrderRow);
  const currentOrder = orders.find((order) => order.status === 'running' || order.status === 'paused') ?? orders[0] ?? null;
  const stationCode = currentOrder?.assignedStation ?? '';
  const workCenterCode = currentOrder?.assignedWorkCenter ?? '';

  const [{ data: workCentersData, error: workCentersError }, { data: stationsData, error: stationsError }] = await Promise.all([
    client.from('mes_work_centers').select('id, code, name').order('name', { ascending: true }),
    client.from('mes_work_center_stations').select('id, work_center_id, code, name, type, image_url, status, operator, process_step').order('name', { ascending: true }),
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
    stationCode: string;
    goodDelta?: number;
    scrapDelta?: number;
    reason?: string;
    comment?: string;
  },
  client: OperatorClient = supabase,
): Promise<ProductionOrder> {
  const { data, error } = await client.rpc('mes_operator_report_production', {
    p_order_id: input.orderId,
    p_station_code: input.stationCode,
    p_good_delta: input.goodDelta ?? 0,
    p_scrap_delta: input.scrapDelta ?? 0,
    p_reason: input.reason ?? null,
    p_comment: input.comment ?? null,
  });

  if (error) throw error;
  return mapProductionOrderRow(data as ProductionOrderRow);
}

export async function setOperatorTerminalState(
  input: {
    orderId: string;
    stationCode: string;
    state: 'running' | 'paused' | 'down' | 'completed';
    reason?: string;
    comment?: string;
  },
  client: OperatorClient = supabase,
): Promise<ProductionOrder> {
  const { data, error } = await client.rpc('mes_operator_set_state', {
    p_order_id: input.orderId,
    p_station_code: input.stationCode,
    p_state: input.state,
    p_reason: input.reason ?? null,
    p_comment: input.comment ?? null,
  });

  if (error) throw error;
  return mapProductionOrderRow(data as ProductionOrderRow);
}

export async function saveOperatorTraceability(
  input: {
    orderId: string;
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
