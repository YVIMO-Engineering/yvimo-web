import React from 'react';
import { AlertTriangle, ArrowLeft, Biohazard, CalendarDays, ClipboardList, LoaderCircle, MessageSquareText, PackageOpen, Save, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getDaysUntilDelivery } from './DeliveryRiskTimeline';
import { ProductionOrdersWorkspace } from './MesWorkspaces';
import { getOrderRiskLevel, type OrderRiskLevel } from './orderRisk';
import { useSupabaseRealtimeRefresh, type RealtimeConnectionState } from '../lib/useSupabaseRealtimeRefresh';
import './quarantine.css';

type Props = { onNavigate: (path: string) => void; organizationId: string };
type QuarantineStatus = 'open' | 'released' | 'scrapped';
type QuarantineOutcome = 'release' | 'scrap';
type QuarantineHold = {
  id: string;
  productionOrderId: string;
  productionSerialId: string;
  pieceSequence: number;
  serialNumber: string;
  toolId: string;
  reason: string;
  actionPlan: string;
  status: QuarantineStatus;
  quarantinedAt: string;
  releasedAt: string;
  releaseNotes: string;
  scrappedAt: string;
  scrapReason: string;
};
type QuarantineOrder = {
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
  assigned_station: string | null;
};
type DraftComments = { reason: string; actionPlan: string };
// The column list is built at runtime (migration 177 may not be applied yet), so the
// response rows are typed here instead of being inferred from the select string.
type QuarantineHoldRow = {
  id: string;
  production_order_id: string;
  production_serial_id: string;
  piece_sequence: number | null;
  serial_number: string | null;
  tool_id: string | null;
  reason: string | null;
  action_plan: string | null;
  status: string | null;
  quarantined_at: string | null;
  released_at: string | null;
  release_notes: string | null;
  scrapped_at?: string | null;
  scrap_reason?: string | null;
};

