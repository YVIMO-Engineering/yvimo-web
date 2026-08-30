import React from 'react';
import { ChevronDown, ClipboardList, LoaderCircle, Search } from 'lucide-react';
import { customerPortalSupabase as supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import { MesOrderDatePicker } from '../manufacturing/MesWorkspaces';

type Props = { organizationId: string; customerId: string };
type TrackingRow = {
  production_order_id: string; order_number: string; received_at: string | null; piece_type: string | null;
  part_number: string; order_status: string; production_serial_id: string | null; piece_sequence: number | null;
  tool_id: string | null; serial_number: string | null; before_notch: number | null; before_tooth_length: number | null;
  stock_to_remove: number | null; after_tooth_length: number | null; traceability_payload: Record<string, unknown> | null;
  machine: string | null; reported_at: string | null; result: string | null; reception_status: string;
};
const inputDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value)) : '—';
const number = (value: number | null) => value === null ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
const payloadValue = (row: TrackingRow, key: string) => { const value = row.traceability_payload?.[key]; return value === null || value === undefined || value === '' ? '—' : String(value); };
const statusLabel = (value: string) => value.replaceAll('-', ' ');

export function CustomerPortalProductionTracking({ organizationId, customerId }: Props) {
  const now = new Date();
  const [rows, setRows] = React.useState<TrackingRow[]>([]), [search, setSearch] = React.useState(''), [partType, setPartType] = React.useState('all');
  const [from, setFrom] = React.useState(() => inputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = React.useState(() => inputDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const [loading, setLoading] = React.useState(true), [error, setError] = React.useState('');
  const [partTypeOpen, setPartTypeOpen] = React.useState(false);
  const partTypeFilterRef = React.useRef<HTMLDivElement>(null);
  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data, error: loadError } = await supabase.rpc('get_customer_portal_production_tracking', { p_organization_id: organizationId, p_customer_id: customerId });
    setError(loadError?.message ?? ''); setRows((data ?? []) as TrackingRow[]); setLoading(false);
  }, [customerId, organizationId]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    if (!partTypeOpen) return undefined;
    const close = (event: MouseEvent) => {
      if (!partTypeFilterRef.current?.contains(event.target as Node)) setPartTypeOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [partTypeOpen]);
  const realtimeTables = React.useMemo(() => [{ table: 'mes_production_orders', filter: `organization_id=eq.${organizationId}` }, { table: 'mes_production_serials', filter: `organization_id=eq.${organizationId}` }, { table: 'mes_customer_reception_serial_progress', filter: `organization_id=eq.${organizationId}` }], [organizationId]);
  useSupabaseRealtimeRefresh({ client: supabase, channelName: `customer-portal-production-tracking:${organizationId}:${customerId}`, tables: realtimeTables, onRefresh: () => load(true), debounceMs: 180 });

  const partTypes = Array.from(new Set(rows.map((row) => row.piece_type).filter((type): type is string => Boolean(type)))).sort();
  const query = search.trim().toLowerCase();
  const filtered = rows.filter((row) => (!query || [row.order_number, row.serial_number, row.tool_id].some((value) => String(value ?? '').toLowerCase().includes(query))) && (partType === 'all' || row.piece_type === partType) && (!from || (row.received_at ?? row.reported_at ?? '') >= from) && (!to || (row.received_at ?? row.reported_at ?? '').slice(0, 10) <= to));
  const orderCount = new Set(filtered.map((row) => row.production_order_id)).size, good = filtered.filter((row) => row.result === 'good').length, scrap = filtered.filter((row) => row.result === 'scrap').length;
  const selectedPart = partType.toLowerCase(), isAllParts = partType === 'all', isShaver = selectedPart.includes('shaver'), isShaper = selectedPart.includes('shaper') || selectedPart.includes('tallador');
  const damage = (row: TrackingRow) => row.traceability_payload?.shaver_damage === true ? 'Yes' : row.traceability_payload?.shaver_damage === false ? 'No' : '—';
  const processValues = (row: TrackingRow): Array<[string, string]> => {
    const type = (row.piece_type ?? '').toLowerCase();
    return type.includes('shaver') ? [['No. Afilado', payloadValue(row, 'shaver_sharpening_number')], ['Diameter', payloadValue(row, 'shaver_diameter')], ['Span', payloadValue(row, 'shaver_span')], ['Teeth', payloadValue(row, 'shaver_teeth')], ['Damage', damage(row)]] : type.includes('shaper') || type.includes('tallador') ? [['Before height', payloadValue(row, 'before_height')], ['Stock removal', number(row.stock_to_remove)], ['After height', payloadValue(row, 'after_height')]] : [['Before notch', number(row.before_notch)], ['Before tooth', number(row.before_tooth_length)], ['Stock removal', number(row.stock_to_remove)], ['After tooth', number(row.after_tooth_length)]];
  };
  const headers = isShaver ? ['No. Afilado', 'Diameter', 'Span', 'Teeth', 'Damage'] : isShaper ? ['Before height', 'Stock to remove', 'After height'] : ['Before notch', 'Before tooth length', 'Stock to remove', 'After tooth length'];
  const values = (row: TrackingRow) => isShaver ? [payloadValue(row, 'shaver_sharpening_number'), payloadValue(row, 'shaver_diameter'), payloadValue(row, 'shaver_span'), payloadValue(row, 'shaver_teeth'), damage(row)] : isShaper ? [payloadValue(row, 'before_height'), number(row.stock_to_remove), payloadValue(row, 'after_height')] : [number(row.before_notch), number(row.before_tooth_length), number(row.stock_to_remove), number(row.after_tooth_length)];

  if (loading) return <div className="cp-dashboard-state"><LoaderCircle className="cp-spin" size={25} /><strong>Loading production tracking…</strong></div>;
  return <div className="cp-tracking-page">
    <section className="cp-tracking-filters"><label className="search"><Search size={17} /><span><small>SEARCH PRODUCTION TRACKING</small><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order, serial number or Tool ID" /></span></label><div className="cp-orders-part-filter" ref={partTypeFilterRef}><button type="button" aria-expanded={partTypeOpen} onClick={() => setPartTypeOpen((open) => !open)}><span><small>PART TYPE</small><strong>{partType === 'all' ? 'All part types' : partType}</strong></span><ChevronDown size={16} /></button>{partTypeOpen ? <div>{['all', ...partTypes].map((type) => <button className={partType === type ? 'active' : ''} type="button" key={type} onClick={() => { setPartType(type); setPartTypeOpen(false); }}>{type === 'all' ? 'All part types' : type}</button>)}</div> : null}</div><div className="cp-orders-date cp-tracking-date-range"><label><small>FROM</small><MesOrderDatePicker id="customer-tracking-from" value={from} onChange={(value) => { setFrom(value); if (value > to) setTo(value); }} /></label><i /><label><small>TO</small><MesOrderDatePicker id="customer-tracking-to" value={to} onChange={(value) => { setTo(value); if (value < from) setFrom(value); }} /></label></div></section>
    {error ? <div className="cp-dashboard-warning">Production tracking could not be loaded: {error}</div> : null}
    <section className="cp-tracking-kpis"><article><small>PRODUCTION ORDERS</small><strong>{orderCount}</strong></article><article><small>TRACKED PIECES</small><strong>{filtered.length}</strong></article><article className="good"><small>COMPLETED GOOD</small><strong>{good}</strong></article><article className="scrap"><small>SCRAP PIECES</small><strong>{scrap}</strong></article></section>
    <section className="cp-tracking-table"><header><div><small>PRODUCTION HISTORY</small><h2>Customer order detail</h2></div><span><ClipboardList size={15} /> {filtered.length} records</span></header><div><table className={isAllParts ? 'all-parts' : 'specific-part'}><thead><tr><th>Order</th><th>Received</th><th>Part type</th><th>Part number</th><th>Tool ID</th><th>Serial number</th>{isAllParts ? <th>Process data</th> : headers.map((header) => <th key={header}>{header}</th>)}<th>Machine</th><th>Reported</th><th>Result</th><th>Manufacturing</th><th>Reception</th></tr></thead><tbody>{filtered.map((row, index) => <tr key={`${row.production_order_id}:${row.production_serial_id ?? index}`}><td><strong>#{row.order_number}</strong></td><td>{formatDate(row.received_at)}</td><td><em className="part">{row.piece_type || 'Other'}</em></td><td>{row.part_number || '—'}</td><td>{row.tool_id || '—'}</td><td><strong>{row.serial_number || 'Pending'}</strong></td>{isAllParts ? <td><span className="process">{processValues(row).map(([label, value]) => <small key={label}>{label} <b>{value}</b></small>)}</span></td> : values(row).map((value, i) => <td key={headers[i]}>{value}</td>)}<td>{row.machine || '—'}</td><td>{formatDate(row.reported_at)}</td><td><em className={`result-${row.result ?? 'pending'}`}>{row.result || 'Pending'}</em></td><td><em className={`status status-${row.order_status}`}>{statusLabel(row.order_status)}</em></td><td><em className={`reception reception-${row.reception_status}`}>{statusLabel(row.reception_status)}</em></td></tr>)}</tbody></table>{!filtered.length ? <p>No production records match these filters.</p> : null}</div></section>
  </div>;
}
