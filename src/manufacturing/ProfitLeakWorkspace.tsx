import React from 'react';
import { AlertTriangle, ArrowLeft, Boxes, Factory, PackageMinus, RefreshCw, Repeat2, Trash2, TriangleAlert } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import './profitLeak.css';

type Props = { onNavigate: (path: string) => void; organizationId: string };
type RangePreset = 'current' | 'previous' | 'custom';
type LeakEvent = { event_type: string; quantity: number | null; reason: string | null; comment: string | null; payload: unknown; created_at: string };
type TransferRow = { id: string; quantity_rejected: number | null; created_at: string };

const dateInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const monthRange = (offset = 0) => {
  const now = new Date();
  return { from: dateInput(new Date(now.getFullYear(), now.getMonth() + offset, 1)), to: dateInput(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)) };
};
const eventText = (event: LeakEvent) => `${event.reason ?? ''} ${event.comment ?? ''} ${JSON.stringify(event.payload ?? {})}`.toLowerCase();
const isEndOfLife = (event: LeakEvent) => /end[\s_-]*of[\s_-]*life|\beol\b|fin de vida/.test(eventText(event));

export function ProfitLeakWorkspace({ onNavigate, organizationId }: Props) {
  const [preset, setPreset] = React.useState<RangePreset>('current');
  const [range, setRange] = React.useState(() => monthRange());
  const [events, setEvents] = React.useState<LeakEvent[]>([]);
  const [transfers, setTransfers] = React.useState<TransferRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [updatedAt, setUpdatedAt] = React.useState('');

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const from = `${range.from}T00:00:00`;
    const to = `${range.to}T23:59:59.999`;
    const [eventResult, transferResult] = await Promise.all([
      supabase.from('mes_operator_terminal_events')
        .select('event_type, quantity, reason, comment, payload, created_at')
        .eq('organization_id', organizationId)
        .in('event_type', ['production-scrap', 'inventory-consumed', 'downtime-started'])
        .gte('created_at', from).lte('created_at', to),
      supabase.from('mes_supplier_transfers')
        .select('id, quantity_rejected, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', from).lte('created_at', to),
    ]);
    const loadError = eventResult.error ?? transferResult.error;
    if (loadError) {
      setError(loadError.message || 'Unable to load profit leak data.');
    } else {
      setEvents((eventResult.data ?? []) as LeakEvent[]);
      setTransfers((transferResult.data ?? []) as TransferRow[]);
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
    ],
    onRefresh: () => void load(true),
  });

  const summary = React.useMemo(() => {
    const scrap = events.filter((event) => event.event_type === 'production-scrap');
    const eol = scrap.filter(isEndOfLife).reduce((sum, event) => sum + Math.max(1, Number(event.quantity) || 1), 0);
    const generated = scrap.filter((event) => !isEndOfLife(event)).reduce((sum, event) => sum + Math.max(1, Number(event.quantity) || 1), 0);
    const supplies = events.filter((event) => event.event_type === 'inventory-consumed').reduce((sum, event) => sum + Math.max(1, Number(event.quantity) || 1), 0);
    const downtime = events.filter((event) => event.event_type === 'downtime-started').length;
    const rejected = transfers.reduce((sum, transfer) => sum + Math.max(0, Number(transfer.quantity_rejected) || 0), 0);
    return { eol, generated, scraps: eol + generated, supplies, downtime, rejected };
  }, [events, transfers]);

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
      <article className="scrap-card"><Trash2 /><span><small>Total Scrap</small><strong>{summary.scraps.toLocaleString()}</strong><em>pieces reported in the selected period</em><span className="scrap-breakdown"><b><i />End of Life <strong>{summary.eol.toLocaleString()}</strong></b><b><i />Generated Scrap <strong>{summary.generated.toLocaleString()}</strong></b></span></span></article>
      <article><Repeat2 /><span><small>Manufacturing Transfers</small><strong>{transfers.length.toLocaleString()}</strong><em>transfer records created between operations</em></span></article>
      <article><Boxes /><span><small>Supplies Used</small><strong>{summary.supplies.toLocaleString()}</strong><em>inventory units consumed</em></span></article>
      <article><PackageMinus /><span><small>Rejected Pieces</small><strong>{summary.rejected.toLocaleString()}</strong><em>pieces rejected on transfer return</em></span></article>
      <article><TriangleAlert /><span><small>Downtime Incidents</small><strong>{summary.downtime.toLocaleString()}</strong><em>stops with potential profit impact</em></span></article>
    </section>
    <p className="profit-leak-note"><Factory size={15} /> End of Life scrap is identified when the scrap reason or traceability payload is marked “EOL” or “End of Life”; all other reported scrap is classified as Generated Scrap.</p>
  </section>;
}
