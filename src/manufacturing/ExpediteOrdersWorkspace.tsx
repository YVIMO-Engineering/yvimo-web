import React from 'react';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, LoaderCircle, PackageOpen, Pencil, Plus, RadioTower, Search, Settings2, Siren, Trash2, TriangleAlert, X, Zap } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getDaysUntilDelivery, getDeliveryDistance, type DayCountMode } from './DeliveryRiskTimeline';
import { ProductionOrdersWorkspace } from './MesWorkspaces';
import { getOrderRiskLevel, type OrderRiskLevel } from './orderRisk';
import {
  buildExpediteRuleIndex,
  defaultExpediteStallAlertHours,
  expediteLeadTimeLabel,
  expediteToolIdsSelect,
  expediteToolIdsSelectWithoutStall,
  expediteToolIdsTable,
  getExpediteDueDate,
  governingExpediteRule,
  mapExpediteToolRuleRow,
  matchExpeditePiecesByOrder,
  normalizeExpediteToolId,
  type ExpeditePiece,
  type ExpediteSerialRow,
  type ExpediteToolRule,
  type ExpediteToolRuleRow,
  type ExpediteTraceabilityRow,
} from './expediteOrders';
import { useSupabaseRealtimeRefresh, type RealtimeConnectionState } from '../lib/useSupabaseRealtimeRefresh';
import './expediteOrders.css';

type Props = { onNavigate: (path: string) => void; organizationId: string; languageCode?: string };
type RiskFilter = 'all' | OrderRiskLevel;
type ExpediteOrderRow = {
  id: string;
  order_number: string;
  client_name: string | null;
  part_number: string;
  part_name: string;
  planned_quantity: number;
  completed_quantity: number;
  scrap_quantity: number;
  due_date: string;
  priority: string;
  status: string;
  assigned_work_center: string | null;
  created_at: string | null;
};
type ExpediteUrgency = {
  order: ExpediteOrderRow;
  pieces: ExpeditePiece[];
  rule: ExpediteToolRule;
  risk: OrderRiskLevel;
  // What the urgency agreement allows on its own, measured from the order creation date.
  leadTimeDueDate: string;
  // The date that actually governs the order. An expedite only ever pulls a delivery in,
  // so an order already committed tighter than the agreement keeps its own date.
  targetDueDate: string;
  onTarget: boolean;
};
type RuleDraft = { id: string; toolId: string; leadTimeDays: string; stallAlertHours: string; customerId: string; reason: string; notes: string; isActive: boolean };

const riskLabels: Record<OrderRiskLevel, string> = { overdue: 'Overdue', high: 'Critical', moderate: 'Watch', low: 'On track' };
const liveStateLabels: Record<RealtimeConnectionState, string> = { connecting: 'Connecting…', live: 'Live expedites', offline: 'Reconnecting…' };
const liveClockFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const closedOrderStatuses = ['completed', 'cancelled'];
const emptyRuleDraft: RuleDraft = { id: '', toolId: '', leadTimeDays: '1', stallAlertHours: String(defaultExpediteStallAlertHours), customerId: '', reason: '', notes: '', isActive: true };
const formatDate = (value: string) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function deliveryDistance(dueDate: string, mode: DayCountMode, languageCode: string) {
  const calendarDays = getDaysUntilDelivery(dueDate);
  const days = getDeliveryDistance(calendarDays, mode, languageCode);
  if (calendarDays < 0) return `${Math.abs(days)} days overdue`;
  if (calendarDays === 0) return 'Due today';
  return days === 1 ? '1 day left' : `${days} days left`;
}

