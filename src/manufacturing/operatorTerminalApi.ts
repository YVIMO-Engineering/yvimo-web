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

type ProductionSerialRow = {
  id: string;
  production_order_id: string;
  piece_sequence: number;
  tool_id: string | null;
  serial_number: string;
  result: 'good' | 'scrap' | null;
  ready_for_quality: boolean;
  traceability_id: string | null;
  reported_at: string | null;
};

type OperatorTraceabilityRecordRow = {
  id: string;
  production_order_id: string | null;
  work_center_code: string;
  station_code: string;
  template_id: string;
  part_label: string | null;
  tool_id: string | null;
  serial_number: string | null;
  dimensions_unit: string;
  before_notch: number | null;
  before_tooth_length: number | null;
  damage_codes: string[] | null;
  damage_image_url: string | null;
  stock_to_remove: number | null;
  after_tooth_length: number | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type OperatorProductionSerial = {
  id: string;
  productionOrderId: string;
  pieceSequence: number;
  toolId: string;
  serialNumber: string;
  result: 'good' | 'scrap' | null;
  readyForQuality: boolean;
  traceabilityId: string;
  reportedAt: string;
};

export type OperatorTraceabilityRecord = {
  id: string;
  productionOrderId: string;
  workCenterCode: string;
  stationCode: string;
  templateId: string;
  partLabel: string;
  toolId: string;
  serialNumber: string;
  dimensionsUnit: string;
  beforeNotch: number | null;
  beforeToothLength: number | null;
  damageCodes: string[];
  damageImageUrl: string;
  stockToRemove: number | null;
  afterToothLength: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
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

function mapProductionSerialRow(row: ProductionSerialRow): OperatorProductionSerial {
  return {
    id: row.id,
    productionOrderId: row.production_order_id,
    pieceSequence: row.piece_sequence,
    toolId: row.tool_id ?? '',
    serialNumber: row.serial_number,
    result: row.result,
    readyForQuality: row.ready_for_quality,
    traceabilityId: row.traceability_id ?? '',
    reportedAt: row.reported_at ?? '',
  };
}

function mapOperatorTraceabilityRecordRow(row: OperatorTraceabilityRecordRow): OperatorTraceabilityRecord {
  return {
    id: row.id,
    productionOrderId: row.production_order_id ?? '',
    workCenterCode: row.work_center_code,
    stationCode: row.station_code,
    templateId: row.template_id,
    partLabel: row.part_label ?? '',
    toolId: row.tool_id ?? '',
    serialNumber: row.serial_number ?? '',
    dimensionsUnit: row.dimensions_unit,
    beforeNotch: row.before_notch,
    beforeToothLength: row.before_tooth_length,
    damageCodes: row.damage_codes ?? [],
    damageImageUrl: row.damage_image_url ?? '',
    stockToRemove: row.stock_to_remove,
    afterToothLength: row.after_tooth_length,
    payload: row.payload ?? {},
    createdAt: row.created_at,
  };
}

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

export async function fetchOperatorProductionSerials(
  input: {
    orderId: string;
    organizationId: string;
  },
  client: OperatorClient = supabase,
): Promise<OperatorProductionSerial[]> {
  const { data, error } = await client
    .from('mes_production_serials')
    .select('id, production_order_id, piece_sequence, tool_id, serial_number, result, ready_for_quality, traceability_id, reported_at')
    .eq('organization_id', input.organizationId)
    .eq('production_order_id', input.orderId)
    .order('piece_sequence', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as ProductionSerialRow[]).map(mapProductionSerialRow);
}

export async function fetchOperatorTraceabilityRecord(
  input: {
    traceabilityId: string;
    organizationId: string;
  },
  client: OperatorClient = supabase,
): Promise<OperatorTraceabilityRecord> {
  const { data, error } = await client
    .from('mes_operator_terminal_traceability')
    .select('id, production_order_id, work_center_code, station_code, template_id, part_label, tool_id, serial_number, dimensions_unit, before_notch, before_tooth_length, damage_codes, damage_image_url, stock_to_remove, after_tooth_length, payload, created_at')
    .eq('id', input.traceabilityId)
    .eq('organization_id', input.organizationId)
    .single();

  if (error) throw error;
  return mapOperatorTraceabilityRecordRow(data as OperatorTraceabilityRecordRow);
}

export async function correctOperatorMeasurement(
  input: {
    organizationId: string;
    order: Pick<ProductionOrder, 'id' | 'orderNumber' | 'partNumber' | 'partName' | 'assignedWorkCenter'>;
    serial: OperatorProductionSerial;
    stationCode: string;
    shift?: string;
    operator?: string;
    previousTraceability: OperatorTraceabilityRecord;
    correctedTraceability: Record<string, unknown>;
  },
  client: OperatorClient = supabase,
): Promise<OperatorProductionSerial> {
  const correctedPayload = (input.correctedTraceability.payload ?? {}) as Record<string, unknown>;
  const correctedSerialNumber = typeof input.correctedTraceability.serial_number === 'string'
    ? input.correctedTraceability.serial_number
    : input.serial.serialNumber;
  const correctedToolId = typeof input.correctedTraceability.tool_id === 'string'
    ? input.correctedTraceability.tool_id
    : null;

  const { data: serialData, error: serialError } = await client
    .from('mes_production_serials')
    .update({
      tool_id: correctedToolId,
      serial_number: correctedSerialNumber,
      traceability_id: input.previousTraceability.id,
    })
    .eq('id', input.serial.id)
    .eq('organization_id', input.organizationId)
    .select('id, production_order_id, piece_sequence, tool_id, serial_number, result, ready_for_quality, traceability_id, reported_at')
    .single();

  if (serialError) throw serialError;

  const { error: traceabilityError } = await client
    .from('mes_operator_terminal_traceability')
    .update({
      template_id: input.correctedTraceability.template_id,
      part_label: input.correctedTraceability.part_label,
      tool_id: correctedToolId,
      serial_number: correctedSerialNumber,
      dimensions_unit: input.correctedTraceability.dimensions_unit,
      before_notch: input.correctedTraceability.before_notch,
      before_tooth_length: input.correctedTraceability.before_tooth_length,
      damage_codes: input.correctedTraceability.damage_codes,
      damage_image_url: input.correctedTraceability.damage_image_url,
      stock_to_remove: input.correctedTraceability.stock_to_remove,
      after_tooth_length: input.correctedTraceability.after_tooth_length,
      payload: {
        ...correctedPayload,
        corrected_at: new Date().toISOString(),
        corrected_from_traceability_id: input.previousTraceability.id,
      },
    })
    .eq('id', input.previousTraceability.id)
    .eq('organization_id', input.organizationId);

  if (traceabilityError) throw traceabilityError;

  const previousSnapshot = {
    template_id: input.previousTraceability.templateId,
    part_label: input.previousTraceability.partLabel,
    tool_id: input.previousTraceability.toolId,
    serial_number: input.previousTraceability.serialNumber,
    dimensions_unit: input.previousTraceability.dimensionsUnit,
    before_notch: input.previousTraceability.beforeNotch,
    before_tooth_length: input.previousTraceability.beforeToothLength,
    damage_codes: input.previousTraceability.damageCodes,
    stock_to_remove: input.previousTraceability.stockToRemove,
    after_tooth_length: input.previousTraceability.afterToothLength,
    payload: input.previousTraceability.payload,
  };

  const { error: eventError } = await client
    .from('mes_operator_terminal_events')
    .insert({
      production_order_id: input.order.id,
      organization_id: input.organizationId,
      work_center_code: input.order.assignedWorkCenter,
      station_code: input.stationCode,
      event_type: 'measurement-corrected',
      quantity: 0,
      reason: 'Measurement correction',
      comment: `Piece ${input.serial.pieceSequence} measurement corrected`,
      payload: {
        order_number: input.order.orderNumber,
        part_number: input.order.partNumber,
        part_name: input.order.partName,
        piece_sequence: input.serial.pieceSequence,
        serial_id: input.serial.id,
        traceability_id: input.previousTraceability.id,
        previous: previousSnapshot,
        corrected: input.correctedTraceability,
        operator: input.operator ?? null,
        shift: input.shift ?? null,
      },
    });

  if (eventError) throw eventError;
  return mapProductionSerialRow(serialData as ProductionSerialRow);
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

export async function reportOperatorStationDowntime(
  input: {
    organizationId: string;
    workCenterCode: string;
    stationCode: string;
    shift?: string;
    reason?: string;
    comment?: string;
  },
  client: OperatorClient = supabase,
): Promise<void> {
  const { error } = await client.rpc('mes_operator_report_station_downtime', {
    p_organization_id: input.organizationId,
    p_work_center_code: input.workCenterCode,
    p_station_code: input.stationCode,
    p_reason: input.reason ?? null,
    p_comment: input.comment ?? null,
    p_shift: input.shift ?? null,
  });

  if (!error) return;

  const rpcUnavailable = error.code === 'PGRST202'
    || error.code === '42883'
    || /mes_operator_report_station_downtime|schema cache/i.test(error.message);
  if (!rpcUnavailable) throw error;

  const reason = input.reason?.trim() || 'Downtime reported';
  const comment = input.comment?.trim() || null;
  const [eventResponse, downtimeResponse] = await Promise.all([
    client.from('mes_operator_terminal_events').insert({
      organization_id: input.organizationId,
      production_order_id: null,
      work_center_code: input.workCenterCode,
      station_code: input.stationCode,
      event_type: 'downtime-started',
      reason,
      comment,
      payload: { shift: input.shift ?? null, without_order: true, fallback: true },
    }),
    client.from('mes_operator_terminal_downtime').insert({
      organization_id: input.organizationId,
      production_order_id: null,
      work_center_code: input.workCenterCode,
      station_code: input.stationCode,
      reason,
      comment,
    }),
  ]);

  if (eventResponse.error) throw eventResponse.error;
  if (downtimeResponse.error) throw downtimeResponse.error;

  const { error: stationError } = await client
    .from('mes_work_center_stations')
    .update({ current_job: null, status: 'down', last_event: 'Downtime reported' })
    .eq('organization_id', input.organizationId)
    .eq('code', input.stationCode);

  if (stationError) throw stationError;
}

export async function resumeOperatorStation(
  input: {
    organizationId: string;
    workCenterCode: string;
    stationCode: string;
    shift?: string;
    comment?: string;
  },
  client: OperatorClient = supabase,
): Promise<void> {
  const { error } = await client.rpc('mes_operator_resume_station', {
    p_organization_id: input.organizationId,
    p_work_center_code: input.workCenterCode,
    p_station_code: input.stationCode,
    p_comment: input.comment ?? null,
    p_shift: input.shift ?? null,
  });

  if (error) throw error;
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
    .update({ status: 'paused' })
    .eq('id', input.orderId)
    .eq('organization_id', input.organizationId)
    .select('*')
    .single();

  if (updateError) throw error;

  await client
    .from('mes_work_center_stations')
    .update({
      current_job: selectedOrder.order_number,
      status: 'idle',
      last_event: 'Order selected - awaiting operator start',
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
      event_type: 'job-paused',
      comment: input.comment ?? null,
      payload: { action: 'active-order-selected', awaiting_operator_start: true, fallback: true, shift: input.shift ?? null },
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
