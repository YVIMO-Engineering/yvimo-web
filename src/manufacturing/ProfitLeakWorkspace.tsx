import React from 'react';
import { AlertTriangle, ArrowLeft, Boxes, RefreshCw, Repeat2, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import { getWorkCenterHourlyRate } from './workCenterRates';
import './profitLeak.css';
import './profitLeakLayout.css';

type Props = { onNavigate: (path: string) => void; organizationId: string };
type RangePreset = 'current' | 'previous' | 'custom';
type LeakEvent = { id: string; event_type: string; quantity: number | null; reason: string | null; comment: string | null; payload: unknown; work_center_code: string | null; station_code: string | null; created_at: string; mes_production_orders: { client_name: string | null } | Array<{ client_name: string | null }> | null };
type TransferRow = { id: string; transfer_number: string; external_process: string; part_number: string; quantity_sent: number | null; quantity_rejected: number | null; created_at: string };
type DowntimeCycle = { id: string; work_center_code: string; station_code: string; started_at: string; ended_at: string | null };
type WorkCenterRow = { id: string; code: string; name: string };
type StationRow = { work_center_id: string; code: string; name: string };
type LeakTableRow = { id: string; date: string; category: string; detail: string; item: string; duration: string; workCenter: string; station: string; quantity: number; spent: number | null; currency: string };

const dateInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const monthRange = (offset = 0) => {
  const now = new Date();
  return { from: dateInput(new Date(now.getFullYear(), now.getMonth() + offset, 1)), to: dateInput(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)) };
};
const eventText = (event: LeakEvent) => `${event.reason ?? ''} ${event.comment ?? ''} ${JSON.stringify(event.payload ?? {})}`.toLowerCase();
const isEndOfLife = (event: LeakEvent) => /end[\s_-]*of[\s_-]*life|\beol\b|fin de vida/.test(eventText(event));
const isWarranty = (event: LeakEvent) => /\bwarrant(?:y|ies)\b|garant[ií]a/.test(eventText(event));
const payloadRecord = (payload: unknown): Record<string, unknown> => payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
const eventSpend = (event: LeakEvent) => {
  const payload = payloadRecord(event.payload);
  for (const key of ['total_cost', 'expense_amount', 'amount', 'cost']) {
    const value = Number(payload[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  const unitCost = Number(payload.unit_cost);
  return Number.isFinite(unitCost) && unitCost >= 0 ? unitCost * Math.max(1, Number(event.quantity) || 1) : null;
};
const money = (value: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
const categoryTone = (category: string) => category.includes('Scrap') ? 'scrap' : category === 'Manufacturing Transfer' ? 'transfer' : category === 'Supplies Used' ? 'supplies' : category === 'Warranty' ? 'warranty' : 'downtime';
const SpendBox = ({ value }: { value: number | null }) => <span className="profit-leak-spend"><small>Money Spent</small><strong>{value === null ? 'Not recorded' : money(value)}</strong></span>;
const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const durationLabel = (hours: number) => hours >= 1 ? `${hours.toFixed(2)} h` : hours >= (1 / 60) ? `${Math.max(1, Math.round(hours * 60))} min` : `${Math.max(1, Math.round(hours * 3600))} sec`;
const workCenterPalette = [
  { background: '#dbeafe', border: '#93c5fd', color: '#1d4ed8' },
  { background: '#dcfce7', border: '#86efac', color: '#15803d' },
  { background: '#fef3c7', border: '#fcd34d', color: '#a16207' },
  { background: '#f3e8ff', border: '#d8b4fe', color: '#7e22ce' },
  { background: '#cffafe', border: '#67e8f9', color: '#0e7490' },
  { background: '#ffe4e6', border: '#fda4af', color: '#be123c' },
];

export function ProfitLeakWorkspace({ onNavigate, organizationId }: Props) {
  const [preset, setPreset] = React.useState<RangePreset>('current');
  const [range, setRange] = React.useState(() => monthRange());
  const [events, setEvents] = React.useState<LeakEvent[]>([]);
  const [transfers, setTransfers] = React.useState<TransferRow[]>([]);
  const [downtimeCycles, setDowntimeCycles] = React.useState<DowntimeCycle[]>([]);
  const [workCenters, setWorkCenters] = React.useState<WorkCenterRow[]>([]);
  const [stations, setStations] = React.useState<StationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [updatedAt, setUpdatedAt] = React.useState('');

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const from = `${range.from}T00:00:00`;
    const to = `${range.to}T23:59:59.999`;
    const [eventResult, transferResult, downtimeResult, centerResult, stationResult] = await Promise.all([
      supabase.from('mes_operator_terminal_events')
        .select('id, event_type, quantity, reason, comment, payload, work_center_code, station_code, created_at, mes_production_orders(client_name)')
        .eq('organization_id', organizationId)
        .in('event_type', ['production-scrap', 'inventory-consumed'])
        .gte('created_at', from).lte('created_at', to),
      supabase.from('mes_supplier_transfers')
        .select('id, transfer_number, external_process, part_number, quantity_sent, quantity_rejected, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', from).lte('created_at', to),
      supabase.from('mes_station_status_cycles')
        .select('id, work_center_code, station_code, started_at, ended_at')
        .eq('organization_id', organizationId).eq('status', 'down')
        .lt('started_at', to).or(`ended_at.is.null,ended_at.gt.${from}`),
      supabase.from('mes_work_centers').select('id, code, name').eq('organization_id', organizationId).order('name'),
      supabase.from('mes_work_center_stations').select('work_center_id, code, name').eq('organization_id', organizationId),
    ]);
    const loadError = eventResult.error ?? transferResult.error ?? downtimeResult.error ?? centerResult.error ?? stationResult.error;
    if (loadError) {
      setError(loadError.message || 'Unable to load profit leak data.');
    } else {
      setEvents((eventResult.data ?? []) as LeakEvent[]);
      setTransfers((transferResult.data ?? []) as TransferRow[]);
      setDowntimeCycles((downtimeResult.data ?? []) as DowntimeCycle[]);
      setWorkCenters((centerResult.data ?? []) as WorkCenterRow[]);
      setStations((stationResult.data ?? []) as StationRow[]);
      setError('');
      setUpdatedAt(new Date().toISOString());
    }
    setLoading(false);
  }, [organizationId, range.from, range.to]);

  React.useEffect(() => { void load(); }, [load]);
  useSupabaseRealtimeRefresh({
    channelName: `profit-leak:${organizationId}`,
    tables: [
      { table: 'mes_operator_terminal_events', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_supplier_transfers', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_station_status_cycles', filter: `organization_id=eq.${organizationId}` },
    ],
    onRefresh: () => void load(true),
  });

  const validDowntimeCycles = React.useMemo(() => {
    const startMs = new Date(`${range.from}T00:00:00`).getTime();
    const rangeEnd = new Date(`${range.to}T00:00:00`); rangeEnd.setDate(rangeEnd.getDate() + 1);
    const endMs = Math.min(rangeEnd.getTime(), Date.now());
    return downtimeCycles.map((cycle) => {
      const durationMs = Math.max(0, Math.min(endMs, cycle.ended_at ? new Date(cycle.ended_at).getTime() : Date.now()) - Math.max(startMs, new Date(cycle.started_at).getTime()));
      return { cycle, hours: durationMs / 3_600_000 };
    }).filter(({ hours }) => hours >= (1 / 3600));
  }, [downtimeCycles, range.from, range.to]);

  const summary = React.useMemo(() => {
    const scrap = events.filter((event) => event.event_type === 'production-scrap');
    const warranties = scrap.filter(isWarranty).reduce((sum, event) => sum + Math.max(1, Number(event.quantity) || 1), 0);
    const eol = scrap.filter((event) => !isWarranty(event) && isEndOfLife(event)).reduce((sum, event) => sum + Math.max(1, Number(event.quantity) || 1), 0);
    const generated = scrap.filter((event) => !isWarranty(event) && !isEndOfLife(event)).reduce((sum, event) => sum + Math.max(1, Number(event.quantity) || 1), 0);
    const supplies = events.filter((event) => event.event_type === 'inventory-consumed').reduce((sum, event) => sum + Math.max(1, Number(event.quantity) || 1), 0);
    const downtime = validDowntimeCycles.length;
    return { eol, generated, scraps: eol + generated, supplies, downtime, warranties };
  }, [events, transfers, validDowntimeCycles]);

  const tableRows = React.useMemo<LeakTableRow[]>(() => {
    const locationFor = (workCenterCode: string | null, stationCode: string | null) => {
      const center = workCenters.find((item) => item.code === workCenterCode);
      const station = stations.find((item) => item.code === stationCode && (!center || item.work_center_id === center.id));
      return { workCenter: center?.name ?? workCenterCode ?? 'Unassigned', station: station?.name ?? stationCode ?? '—' };
    };
    const operationalRows = events.map((event) => {
      const payload = payloadRecord(event.payload);
      const category = event.event_type === 'production-scrap' ? (isWarranty(event) ? 'Warranty' : isEndOfLife(event) ? 'End of Life Scrap' : 'Generated Scrap') : 'Supplies Used';
      const detail = event.reason || String(payload.inventory_item_title || '') || event.comment || 'Operational event';
      const order = relation(event.mes_production_orders);
      const item = category === 'Supplies Used' ? String(payload.inventory_item_title || 'Not identified') : category === 'Generated Scrap' ? `Tool ID: ${String(payload.tool_id || 'Not identified')} · Client: ${order?.client_name || String(payload.client_name || 'Not identified')}` : String(payload.tool_id || '—');
      return { id: event.id, date: event.created_at, category, detail, item, duration: '—', ...locationFor(event.work_center_code, event.station_code), quantity: Math.max(1, Number(event.quantity) || 1), spent: eventSpend(event), currency: String(payload.currency || 'USD') };
    });
    const transferRows = transfers.flatMap((transfer) => {
      const base: LeakTableRow = { id: `transfer-${transfer.id}`, date: transfer.created_at, category: 'Manufacturing Transfer', detail: `${transfer.transfer_number} · ${transfer.external_process}${transfer.part_number ? ` · ${transfer.part_number}` : ''}`, item: transfer.part_number || '—', duration: '—', workCenter: 'External operation', station: '—', quantity: Math.max(1, Number(transfer.quantity_sent) || 1), spent: null, currency: 'USD' };
      return [base];
    });
    const downtimeRows: LeakTableRow[] = validDowntimeCycles.map(({ cycle, hours }) => {
      const centerName = workCenters.find((center) => center.code === cycle.work_center_code)?.name ?? cycle.work_center_code;
      const rate = getWorkCenterHourlyRate(`${centerName} ${cycle.work_center_code}`);
      const location = locationFor(cycle.work_center_code, cycle.station_code);
      return { id: `downtime-${cycle.id}`, date: cycle.started_at, category: 'Downtime Incident', detail: `${durationLabel(hours)} × ${money(rate)}/hour`, item: '—', duration: durationLabel(hours), ...location, quantity: 1, spent: hours * rate, currency: 'USD' };
    });
    return [...operationalRows, ...transferRows, ...downtimeRows].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  }, [events, stations, transfers, validDowntimeCycles, workCenters]);
  const workCenterStyle = React.useCallback((name: string) => {
    const index = Math.max(0, workCenters.findIndex((center) => center.name === name));
    return workCenterPalette[index % workCenterPalette.length];
  }, [workCenters]);
  const spendTotals = React.useMemo(() => {
    const totalFor = (categories: string[]) => {
      const recorded = tableRows.filter((row) => categories.includes(row.category) && row.spent !== null);
      return recorded.length ? recorded.reduce((sum, row) => sum + (row.spent ?? 0), 0) : null;
    };
    return {
      scrap: totalFor(['End of Life Scrap', 'Generated Scrap']),
      transfers: totalFor(['Manufacturing Transfer']),
      supplies: totalFor(['Supplies Used']),
      warranties: totalFor(['Warranty']),
      downtime: totalFor(['Downtime Incident']),
    };
  }, [tableRows]);

  const setPresetRange = (next: RangePreset) => {
    setPreset(next);
    if (next === 'current') setRange(monthRange());
    if (next === 'previous') setRange(monthRange(-1));
  };

  return <section className="profit-leak-workspace">
    <header className="profit-leak-header">
      <button className="academy-back-button engineering-back-button mes-workspace-back profit-leak-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/intelligence')}><ArrowLeft size={16} /> Ops Intelligence</button>
      <div className="profit-leak-heading"><span>OPS INTELLIGENCE / FINANCE</span><h1>Profit Leak</h1><p>Operational factors reducing company profit</p></div>
      <section className="profit-leak-controls">
        <div className="profit-leak-period-tabs">{(['current', 'previous', 'custom'] as const).map((item) => <button className={preset === item ? 'active' : ''} type="button" key={item} onClick={() => setPresetRange(item)}>{item === 'current' ? 'Current month' : item === 'previous' ? 'Previous month' : 'Custom'}</button>)}</div>
        <label><span>From</span><input type="date" value={range.from} onChange={(event) => { setPreset('custom'); setRange((current) => ({ ...current, from: event.target.value })); }} /></label>
        <label><span>To</span><input type="date" value={range.to} onChange={(event) => { setPreset('custom'); setRange((current) => ({ ...current, to: event.target.value })); }} /></label>
        <button className="profit-leak-refresh" type="button" disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'spinning' : ''} /> Refresh</button>
      </section>
      <span className="profit-leak-live"><span><i /> Live analysis</span><small>{updatedAt ? new Date(updatedAt).toLocaleTimeString() : 'Connecting'}</small></span>
    </header>
    {error ? <div className="profit-leak-error"><AlertTriangle size={18} />{error}</div> : null}
    <section className="profit-leak-kpis" aria-label="Profit leak KPIs">
      <article className="scrap-card"><small className="profit-kpi-title">Total Scrap</small><span className="profit-kpi-count"><Trash2 /><strong>{summary.scraps.toLocaleString()}</strong></span><span className="scrap-breakdown"><b><i />End of Life <strong>{summary.eol.toLocaleString()}</strong></b><b><i />Generated Scrap <strong>{summary.generated.toLocaleString()}</strong></b></span><SpendBox value={spendTotals.scrap} /></article>
      <article><small className="profit-kpi-title">Manufacturing Transfers</small><span className="profit-kpi-count"><Repeat2 /><strong>{transfers.length.toLocaleString()}</strong></span><SpendBox value={spendTotals.transfers} /></article>
      <article><small className="profit-kpi-title">Supplies Used</small><span className="profit-kpi-count"><Boxes /><strong>{summary.supplies.toLocaleString()}</strong></span><SpendBox value={spendTotals.supplies} /></article>
      <article><small className="profit-kpi-title">Warranties</small><span className="profit-kpi-count"><ShieldCheck /><strong>{summary.warranties.toLocaleString()}</strong></span><SpendBox value={spendTotals.warranties} /></article>
      <article><small className="profit-kpi-title">Downtime Incidents</small><span className="profit-kpi-count"><TriangleAlert /><strong>{summary.downtime.toLocaleString()}</strong></span><SpendBox value={spendTotals.downtime} /></article>
    </section>
    <section className="profit-leak-events">
      <header><span><small>Cost detail</small><h2>Profit Leak Events</h2></span><strong>{tableRows.length.toLocaleString()} events</strong></header>
      <div className="profit-leak-table-wrap"><table><thead><tr><th>Date</th><th>KPI</th><th>Event detail</th><th>Item / Tool & Client</th><th>Workcenter / Station</th><th>Downtime</th><th>Quantity</th><th>Money Spent</th></tr></thead><tbody>
        {tableRows.map((row) => { const tone = workCenterStyle(row.workCenter); return <tr key={row.id}><td>{new Date(row.date).toLocaleString()}</td><td><span className={`profit-leak-category ${categoryTone(row.category)}`}>{row.category}</span></td><td>{row.detail}</td><td>{row.item}</td><td><span className="profit-leak-location"><b className="workcenter-pill" style={{ background: tone.background, borderColor: tone.border, color: tone.color }}>{row.workCenter}</b><em>{row.station}</em></span></td><td>{row.duration}</td><td>{row.quantity.toLocaleString()}</td><td>{row.spent === null ? <em className="cost-missing">Not recorded</em> : <strong className="cost-value">{money(row.spent, row.currency)}</strong>}</td></tr>; })}
        {!tableRows.length ? <tr><td className="profit-leak-empty" colSpan={8}>{loading ? 'Loading profit leak events…' : 'No profit leak events were recorded in this period.'}</td></tr> : null}
      </tbody></table></div>
    </section>
  </section>;
}