export function ExpediteOrdersWorkspace({ onNavigate, organizationId, languageCode = 'en' }: Props) {
  const [rules, setRules] = React.useState<ExpediteToolRule[]>([]);
  const [orders, setOrders] = React.useState<ExpediteOrderRow[]>([]);
  const [serials, setSerials] = React.useState<ExpediteSerialRow[]>([]);
  const [traceability, setTraceability] = React.useState<ExpediteTraceabilityRow[]>([]);
  const [dayCountMode, setDayCountMode] = React.useState<DayCountMode>('calendar');
  const [toolCatalog, setToolCatalog] = React.useState<string[]>([]);
  const [customers, setCustomers] = React.useState<Array<{ id: string; customer_name: string }>>([]);
  const [riskFilter, setRiskFilter] = React.useState<RiskFilter>('all');
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [registryOpen, setRegistryOpen] = React.useState(false);
  const [ruleDraft, setRuleDraft] = React.useState<RuleDraft>(emptyRuleDraft);
  const [ruleSaving, setRuleSaving] = React.useState(false);
  const [ruleError, setRuleError] = React.useState('');
  const [ruleToDelete, setRuleToDelete] = React.useState<ExpediteToolRule | null>(null);
  const [registryMissing, setRegistryMissing] = React.useState(false);
  const [detailOrderNumber, setDetailOrderNumber] = React.useState('');
  const [liveState, setLiveState] = React.useState<RealtimeConnectionState>('connecting');
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState('');

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [ruleResult, orderResult, settingsResult, catalogResult, customerResult] = await Promise.all([
      supabase.from(expediteToolIdsTable).select(expediteToolIdsSelect).eq('organization_id', organizationId).order('lead_time_days', { ascending: true })
        .then((result) => (result.error?.message?.includes('stall_alert_hours')
          ? supabase.from(expediteToolIdsTable).select(expediteToolIdsSelectWithoutStall).eq('organization_id', organizationId).order('lead_time_days', { ascending: true })
          : result)),
      supabase
        .from('mes_production_orders')
        .select('id, order_number, client_name, part_number, part_name, planned_quantity, completed_quantity, scrap_quantity, due_date, priority, status, assigned_work_center, created_at')
        .eq('organization_id', organizationId)
        .not('status', 'in', `(${closedOrderStatuses.join(',')})`)
        .order('due_date', { ascending: true }),
      supabase.from('mes_order_risk_settings').select('day_count_mode').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('mes_customer_tool_ids').select('tool_id').eq('organization_id', organizationId).order('tool_id', { ascending: true }),
      supabase.from('mes_customers').select('id, customer_name').eq('organization_id', organizationId).order('customer_name', { ascending: true }),
    ]);
    if (ruleResult.error) {
      setRegistryMissing(true);
      setError(`Unable to load the expedite Tool ID registry: ${ruleResult.error.message}. Apply SQL migration 183.`);
      setLoading(false);
      return;
    }
    setRegistryMissing(false);
    if (orderResult.error) {
      setError(`Unable to load the production orders behind the expedites: ${orderResult.error.message}.`);
      setLoading(false);
      return;
    }
    const loadedRules = ((ruleResult.data ?? []) as unknown as ExpediteToolRuleRow[]).map(mapExpediteToolRuleRow);
    const loadedOrders = (orderResult.data ?? []) as ExpediteOrderRow[];
    // Tool IDs reach a production order two ways: pre-assigned on the serial row, or typed
    // by the operator on the shop floor, where they land in the traceability capture. Both
    // are read for the open orders and matched in memory, so an order already running is
    // detected even though it never went through the assignment modal.
    const orderIds = loadedOrders.map((order) => order.id);
    const [serialResult, traceabilityResult] = orderIds.length
      ? await Promise.all([
        supabase
          .from('mes_production_serials')
          .select('id, production_order_id, piece_sequence, serial_number, tool_id')
          .eq('organization_id', organizationId)
          .in('production_order_id', orderIds),
        supabase
          .from('mes_operator_terminal_traceability')
          .select('id, production_order_id, serial_number, tool_id, payload')
          .eq('organization_id', organizationId)
          .in('production_order_id', orderIds),
      ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (serialResult.error) {
      setError(`Unable to load the assigned Tool IDs: ${serialResult.error.message}.`);
      setLoading(false);
      return;
    }
    const serialData = serialResult.data;
    // A traceability read that fails only costs the shop-floor fallback, so the board still
    // renders everything the serial rows already know.
    if (traceabilityResult.error) console.warn('Unable to load shop-floor Tool ID captures', traceabilityResult.error);
    setError('');
    setRules(loadedRules);
    setOrders(loadedOrders);
    setSerials((serialData ?? []) as ExpediteSerialRow[]);
    setTraceability((traceabilityResult.error ? [] : traceabilityResult.data ?? []) as ExpediteTraceabilityRow[]);
    if (!settingsResult.error) setDayCountMode(settingsResult.data?.day_count_mode === 'business' ? 'business' : 'calendar');
    if (!catalogResult.error) setToolCatalog([...new Set(((catalogResult.data ?? []) as Array<{ tool_id: string }>).map((tool) => tool.tool_id.trim()).filter(Boolean))]);
    if (!customerResult.error) setCustomers((customerResult.data ?? []) as Array<{ id: string; customer_name: string }>);
    setLastUpdatedAt(new Date().toISOString());
    setLoading(false);
  }, [organizationId]);

  React.useEffect(() => { void load(); }, [load]);

  const realtimeTables = React.useMemo(() => ([
    { table: expediteToolIdsTable, filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_production_orders', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_production_serials', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_operator_terminal_traceability', filter: `organization_id=eq.${organizationId}` },
  ]), [organizationId]);
  useSupabaseRealtimeRefresh({
    channelName: `expedite-orders-live:${organizationId}`,
    tables: realtimeTables,
    onRefresh: () => { void load(true); },
    onConnectionStateChange: setLiveState,
    enabled: Boolean(organizationId) && !registryMissing,
    refreshOnFocus: true,
    pollMs: 30_000,
  });

  const ruleIndex = React.useMemo(() => buildExpediteRuleIndex(rules), [rules]);
  const urgencies = React.useMemo<ExpediteUrgency[]>(() => {
    const piecesByOrder = matchExpeditePiecesByOrder(ruleIndex, serials, traceability);
    return orders
      .filter((order) => piecesByOrder.has(order.id))
      .map((order) => {
        const pieces = (piecesByOrder.get(order.id) ?? []).sort((left: ExpeditePiece, right: ExpeditePiece) => left.pieceSequence - right.pieceSequence);
        const rule = governingExpediteRule(pieces) as ExpediteToolRule;
        // The promise is measured from the day the order was created, so an old order is
        // never judged against a lead time recounted from today.
        const createdAt = order.created_at ? new Date(order.created_at) : new Date();
        const leadTimeDueDate = getExpediteDueDate(rule.leadTimeDays, dayCountMode, languageCode, createdAt);
        const onTarget = order.due_date <= leadTimeDueDate;
        return {
          order,
          pieces,
          rule,
          risk: getOrderRiskLevel(order.due_date, new Date(), dayCountMode, languageCode),
          leadTimeDueDate,
          targetDueDate: onTarget ? order.due_date : leadTimeDueDate,
          onTarget,
        };
      })
      .sort((left, right) => left.order.due_date.localeCompare(right.order.due_date));
  }, [dayCountMode, languageCode, orders, ruleIndex, serials, traceability]);

  const riskCounts = React.useMemo(() => urgencies.reduce((counts, urgency) => {
    counts[urgency.risk] += 1;
    return counts;
  }, { overdue: 0, high: 0, moderate: 0, low: 0 } as Record<OrderRiskLevel, number>), [urgencies]);
  const offTargetCount = urgencies.filter((urgency) => !urgency.onTarget).length;
  const activeRuleCount = rules.filter((rule) => rule.isActive).length;
  // The registry is the point of the module even on a quiet day, so every watched Tool ID
  // stays on the main screen with the number of open orders it is currently holding.
  const openOrdersByRuleId = React.useMemo(() => {
    const counts = new Map<string, number>();
    urgencies.forEach((urgency) => {
      new Set(urgency.pieces.map((piece) => piece.rule.id)).forEach((ruleId) => {
        counts.set(ruleId, (counts.get(ruleId) ?? 0) + 1);
      });
    });
    return counts;
  }, [urgencies]);
  const watchedRules = React.useMemo(() => [...rules].sort((left, right) => (
    Number(right.isActive) - Number(left.isActive)
    || (openOrdersByRuleId.get(right.id) ?? 0) - (openOrdersByRuleId.get(left.id) ?? 0)
    || left.leadTimeDays - right.leadTimeDays
    || left.toolId.localeCompare(right.toolId)
  )), [openOrdersByRuleId, rules]);

  const visibleUrgencies = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return urgencies.filter((urgency) => {
      if (riskFilter !== 'all' && urgency.risk !== riskFilter) return false;
      if (!term) return true;
      return [
        urgency.order.order_number,
        urgency.order.client_name,
        urgency.order.part_number,
        urgency.order.part_name,
        urgency.rule.reason,
        ...urgency.pieces.flatMap((piece) => [piece.toolId, piece.serialNumber]),
      ].some((value) => (value ?? '').toLowerCase().includes(term));
    });
  }, [riskFilter, search, urgencies]);

  const openOrderDetails = (orderNumber: string) => {
    window.sessionStorage.setItem('yvimo:mes:selectedProductionOrderNumber', orderNumber);
    window.sessionStorage.setItem('yvimo:mes:openProductionOrderDetails', orderNumber);
    setDetailOrderNumber(orderNumber);
  };

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    const toolId = ruleDraft.toolId.trim();
    const leadTimeDays = Number(ruleDraft.leadTimeDays);
    if (!toolId) {
      setRuleError('Enter the Tool ID that has to be detected as urgent.');
      return;
    }
    if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 365) {
      setRuleError('The expedite lead time has to be between 0 and 365 days.');
      return;
    }
    const stallAlertHours = Number(ruleDraft.stallAlertHours);
    if (!Number.isFinite(stallAlertHours) || stallAlertHours < 0 || stallAlertHours > 720) {
      setRuleError('The stall alarm has to be between 0 and 720 hours. Use 0 to turn it off for this Tool ID.');
      return;
    }
    const duplicate = rules.find((rule) => normalizeExpediteToolId(rule.toolId) === normalizeExpediteToolId(toolId) && rule.id !== ruleDraft.id);
    if (duplicate) {
      setRuleError(`${duplicate.toolId} is already registered as an expedite Tool ID.`);
      return;
    }
    setRuleSaving(true);
    setRuleError('');
    const payload = {
      organization_id: organizationId,
      tool_id: toolId,
      customer_id: ruleDraft.customerId || null,
      client_name: customers.find((customer) => customer.id === ruleDraft.customerId)?.customer_name ?? '',
      lead_time_days: Math.round(leadTimeDays),
      stall_alert_hours: Math.round(stallAlertHours),
      reason: ruleDraft.reason.trim(),
      notes: ruleDraft.notes.trim(),
      is_active: ruleDraft.isActive,
    };
    const writeRule = (body: Record<string, unknown>) => (ruleDraft.id
      ? supabase.from(expediteToolIdsTable).update(body).eq('id', ruleDraft.id).eq('organization_id', organizationId)
      : supabase.from(expediteToolIdsTable).insert(body));
    let { error: saveError } = await writeRule(payload);
    // Migration 184 adds the stall threshold, so a database still on 183 saves the rest.
    if (saveError?.message?.includes('stall_alert_hours')) {
      const { stall_alert_hours: _ignored, ...withoutStall } = payload;
      ({ error: saveError } = await writeRule(withoutStall));
    }
    setRuleSaving(false);
    if (saveError) {
      setRuleError(saveError.message);
      return;
    }
    setRuleDraft(emptyRuleDraft);
    await load(true);
  };

  const toggleRule = async (rule: ExpediteToolRule) => {
    const { error: toggleError } = await supabase
      .from(expediteToolIdsTable)
      .update({ is_active: !rule.isActive })
      .eq('id', rule.id)
      .eq('organization_id', organizationId);
    if (toggleError) {
      setRuleError(toggleError.message);
      return;
    }
    await load(true);
  };

  const deleteRule = async () => {
    if (!ruleToDelete) return;
    const { error: deleteError } = await supabase
      .from(expediteToolIdsTable)
      .delete()
      .eq('id', ruleToDelete.id)
      .eq('organization_id', organizationId);
    if (deleteError) {
      setRuleError(deleteError.message);
      return;
    }
    if (ruleDraft.id === ruleToDelete.id) setRuleDraft(emptyRuleDraft);
    setRuleToDelete(null);
    await load(true);
  };

  const renderUrgencyCard = (urgency: ExpediteUrgency) => {
    const { order, pieces, rule, risk } = urgency;
    return <article className={`expedite-card ${risk}`} key={order.id}>
      <header className="expedite-card-header">
        <span className="expedite-card-badge"><Siren size={13} /> Expedite</span>
        <span className="expedite-card-lead">{expediteLeadTimeLabel(rule.leadTimeDays, dayCountMode)} lead time</span>
      </header>
      <div className="expedite-card-body">
        <section className="expedite-order-column">
          <article
            className="expedite-order-card clickable"
            role="button"
            tabIndex={0}
            aria-label={`Open production order ${order.order_number} details`}
            onClick={() => openOrderDetails(order.order_number)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openOrderDetails(order.order_number); } }}
          >
            <header className={risk}>
              <span><AlertTriangle size={14} /> {riskLabels[risk]}</span>
              <b>{deliveryDistance(order.due_date, dayCountMode, languageCode)}</b>
              <time><CalendarDays size={13} /> {formatDate(order.due_date)}</time>
            </header>
            <div>
              <small>Production order</small>
              <strong>#{order.order_number}</strong>
              <span>{order.client_name || 'Customer not assigned'}</span>
              <dl>
                <div><dt>Part</dt><dd>{order.part_number || order.part_name || '—'}</dd></div>
                <div><dt>Expedite pieces</dt><dd>{pieces.length} of {Number(order.planned_quantity).toLocaleString()}</dd></div>
                <div className="expedite-order-card-status"><dt>Status</dt><dd className={`status-${order.status}`}>{order.status.replaceAll('-', ' ')}</dd></div>
                <div><dt>Priority</dt><dd>{order.priority}</dd></div>
                <div><dt>Work center</dt><dd>{order.assigned_work_center || '—'}</dd></div>
                <div><dt>Progress</dt><dd>{Number(order.completed_quantity).toLocaleString()} / {Number(order.planned_quantity).toLocaleString()}</dd></div>
              </dl>
            </div>
          </article>
          <div className={`expedite-target-card${urgency.onTarget ? ' on-target' : ' off-target'}`}>
            {urgency.onTarget
              ? <><CheckCircle2 size={15} /><span><b>Lead time honored · delivering {formatDate(urgency.targetDueDate)}</b><em>Within the {expediteLeadTimeLabel(rule.leadTimeDays, dayCountMode)} agreed for {rule.toolId}{order.due_date < urgency.leadTimeDueDate ? ', and tighter than the agreement asks for' : ''}.</em></span></>
              : <><TriangleAlert size={15} /><span><b>Due date beyond the expedite lead time</b><em>Committed {formatDate(order.due_date)} · the {expediteLeadTimeLabel(rule.leadTimeDays, dayCountMode)} agreement allowed {formatDate(urgency.leadTimeDueDate)} at the latest.</em></span></>}
          </div>
        </section>
        <section className="expedite-tool-column">
          <div className="expedite-rule-card">
            <span className="expedite-rule-label"><Zap size={14} /> Expedite Tool ID</span>
            <strong>{rule.toolId}</strong>
            <dl>
              <div><dt>Lead time</dt><dd>{expediteLeadTimeLabel(rule.leadTimeDays, dayCountMode)}</dd></div>
              <div><dt>Registered for</dt><dd>{rule.clientName || 'Any customer'}</dd></div>
            </dl>
            {rule.reason ? <p className="expedite-rule-reason">{rule.reason}</p> : null}
          </div>
          <ul className="expedite-piece-list">
            {pieces.map((piece) => <li key={piece.key}>
              <span className="expedite-piece-sequence">{piece.pieceSequence || '—'}</span>
              <span className="expedite-piece-body">
                <strong>{piece.toolId || 'Tool ID not assigned'}</strong>
                <small>
                  Serial {piece.serialNumber || 'not assigned'}
                  {piece.source === 'shop-floor' ? <b className="expedite-piece-source">Shop floor</b> : null}
                </small>
              </span>
              <span className="expedite-piece-lead">{expediteLeadTimeLabel(piece.rule.leadTimeDays, dayCountMode)}</span>
            </li>)}
          </ul>
        </section>
      </div>
    </article>;
  };

  return <section className="mes-workspace-panel expedite-workspace">
    <div className="mes-screen-header expedite-header">
      <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/aps')}><ArrowLeft size={16} /> APS</button>
      <div className="mes-workspace-heading">
        <p className="eyebrow">APS / EXPEDITE ORDERS</p>
        <h2>Expedite Orders</h2>
        <p>Register the Tool IDs that always run as urgent, then watch every production order that carries one of them. Production Orders detects the Tool ID while the pieces are being assigned and forces the delivery date to the lead time configured here, counted with the organization day count setting.</p>
      </div>
    </div>
    <div className="expedite-summary">
      <article><small>Open expedites</small><strong>{urgencies.length}</strong><span>production orders carrying an expedite Tool ID</span></article>
      <article className={riskCounts.overdue ? 'alarm' : ''}><small>Overdue</small><strong>{riskCounts.overdue}</strong><span>past the committed delivery date</span></article>
      <article className={riskCounts.high ? 'warn' : ''}><small>Critical</small><strong>{riskCounts.high}</strong><span>due today or tomorrow</span></article>
      <article className={offTargetCount ? 'warn' : ''}><small>Off lead time</small><strong>{offTargetCount}</strong><span>committed later than the expedite lead time</span></article>
      <article><small>Registered Tool IDs</small><strong>{activeRuleCount}</strong><span>{rules.length - activeRuleCount} paused · counted in {dayCountMode === 'business' ? 'business' : 'calendar'} days</span></article>
    </div>
    <div className="expedite-toolbar">
      <div className="expedite-filters" role="tablist" aria-label="Expedite urgency">
        <button type="button" role="tab" aria-selected={riskFilter === 'all'} className={riskFilter === 'all' ? 'active' : ''} onClick={() => setRiskFilter('all')}><Siren size={15} /> All <b>{urgencies.length}</b></button>
        <button type="button" role="tab" aria-selected={riskFilter === 'overdue'} className={riskFilter === 'overdue' ? 'active' : ''} onClick={() => setRiskFilter('overdue')}>Overdue <b>{riskCounts.overdue}</b></button>
        <button type="button" role="tab" aria-selected={riskFilter === 'high'} className={riskFilter === 'high' ? 'active' : ''} onClick={() => setRiskFilter('high')}>Critical <b>{riskCounts.high}</b></button>
        <button type="button" role="tab" aria-selected={riskFilter === 'moderate'} className={riskFilter === 'moderate' ? 'active' : ''} onClick={() => setRiskFilter('moderate')}>Watch <b>{riskCounts.moderate}</b></button>
        <button type="button" role="tab" aria-selected={riskFilter === 'low'} className={riskFilter === 'low' ? 'active' : ''} onClick={() => setRiskFilter('low')}>On track <b>{riskCounts.low}</b></button>
      </div>
      <label className="expedite-search">
        <Search size={16} />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by Tool ID, serial, order, customer, or reason" />
      </label>
      <button className="expedite-registry-button" type="button" onClick={() => { setRuleError(''); setRuleDraft(emptyRuleDraft); setRegistryOpen(true); }}>
        <Settings2 size={16} /> Expedite Tool IDs <b>{activeRuleCount}</b>
      </button>
      <div className={`expedite-live-state ${liveState}`}>
        <span><i /> {liveStateLabels[liveState]}</span>
        <small>{lastUpdatedAt ? `Updated ${liveClockFormatter.format(new Date(lastUpdatedAt))}` : 'Waiting for data'}</small>
      </div>
    </div>
    {error ? <div className="expedite-message" role="alert">{error}</div> : null}
    <section className="expedite-watchlist" aria-label="Tool IDs under auto-detection">
      <header>
        <div>
          <span className="expedite-watchlist-title"><RadioTower size={15} /> Tool IDs under auto-detection</span>
          <small>Production Orders flags any of these while a planner assigns pieces. {activeRuleCount} detecting{rules.length - activeRuleCount ? ` · ${rules.length - activeRuleCount} paused` : ''}.</small>
        </div>
        <button type="button" onClick={() => { setRuleError(''); setRuleDraft(emptyRuleDraft); setRegistryOpen(true); }}>
          <Plus size={15} /> Add Tool ID
        </button>
      </header>
      {watchedRules.length === 0 ? (
        <p className="expedite-watchlist-empty">No Tool ID is being auto-detected yet. Register the ones that always run urgent so Production Orders can catch them at assignment time.</p>
      ) : (
        <div className="expedite-watchlist-grid">
          {watchedRules.map((rule) => {
            const openOrders = openOrdersByRuleId.get(rule.id) ?? 0;
            const selected = search.trim().toLowerCase() === rule.toolId.toLowerCase();
            return <button
              className={[rule.isActive ? 'detecting' : 'paused', openOrders ? 'hit' : '', selected ? 'selected' : ''].filter(Boolean).join(' ')}
              type="button"
              aria-pressed={selected}
              title={rule.notes || rule.reason || `${rule.toolId} expedite rule`}
              key={rule.id}
              onClick={() => { setRiskFilter('all'); setSearch(selected ? '' : rule.toolId); }}
            >
              <span className="expedite-watchlist-state">{rule.isActive ? <><i /> Detecting</> : 'Paused'}</span>
              <strong>{rule.toolId}</strong>
              <small>{expediteLeadTimeLabel(rule.leadTimeDays, dayCountMode)} · {rule.clientName || 'Any customer'}</small>
              {rule.reason ? <em>{rule.reason}</em> : null}
              <span className={`expedite-watchlist-hits${openOrders ? ' active' : ''}`}>
                {openOrders ? `${openOrders} open ${openOrders === 1 ? 'order' : 'orders'}` : 'No open order'}
              </span>
            </button>;
          })}
        </div>
      )}
    </section>
    {loading ? (
      <div className="expedite-loading"><LoaderCircle size={24} /> Loading expedite orders…</div>
    ) : visibleUrgencies.length === 0 ? (
      <div className="expedite-empty">
        <PackageOpen size={28} />
        <strong>{urgencies.length === 0 ? 'No open order carries an expedite Tool ID' : 'No expedite matches this view'}</strong>
        <span>{urgencies.length === 0
          ? activeRuleCount === 0
            ? 'Nothing is being auto-detected yet, so no production order can be flagged as an expedite.'
            : 'An order shows up here as soon as one of the watched Tool IDs above is assigned to a piece.'
          : 'Change the urgency filter or clear the search to see more expedites.'}</span>
      </div>
    ) : (
      <div className="expedite-board">{visibleUrgencies.map(renderUrgencyCard)}</div>
    )}
    {registryOpen ? (
      <div className="expedite-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRegistryOpen(false); }}>
        <section className="expedite-modal" role="dialog" aria-modal="true" aria-labelledby="expedite-registry-title">
          <button className="expedite-modal-close" type="button" onClick={() => setRegistryOpen(false)} aria-label="Close"><X size={18} /></button>
          <div className="expedite-modal-heading">
            <span className="expedite-modal-icon"><Siren size={24} /></span>
            <div>
              <p className="eyebrow">Auto-detection</p>
              <h3 id="expedite-registry-title">Expedite Tool IDs</h3>
              <p>Any Tool ID registered here is detected while a planner assigns pieces in Production Orders. The order is highlighted as an expedite and its delivery date is forced to the lead time below, counted in {dayCountMode === 'business' ? 'business' : 'calendar'} days as configured for this organization. The stall alarm raises a production alert in Statistics and Production Schedule when an order carrying this Tool ID sits that many hours with no movement at all; weekends and holidays are not counted, and 0 turns it off.</p>
            </div>
          </div>
          <form className="expedite-rule-form" onSubmit={saveRule}>
            <label>
              Tool ID
              <input
                value={ruleDraft.toolId}
                list="expedite-tool-catalog"
                placeholder="e.g. HOB-4820"
                onChange={(event) => setRuleDraft((current) => ({ ...current, toolId: event.target.value }))}
              />
              <datalist id="expedite-tool-catalog">{toolCatalog.map((toolId) => <option value={toolId} key={toolId} />)}</datalist>
            </label>
            <label>
              Expedite lead time <em>({dayCountMode === 'business' ? 'business' : 'calendar'} days)</em>
              <input type="number" min="0" max="365" value={ruleDraft.leadTimeDays} onChange={(event) => setRuleDraft((current) => ({ ...current, leadTimeDays: event.target.value }))} />
            </label>
            <label>
              Stall alarm <em>(hours without movement)</em>
              <input type="number" min="0" max="720" value={ruleDraft.stallAlertHours} onChange={(event) => setRuleDraft((current) => ({ ...current, stallAlertHours: event.target.value }))} />
            </label>
            <label>
              Customer <em>(optional)</em>
              <select value={ruleDraft.customerId} onChange={(event) => setRuleDraft((current) => ({ ...current, customerId: event.target.value }))}>
                <option value="">Any customer</option>
                {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.customer_name}</option>)}
              </select>
            </label>
            <label className="expedite-rule-form-wide">
              Reason
              <input value={ruleDraft.reason} placeholder="Why does this Tool ID always run urgent?" onChange={(event) => setRuleDraft((current) => ({ ...current, reason: event.target.value }))} />
            </label>
            <label className="expedite-rule-form-wide">
              Notes <em>(optional)</em>
              <textarea rows={2} value={ruleDraft.notes} placeholder="Anything the planner should know when this Tool ID shows up." onChange={(event) => setRuleDraft((current) => ({ ...current, notes: event.target.value }))} />
            </label>
            {ruleError ? <div className="expedite-rule-error" role="alert">{ruleError}</div> : null}
            <div className="expedite-rule-form-actions">
              {ruleDraft.id ? <button type="button" className="secondary" onClick={() => { setRuleDraft(emptyRuleDraft); setRuleError(''); }}>Cancel edit</button> : null}
              <button type="submit" disabled={ruleSaving}>
                {ruleSaving ? <LoaderCircle size={16} className="expedite-spin" /> : <Plus size={16} />}
                {ruleSaving ? 'Saving…' : ruleDraft.id ? 'Save Tool ID' : 'Register Tool ID'}
              </button>
            </div>
          </form>
          <div className="expedite-rule-list">
            {rules.length === 0 ? (
              <p className="expedite-rule-empty">No Tool ID is being auto-detected yet.</p>
            ) : rules.map((rule) => <article className={rule.isActive ? 'active' : 'paused'} key={rule.id}>
              <div className="expedite-rule-identity">
                <strong>{rule.toolId}</strong>
                <small>{expediteLeadTimeLabel(rule.leadTimeDays, dayCountMode)} · {rule.clientName || 'Any customer'} · {rule.stallAlertHours ? `stall alarm at ${rule.stallAlertHours}h` : 'no stall alarm'}</small>
                {rule.reason ? <em>{rule.reason}</em> : null}
              </div>
              <div className="expedite-rule-actions">
                <button
                  type="button"
                  className={`expedite-rule-toggle${rule.isActive ? ' on' : ''}`}
                  role="switch"
                  aria-checked={rule.isActive}
                  title={rule.isActive ? 'Pause the auto-detection of this Tool ID' : 'Resume the auto-detection of this Tool ID'}
                  onClick={() => void toggleRule(rule)}
                >
                  <span>{rule.isActive ? 'Detecting' : 'Paused'}</span><i aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Edit ${rule.toolId}`} onClick={() => { setRuleError(''); setRuleDraft({ id: rule.id, toolId: rule.toolId, leadTimeDays: String(rule.leadTimeDays), stallAlertHours: String(rule.stallAlertHours), customerId: rule.customerId, reason: rule.reason, notes: rule.notes, isActive: rule.isActive }); }}><Pencil size={15} /></button>
                <button type="button" className="danger" aria-label={`Delete ${rule.toolId}`} onClick={() => setRuleToDelete(rule)}><Trash2 size={15} /></button>
              </div>
            </article>)}
          </div>
        </section>
      </div>
    ) : null}
    {ruleToDelete ? (
      <div className="expedite-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRuleToDelete(null); }}>
        <section className="expedite-modal expedite-confirm" role="dialog" aria-modal="true" aria-labelledby="expedite-delete-title">
          <span className="expedite-modal-icon danger"><Trash2 size={24} /></span>
          <p className="eyebrow">Stop auto-detection</p>
          <h3 id="expedite-delete-title">Remove {ruleToDelete.toolId} from the expedite registry?</h3>
          <p>New production orders will stop detecting this Tool ID and will no longer have their delivery date forced. Orders already flagged keep the delivery date they were given.</p>
          <div className="expedite-modal-actions">
            <button type="button" className="secondary" onClick={() => setRuleToDelete(null)}>Cancel</button>
            <button type="button" onClick={() => void deleteRule()}><Trash2 size={16} /> Remove Tool ID</button>
          </div>
        </section>
      </div>
    ) : null}
    {detailOrderNumber ? <ProductionOrdersWorkspace organizationId={organizationId} onNavigate={onNavigate} modalOnly onModalClose={() => { setDetailOrderNumber(''); void load(true); }} /> : null}
  </section>;
}