const productionOrderDeepLinkKey = 'yvimo:mes:selectedProductionOrderNumber';
const productionOrderDetailsDeepLinkKey = 'yvimo:mes:openProductionOrderDetails';
// The same reason list the Operator Terminal uses, so quarantine scrap and shop-floor
// scrap read identically in the cost trackers.
const scrapReasons = [
  'Tooth damage',
  'Out of tolerance',
  'Surface defect',
  'Wrong tool',
  'Setup issue',
  'Machine issue',
  'Material issue',
  'Quarantine decision',
  'Other',
];
const riskLabels: Record<OrderRiskLevel, string> = { overdue: 'Overdue', high: 'High risk', moderate: 'Moderate risk', low: 'Low risk' };
const liveStateLabels: Record<RealtimeConnectionState, string> = { connecting: 'Connecting…', live: 'Live quarantine', offline: 'Reconnecting…' };
const liveClockFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const deliveryDistance = (dueDate: string) => {
  const days = getDaysUntilDelivery(dueDate);
  return days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : days === 1 ? '1 day left' : `${days} days left`;
};
const formatDate = (value: string) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const formatTimestamp = (value: string) => (value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const holdDuration = (from: string, to = '') => {
  if (!from) return '—';
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) return '—';
  const hours = Math.max(0, (end - start) / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(hours * 60))}m`;
  if (hours < 24) return `${Math.floor(hours)}h ${Math.floor((hours % 1) * 60)}m`;
  return `${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h`;
};

export function QuarantineWorkspace({ onNavigate, organizationId }: Props) {
  const [holds, setHolds] = React.useState<QuarantineHold[]>([]);
  const [orders, setOrders] = React.useState<QuarantineOrder[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, DraftComments>>({});
  const [savingHoldId, setSavingHoldId] = React.useState('');
  const [savedHoldId, setSavedHoldId] = React.useState('');
  const [outcomeHold, setOutcomeHold] = React.useState<QuarantineHold | null>(null);
  const [outcomeMode, setOutcomeMode] = React.useState<QuarantineOutcome>('release');
  const [outcomeNotes, setOutcomeNotes] = React.useState('');
  const [scrapReason, setScrapReason] = React.useState(scrapReasons[0]);
  const [outcomeSaving, setOutcomeSaving] = React.useState(false);
  const [outcomeError, setOutcomeError] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<QuarantineStatus | 'all'>('open');
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [detailOrderNumber, setDetailOrderNumber] = React.useState('');
  const [liveState, setLiveState] = React.useState<RealtimeConnectionState>('connecting');
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState('');
  const [scrapOutcomeAvailable, setScrapOutcomeAvailable] = React.useState(true);

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    // The scrap outcome columns arrive with migration 177, so the list still loads
    // against a database that only has migration 176 applied.
    const selectHolds = (withScrapOutcome: boolean) => supabase
      .from('mes_production_quarantine')
      .select([
        'id, production_order_id, production_serial_id, piece_sequence, serial_number, tool_id',
        'reason, action_plan, status, quarantined_at, released_at, release_notes',
        withScrapOutcome ? 'scrapped_at, scrap_reason' : '',
      ].filter(Boolean).join(', '))
      .eq('organization_id', organizationId)
      .order('quarantined_at', { ascending: false });
    let { data, error: holdError } = await selectHolds(true);
    let scrapOutcomeAvailable = true;
    if (holdError?.message?.includes('scrap')) {
      scrapOutcomeAvailable = false;
      ({ data, error: holdError } = await selectHolds(false));
    }
    setScrapOutcomeAvailable(scrapOutcomeAvailable);
    if (holdError) {
      setError(`Unable to load quarantine holds: ${holdError.message}. Apply SQL migration 176.`);
      setLoading(false);
      return;
    }
    const loadedHolds: QuarantineHold[] = ((data ?? []) as unknown as QuarantineHoldRow[]).map((row) => ({
      id: row.id,
      productionOrderId: row.production_order_id,
      productionSerialId: row.production_serial_id,
      pieceSequence: Number(row.piece_sequence) || 0,
      serialNumber: row.serial_number ?? '',
      toolId: row.tool_id ?? '',
      reason: row.reason ?? '',
      actionPlan: row.action_plan ?? '',
      status: row.status === 'released' ? 'released' : row.status === 'scrapped' ? 'scrapped' : 'open',
      quarantinedAt: row.quarantined_at ?? '',
      releasedAt: row.released_at ?? '',
      releaseNotes: row.release_notes ?? '',
      scrappedAt: row.scrapped_at ?? '',
      scrapReason: row.scrap_reason ?? '',
    }));
    const orderIds = [...new Set(loadedHolds.map((hold) => hold.productionOrderId))];
    const { data: orderData, error: orderError } = orderIds.length
      ? await supabase
        .from('mes_production_orders')
        .select('id, order_number, client_name, part_number, part_name, planned_quantity, completed_quantity, scrap_quantity, due_date, priority, status, assigned_work_center, assigned_station')
        .eq('organization_id', organizationId)
        .in('id', orderIds)
      : { data: [], error: null };
    if (orderError) {
      setError(`Unable to load the production orders behind quarantine: ${orderError.message}.`);
      setLoading(false);
      return;
    }
    setError('');
    setHolds(loadedHolds);
    setOrders((orderData ?? []) as QuarantineOrder[]);
    // Comments being typed are never overwritten by a background refresh.
    setDrafts((current) => {
      const next: Record<string, DraftComments> = {};
      loadedHolds.forEach((hold) => {
        next[hold.id] = current[hold.id] ?? { reason: hold.reason, actionPlan: hold.actionPlan };
      });
      return next;
    });
    setLastUpdatedAt(new Date().toISOString());
    setLoading(false);
  }, [organizationId]);

  React.useEffect(() => { void load(); }, [load]);

  const realtimeTables = React.useMemo(() => ([
    { table: 'mes_production_quarantine', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_production_orders', filter: `organization_id=eq.${organizationId}` },
  ]), [organizationId]);
  useSupabaseRealtimeRefresh({
    channelName: `production-quarantine-live:${organizationId}`,
    tables: realtimeTables,
    // Comments being typed survive a refresh, so live updates never interrupt an edit.
    onRefresh: () => { void load(true); },
    onConnectionStateChange: setLiveState,
    enabled: Boolean(organizationId),
    refreshOnFocus: true,
    pollMs: 30_000,
  });

  const orderById = React.useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const openCount = holds.filter((hold) => hold.status === 'open').length;
  const releasedCount = holds.filter((hold) => hold.status === 'released').length;
  const scrappedCount = holds.filter((hold) => hold.status === 'scrapped').length;
  const visibleHolds = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return holds.filter((hold) => {
      if (statusFilter !== 'all' && hold.status !== statusFilter) return false;
      if (!term) return true;
      const order = orderById.get(hold.productionOrderId);
      return [
        hold.serialNumber,
        hold.toolId,
        hold.reason,
        hold.actionPlan,
        hold.scrapReason,
        order?.order_number,
        order?.client_name,
        order?.part_number,
        order?.part_name,
      ].some((value) => (value ?? '').toLowerCase().includes(term));
    });
  }, [holds, orderById, search, statusFilter]);

  const openOrderDetails = (orderNumber: string) => {
    window.sessionStorage.setItem(productionOrderDeepLinkKey, orderNumber);
    window.sessionStorage.setItem(productionOrderDetailsDeepLinkKey, orderNumber);
    setDetailOrderNumber(orderNumber);
  };

  const updateDraft = (holdId: string, patch: Partial<DraftComments>) => {
    setSavedHoldId('');
    setDrafts((current) => ({ ...current, [holdId]: { ...(current[holdId] ?? { reason: '', actionPlan: '' }), ...patch } }));
  };

  const saveComments = async (hold: QuarantineHold) => {
    const draft = drafts[hold.id] ?? { reason: hold.reason, actionPlan: hold.actionPlan };
    setSavingHoldId(hold.id);
    setSavedHoldId('');
    const { error: saveError } = await supabase
      .from('mes_production_quarantine')
      .update({ reason: draft.reason.trim(), action_plan: draft.actionPlan.trim() })
      .eq('id', hold.id)
      .eq('organization_id', organizationId);
    setSavingHoldId('');
    if (saveError) {
      setError(`Unable to save the quarantine comments: ${saveError.message}.`);
      return;
    }
    setError('');
    setSavedHoldId(hold.id);
    setHolds((current) => current.map((item) => item.id === hold.id ? { ...item, reason: draft.reason.trim(), actionPlan: draft.actionPlan.trim() } : item));
    window.setTimeout(() => setSavedHoldId((current) => (current === hold.id ? '' : current)), 2600);
  };

  const openOutcomeModal = (hold: QuarantineHold, mode: QuarantineOutcome) => {
    setOutcomeHold(hold);
    setOutcomeMode(mode);
    setOutcomeNotes('');
    setScrapReason(scrapReasons[0]);
    setOutcomeError('');
  };

  const closeQuarantineHold = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!outcomeHold) return;
    setOutcomeSaving(true);
    setOutcomeError('');
    const { error: rpcError } = outcomeMode === 'scrap'
      ? await supabase.rpc('mes_scrap_production_piece_from_quarantine', {
        p_quarantine_id: outcomeHold.id,
        p_organization_id: organizationId,
        p_reason: scrapReason,
        p_comment: outcomeNotes.trim(),
      })
      : await supabase.rpc('mes_release_production_piece_from_quarantine', {
        p_quarantine_id: outcomeHold.id,
        p_organization_id: organizationId,
        p_release_notes: outcomeNotes.trim(),
      });
    setOutcomeSaving(false);
    if (rpcError) {
      setOutcomeError(outcomeMode === 'scrap' && (rpcError.code === '42883' || rpcError.message.includes('does not exist'))
        ? 'Scrapping from quarantine is not available yet. Apply SQL migration 177.'
        : rpcError.message);
      return;
    }
    setOutcomeHold(null);
    setOutcomeNotes('');
    await load(true);
  };

  const renderHoldCard = (hold: QuarantineHold) => {
    const order = orderById.get(hold.productionOrderId);
    const risk = order ? getOrderRiskLevel(order.due_date) : 'low';
    const draft = drafts[hold.id] ?? { reason: hold.reason, actionPlan: hold.actionPlan };
    const dirty = draft.reason.trim() !== hold.reason.trim() || draft.actionPlan.trim() !== hold.actionPlan.trim();
    const readOnly = hold.status !== 'open';
    const closedAt = hold.status === 'scrapped' ? hold.scrappedAt : hold.releasedAt;
    return <article className={`quarantine-card ${hold.status}`} key={hold.id}>
      <header className="quarantine-card-header">
        <span className={`quarantine-card-badge ${hold.status}`}>
          {hold.status === 'open' ? <><Biohazard size={13} /> On hold</> : hold.status === 'scrapped' ? <><Trash2 size={13} /> Scrapped</> : <><ShieldCheck size={13} /> Released</>}
        </span>
        <span className="quarantine-card-age">{hold.status === 'open' ? `Held for ${holdDuration(hold.quarantinedAt)}` : `Held ${holdDuration(hold.quarantinedAt, closedAt)}`}</span>
      </header>
      <div className="quarantine-card-body">
        <section className="quarantine-order-column">
          <article
            className={`quarantine-order-card${order ? ' clickable' : ''}`}
            role={order ? 'button' : undefined}
            tabIndex={order ? 0 : undefined}
            aria-label={order ? `Open production order ${order.order_number} details` : undefined}
            onClick={() => { if (order) openOrderDetails(order.order_number); }}
            onKeyDown={(event) => { if (order && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openOrderDetails(order.order_number); } }}
          >
            <header className={order ? risk : 'unknown'}>
              <span><AlertTriangle size={14} /> {order ? riskLabels[risk] : 'Order not found'}</span>
              <b>{order ? deliveryDistance(order.due_date) : '—'}</b>
              <time><CalendarDays size={13} /> {order ? formatDate(order.due_date) : '—'}</time>
            </header>
            <div>
              <small>Production order</small>
              <strong>#{order?.order_number ?? 'Unknown'}</strong>
              <span>{order?.client_name || 'Customer not assigned'}</span>
              <dl>
                <div><dt>Part</dt><dd>{order?.part_number || order?.part_name || '—'}</dd></div>
                <div><dt>Piece</dt><dd>{hold.pieceSequence || '—'} of {order ? Number(order.planned_quantity).toLocaleString() : '—'}</dd></div>
                <div className="quarantine-order-card-status"><dt>Status</dt><dd className={`status-${order?.status ?? 'unknown'}`}>{(order?.status ?? 'unknown').replaceAll('-', ' ')}</dd></div>
                <div><dt>Priority</dt><dd>{order?.priority ?? '—'}</dd></div>
                <div><dt>Work center</dt><dd>{order?.assigned_work_center || '—'}</dd></div>
                <div><dt>Progress</dt><dd>{order ? `${Number(order.completed_quantity).toLocaleString()} / ${Number(order.planned_quantity).toLocaleString()}` : '—'}</dd></div>
              </dl>
            </div>
          </article>
          <div className="quarantine-serial-card">
            <span className="quarantine-serial-label"><Biohazard size={14} /> Quarantined serial</span>
            <strong>{hold.serialNumber || 'Not assigned'}</strong>
            <dl>
              <div><dt>Tool ID</dt><dd>{hold.toolId || '—'}</dd></div>
              <div><dt>Piece</dt><dd>{hold.pieceSequence || '—'}</dd></div>
              <div><dt>Quarantined</dt><dd>{formatTimestamp(hold.quarantinedAt)}</dd></div>
              {hold.status === 'released' ? <div><dt>Released</dt><dd>{formatTimestamp(hold.releasedAt)}</dd></div> : null}
              {hold.status === 'scrapped' ? <div><dt>Scrapped</dt><dd>{formatTimestamp(hold.scrappedAt)}</dd></div> : null}
            </dl>
          </div>
        </section>
        <section className="quarantine-comment-column">
          <label className="quarantine-comment-box">
            <span><MessageSquareText size={14} /> Quarantine reason</span>
            <textarea
              value={draft.reason}
              readOnly={readOnly}
              placeholder="Why is this piece being held?"
              onChange={(event) => updateDraft(hold.id, { reason: event.target.value })}
            />
          </label>
          <label className="quarantine-comment-box">
            <span><ClipboardList size={14} /> Action to take</span>
            <textarea
              value={draft.actionPlan}
              readOnly={readOnly}
              placeholder="What has to happen before this piece returns to production?"
              onChange={(event) => updateDraft(hold.id, { actionPlan: event.target.value })}
            />
          </label>
          {hold.status === 'released' && hold.releaseNotes ? (
            <p className="quarantine-release-note"><ShieldCheck size={14} /> {hold.releaseNotes}</p>
          ) : null}
          {hold.status === 'scrapped' ? (
            <p className="quarantine-scrap-note">
              <Trash2 size={14} />
              <span><b>Generated scrap · {hold.scrapReason || 'Reason not recorded'}</b>{hold.releaseNotes ? <em>{hold.releaseNotes}</em> : null}</span>
            </p>
          ) : null}
          {!readOnly ? (
            <div className="quarantine-card-actions">
              {savedHoldId === hold.id ? <em className="quarantine-saved">Comments saved</em> : null}
              <button type="button" className="quarantine-scrap-button" disabled={!scrapOutcomeAvailable} title={scrapOutcomeAvailable ? 'Scrap this piece as generated scrap' : 'Apply SQL migration 177 to scrap from quarantine'} onClick={() => openOutcomeModal(hold, 'scrap')}>
                <Trash2 size={15} /> Send to scrap
              </button>
              <button type="button" className="quarantine-release-button" onClick={() => openOutcomeModal(hold, 'release')}>
                <ShieldCheck size={15} /> Release from quarantine
              </button>
              <button type="button" className="quarantine-save-button" disabled={!dirty || savingHoldId === hold.id} onClick={() => void saveComments(hold)}>
                {savingHoldId === hold.id ? <LoaderCircle size={15} className="quarantine-spin" /> : <Save size={15} />}
                {savingHoldId === hold.id ? 'Saving…' : 'Save comments'}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </article>;
  };

  return <section className="mes-workspace-panel quarantine-workspace">
    <div className="mes-screen-header quarantine-header">
      <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/aps')}><ArrowLeft size={16} /> APS</button>
      <div className="mes-workspace-heading">
        <p className="eyebrow">APS / QUARANTINE</p>
        <h2>Quarantine</h2>
        <p>Hold the pieces that cannot continue the normal manufacturing flow, record why they are held, and close each hold by releasing the piece back to production or scrapping it.</p>
      </div>
    </div>
    <div className="quarantine-toolbar">
      <div className="quarantine-filters" role="tablist" aria-label="Quarantine status">
        <button type="button" role="tab" aria-selected={statusFilter === 'open'} className={statusFilter === 'open' ? 'active' : ''} onClick={() => setStatusFilter('open')}><Biohazard size={15} /> On hold <b>{openCount}</b></button>
        <button type="button" role="tab" aria-selected={statusFilter === 'released'} className={statusFilter === 'released' ? 'active' : ''} onClick={() => setStatusFilter('released')}><ShieldCheck size={15} /> Released <b>{releasedCount}</b></button>
        <button type="button" role="tab" aria-selected={statusFilter === 'scrapped'} className={statusFilter === 'scrapped' ? 'active' : ''} onClick={() => setStatusFilter('scrapped')}><Trash2 size={15} /> Scrapped <b>{scrappedCount}</b></button>
        <button type="button" role="tab" aria-selected={statusFilter === 'all'} className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>All <b>{holds.length}</b></button>
      </div>
      <label className="quarantine-search">
        <Search size={16} />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by serial, tool ID, order, customer, or comment" />
      </label>
      <div className={`quarantine-live-state ${liveState}`}>
        <span><i /> {liveStateLabels[liveState]}</span>
        <small>{lastUpdatedAt ? `Updated ${liveClockFormatter.format(new Date(lastUpdatedAt))}` : 'Waiting for data'}</small>
      </div>
    </div>
    {error ? <div className="quarantine-message" role="alert">{error}</div> : null}
    {loading ? (
      <div className="quarantine-loading"><LoaderCircle size={24} /> Loading quarantined pieces…</div>
    ) : visibleHolds.length === 0 ? (
      <div className="quarantine-empty">
        <PackageOpen size={28} />
        <strong>{holds.length === 0 ? 'No piece is in quarantine' : 'No piece matches this view'}</strong>
        <span>{holds.length === 0 ? 'Send a piece to quarantine from Production Order Details to start tracking it here.' : 'Change the status filter or clear the search to see more holds.'}</span>
      </div>
    ) : (
      <div className="quarantine-board">{visibleHolds.map(renderHoldCard)}</div>
    )}
    {outcomeHold ? (
      <div className="quarantine-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !outcomeSaving) setOutcomeHold(null); }}>
        <section className={`quarantine-modal ${outcomeMode}`} role="dialog" aria-modal="true" aria-labelledby="quarantine-outcome-title">
          <button className="quarantine-modal-close" type="button" onClick={() => setOutcomeHold(null)} disabled={outcomeSaving} aria-label="Close"><X size={18} /></button>
          <form onSubmit={closeQuarantineHold}>
            <span className="quarantine-modal-icon">{outcomeMode === 'scrap' ? <Trash2 size={25} /> : <ShieldCheck size={25} />}</span>
            <p className="eyebrow">{outcomeMode === 'scrap' ? 'Scrap the held piece' : 'Return to production'}</p>
            <h3 id="quarantine-outcome-title">
              {outcomeMode === 'scrap' ? 'Scrap' : 'Release'} serial {outcomeHold.serialNumber || `piece ${outcomeHold.pieceSequence}`}?
            </h3>
            <p>
              {outcomeMode === 'scrap'
                ? 'The piece is lost: it counts as generated scrap in the production order and in the cost trackers, and it stops gating coating and delivery.'
                : 'The piece leaves quarantine and continues the normal manufacturing flow. The reason and the action taken stay in the quarantine history.'}
            </p>
            {outcomeMode === 'scrap' ? (
              <div className="quarantine-modal-warning"><AlertTriangle size={18} /><span>A piece already reported as GOOD stops counting as produced. This cannot be undone from the Quarantine workspace.</span></div>
            ) : null}
            {outcomeMode === 'scrap' ? (
              <label>
                Scrap reason
                <select value={scrapReason} onChange={(event) => setScrapReason(event.target.value)}>
                  {scrapReasons.map((reason) => <option value={reason} key={reason}>{reason}</option>)}
                </select>
              </label>
            ) : null}
            <label>
              {outcomeMode === 'scrap' ? 'Scrap comment' : 'Release notes'} <em>(optional)</em>
              <textarea rows={3} value={outcomeNotes} onChange={(event) => setOutcomeNotes(event.target.value)} placeholder={outcomeMode === 'scrap' ? 'What was found on this piece?' : 'What was done to clear this piece?'} autoFocus />
            </label>
            {outcomeError ? <div className="clients-feedback error" role="alert">{outcomeError}</div> : null}
            <div className="quarantine-modal-actions">
              <button type="button" className="secondary" onClick={() => setOutcomeHold(null)} disabled={outcomeSaving}>Cancel</button>
              <button type="submit" disabled={outcomeSaving}>
                {outcomeMode === 'scrap' ? <Trash2 size={16} /> : <ShieldCheck size={16} />}
                {outcomeSaving ? (outcomeMode === 'scrap' ? 'Scrapping…' : 'Releasing…') : (outcomeMode === 'scrap' ? 'Scrap piece' : 'Release piece')}
              </button>
            </div>
          </form>
        </section>
      </div>
    ) : null}
    {detailOrderNumber ? <ProductionOrdersWorkspace organizationId={organizationId} onNavigate={onNavigate} modalOnly onModalClose={() => { setDetailOrderNumber(''); void load(true); }} /> : null}
  </section>;
}
