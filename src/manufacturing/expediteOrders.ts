import { addLeadTimeDays, type DayCountMode } from './DeliveryRiskTimeline';

export const expediteToolIdsTable = 'mes_expedite_tool_ids';
export const expediteDetectionMessage = 'Expedite Tool ID Detected';
export const expediteToolIdsSelect = 'id, tool_id, customer_id, client_name, lead_time_days, stall_alert_hours, reason, notes, is_active, created_at, updated_at';
// Migration 184 adds stall_alert_hours; this narrower list keeps the module working
// against a database where only migration 183 has been applied.
export const expediteToolIdsSelectWithoutStall = 'id, tool_id, customer_id, client_name, lead_time_days, reason, notes, is_active, created_at, updated_at';
export const defaultExpediteStallAlertHours = 12;

export type ExpediteToolRuleRow = {
  id: string;
  tool_id: string | null;
  customer_id: string | null;
  client_name: string | null;
  lead_time_days: number | null;
  stall_alert_hours?: number | null;
  reason: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ExpediteToolRule = {
  id: string;
  toolId: string;
  customerId: string;
  clientName: string;
  leadTimeDays: number;
  stallAlertHours: number;
  reason: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function mapExpediteToolRuleRow(row: ExpediteToolRuleRow): ExpediteToolRule {
  return {
    id: row.id,
    toolId: (row.tool_id ?? '').trim(),
    customerId: row.customer_id ?? '',
    clientName: (row.client_name ?? '').trim(),
    leadTimeDays: Math.max(0, Number(row.lead_time_days) || 0),
    stallAlertHours: row.stall_alert_hours === null || row.stall_alert_hours === undefined
      ? defaultExpediteStallAlertHours
      : Math.max(0, Number(row.stall_alert_hours) || 0),
    reason: (row.reason ?? '').trim(),
    notes: (row.notes ?? '').trim(),
    isActive: row.is_active !== false,
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
  };
}

// Tool IDs are typed by hand in the assignment modal, so every comparison is made on a
// trimmed lowercase key, the same shape the unique index in migration 183 uses.
export function normalizeExpediteToolId(value: string) {
  return value.trim().toLowerCase();
}

export type ExpediteRuleIndex = Map<string, ExpediteToolRule>;

// Only active rules can flag an order. If the same Tool ID somehow resolves twice, the
// shortest lead time wins so detection never relaxes an urgency. History views pass
// includePaused so pausing a Tool ID does not erase the urgencies it already produced.
export function buildExpediteRuleIndex(rules: ExpediteToolRule[], { includePaused = false } = {}): ExpediteRuleIndex {
  const index: ExpediteRuleIndex = new Map();
  rules.forEach((rule) => {
    if (!rule.isActive && !includePaused) return;
    const key = normalizeExpediteToolId(rule.toolId);
    if (!key) return;
    const current = index.get(key);
    if (!current || rule.leadTimeDays < current.leadTimeDays) index.set(key, rule);
  });
  return index;
}

export function matchExpediteRule(index: ExpediteRuleIndex, toolId: string): ExpediteToolRule | null {
  const key = normalizeExpediteToolId(toolId || '');
  if (!key) return null;
  return index.get(key) ?? null;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// The organization day count mode lives in mes_order_risk_settings, so an expedite due
// date skips weekends and Mexican holidays whenever the organization counts business days.
export function getExpediteDueDate(leadTimeDays: number, mode: DayCountMode, languageCode = 'en', from = new Date()) {
  return toIsoDate(addLeadTimeDays(from, Math.max(0, leadTimeDays), mode, languageCode));
}

export type ExpediteEnforcement = {
  rule: ExpediteToolRule;
  dueDate: string;
  matchedToolIds: string[];
};

// The most urgent matched rule drives the whole order: a single expedite piece pulls the
// delivery date of every piece in that production order.
export function getExpediteEnforcement(
  index: ExpediteRuleIndex,
  toolIds: string[],
  mode: DayCountMode,
  languageCode = 'en',
  from = new Date(),
): ExpediteEnforcement | null {
  const matched = new Map<string, ExpediteToolRule>();
  toolIds.forEach((toolId) => {
    const rule = matchExpediteRule(index, toolId);
    if (rule) matched.set(rule.id, rule);
  });
  if (!matched.size) return null;
  const rule = [...matched.values()].sort((left, right) => left.leadTimeDays - right.leadTimeDays)[0];
  return {
    rule,
    dueDate: getExpediteDueDate(rule.leadTimeDays, mode, languageCode, from),
    matchedToolIds: [...matched.values()].map((item) => item.toolId),
  };
}

export function expediteLeadTimeLabel(leadTimeDays: number, mode: DayCountMode) {
  const unit = mode === 'business' ? 'business' : 'calendar';
  return leadTimeDays === 1 ? `1 ${unit} day` : `${leadTimeDays} ${unit} days`;
}

export type ExpediteSerialRow = {
  id: string;
  production_order_id: string;
  piece_sequence: number | null;
  serial_number: string | null;
  tool_id: string | null;
  result?: string | null;
};

export type ExpediteTraceabilityRow = {
  id: string;
  production_order_id: string | null;
  serial_number: string | null;
  tool_id: string | null;
  payload: Record<string, unknown> | null;
};

export type ExpeditePieceSource = 'assignment' | 'shop-floor';

export type ExpeditePiece = {
  key: string;
  serialId: string;
  pieceSequence: number;
  serialNumber: string;
  toolId: string;
  source: ExpeditePieceSource;
  rule: ExpediteToolRule;
};

const normalizeSerialKey = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

// Shop-floor captures carry the piece they belong to inside the traceability payload, the
// same field Production Order Details uses to line a capture up with its serial row.
const payloadPieceSequence = (payload: Record<string, unknown> | null) => {
  const value = payload?.piece_sequence;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

// A Tool ID reaches a production order two ways: pre-assigned on the serial row, or typed
// by the operator on the shop floor, where it lands in the traceability capture. Both are
// matched here so an order already running is detected even though it never went through
// the assignment modal.
export function matchExpeditePiecesByOrder(
  index: ExpediteRuleIndex,
  serials: ExpediteSerialRow[],
  traceability: ExpediteTraceabilityRow[],
): Map<string, ExpeditePiece[]> {
  const piecesByOrder = new Map<string, ExpeditePiece[]>();
  const addPiece = (orderId: string, piece: ExpeditePiece) => {
    piecesByOrder.set(orderId, [...(piecesByOrder.get(orderId) ?? []), piece]);
  };
  const traceabilityByOrder = new Map<string, ExpediteTraceabilityRow[]>();
  traceability.forEach((capture) => {
    if (!capture.production_order_id || !(capture.tool_id ?? '').trim()) return;
    traceabilityByOrder.set(capture.production_order_id, [...(traceabilityByOrder.get(capture.production_order_id) ?? []), capture]);
  });
  const consumedCaptureIds = new Set<string>();
  serials.forEach((serial) => {
    const captures = traceabilityByOrder.get(serial.production_order_id) ?? [];
    const serialKey = normalizeSerialKey(serial.serial_number);
    const pieceSequence = Number(serial.piece_sequence) || 0;
    // A piece is captured again on every regrind, so every capture that resolves to this
    // serial is consumed, not just the first one, or the rest would be counted twice.
    const matchingCaptures = captures.filter((item) => (
      (Boolean(serialKey) && normalizeSerialKey(item.serial_number) === serialKey)
      || (Boolean(pieceSequence) && payloadPieceSequence(item.payload) === pieceSequence)
    ));
    matchingCaptures.forEach((item) => consumedCaptureIds.add(item.id));
    const assignedToolId = (serial.tool_id ?? '').trim();
    const toolId = assignedToolId || (matchingCaptures[0]?.tool_id ?? '').trim();
    const rule = matchExpediteRule(index, toolId);
    if (!rule) return;
    addPiece(serial.production_order_id, {
      key: serial.id,
      serialId: serial.id,
      pieceSequence,
      serialNumber: serial.serial_number ?? '',
      toolId,
      source: assignedToolId ? 'assignment' : 'shop-floor',
      rule,
    });
  });
  const leftoverKeys = new Set<string>();
  traceabilityByOrder.forEach((captures, orderId) => {
    captures.forEach((capture) => {
      if (consumedCaptureIds.has(capture.id)) return;
      const toolId = (capture.tool_id ?? '').trim();
      const rule = matchExpediteRule(index, toolId);
      if (!rule) return;
      // Captures with no serial row behind them still identify one physical piece, so
      // repeated captures of the same serial and Tool ID collapse into a single entry.
      const leftoverKey = `${orderId}|${normalizeSerialKey(capture.serial_number) || payloadPieceSequence(capture.payload) || capture.id}|${normalizeExpediteToolId(toolId)}`;
      if (leftoverKeys.has(leftoverKey)) return;
      leftoverKeys.add(leftoverKey);
      addPiece(orderId, {
        key: capture.id,
        serialId: '',
        pieceSequence: payloadPieceSequence(capture.payload),
        serialNumber: capture.serial_number ?? '',
        toolId,
        source: 'shop-floor',
        rule,
      });
    });
  });
  return piecesByOrder;
}

// The urgency that governs an order is the one with the shortest lead time among the
// expedite Tool IDs it carries.
export function governingExpediteRule(pieces: ExpeditePiece[]) {
  return [...pieces].sort((left, right) => left.rule.leadTimeDays - right.rule.leadTimeDays)[0]?.rule ?? null;
}

// PostgREST filter that finds every row whose Tool ID could belong to a registered rule.
// Anything other than letters, digits and dashes becomes a wildcard, so the filter only
// ever over-matches; the exact comparison happens afterwards with matchExpediteRule.
export function expediteToolIdSearchFilter(toolIds: string[]) {
  const patterns = [...new Set(toolIds
    .map((toolId) => toolId.trim().replace(/[^A-Za-z0-9-]+/g, '*'))
    .filter((pattern) => pattern.replaceAll('*', '')))];
  return patterns.map((pattern) => `tool_id.ilike.*${pattern}*`).join(',');
}

// How far each expedite piece got on its way to the customer, read from the per-serial
// progress of Client Receptions.
export type ExpeditePieceDelivery = { sentAt: string; reworkedAt: string; scrapped: boolean };
export type ExpediteCompletionOutcome = 'sent' | 'closed' | 'cancelled';
export type ExpediteCompletion = {
  completedAt: string;
  outcome: ExpediteCompletionOutcome;
  sentCount: number;
  reworkedCount: number;
  scrappedCount: number;
};

export function getExpeditePieceDelivery(
  piece: ExpeditePiece,
  deliveryBySerialId: Map<string, ExpeditePieceDelivery>,
  orderSentAt: string,
): ExpeditePieceDelivery {
  const delivery = piece.serialId ? deliveryBySerialId.get(piece.serialId) : undefined;
  // A reception item is stamped sent only once every piece of it went out, so it also
  // covers shop-floor captures that have no serial row to carry their own progress.
  return {
    sentAt: delivery?.sentAt || (delivery?.reworkedAt || delivery?.scrapped ? '' : orderSentAt),
    reworkedAt: delivery?.reworkedAt ?? '',
    scrapped: delivery?.scrapped ?? false,
  };
}

// An urgency is fulfilled when the customer has every expedite piece back, not when the
// order is released by Quality. A piece sent to rework or scrapped no longer blocks it:
// the rework order carries the piece from there. Orders that never came in through a
// reception have nothing to ship, so their completion closes the urgency.
export function getExpediteCompletion({
  order,
  pieces,
  deliveryBySerialId,
  orderSentAt,
  hasReception,
}: {
  order: { status: string; updated_at: string | null };
  pieces: ExpeditePiece[];
  deliveryBySerialId: Map<string, ExpeditePieceDelivery>;
  orderSentAt: string;
  hasReception: boolean;
}): ExpediteCompletion | null {
  const closedAt = order.updated_at ?? '';
  if (order.status === 'cancelled') return { completedAt: closedAt, outcome: 'cancelled', sentCount: 0, reworkedCount: 0, scrappedCount: 0 };
  if (!hasReception) {
    return order.status === 'completed' ? { completedAt: closedAt, outcome: 'closed', sentCount: 0, reworkedCount: 0, scrappedCount: 0 } : null;
  }
  const deliveries = pieces.map((piece) => getExpeditePieceDelivery(piece, deliveryBySerialId, orderSentAt));
  if (!deliveries.length || deliveries.some((delivery) => !delivery.sentAt && !delivery.reworkedAt && !delivery.scrapped)) return null;
  const sentCount = deliveries.filter((delivery) => delivery.sentAt).length;
  const lastMovement = deliveries.map((delivery) => delivery.sentAt || delivery.reworkedAt).filter(Boolean).sort().at(-1);
  return {
    completedAt: lastMovement || closedAt,
    outcome: sentCount ? 'sent' : 'closed',
    sentCount,
    reworkedCount: deliveries.filter((delivery) => !delivery.sentAt && delivery.reworkedAt).length,
    scrappedCount: deliveries.filter((delivery) => !delivery.sentAt && !delivery.reworkedAt && delivery.scrapped).length,
  };
}
