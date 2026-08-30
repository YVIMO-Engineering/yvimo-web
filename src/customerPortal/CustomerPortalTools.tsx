import React from 'react';
import { Box, CalendarClock, History, LoaderCircle, MapPin, Search, Wrench } from 'lucide-react';
import { customerPortalSupabase as supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';

type Props = { organizationId: string; customerId: string };
type ToolRow = {
  id: string; source_type: string; source_production_order_id: string | null; last_production_order_id: string | null;
  asset_type: string; serial_number: string; part_number: string | null; description: string; manufacturer: string | null;
  family_category: string | null; current_location: string | null; status: string; estimated_life_percent: number | null;
  max_sharpenings: number | null; last_inspection_at: string | null; last_service_at: string | null; service_count: number;
  tool_id: string | null; internal_tool_id: string | null; minimum_life: number | null; measurement_unit: string | null;
};
type ServiceRow = { id: string; asset_id: string; production_order_id: string | null; service_type: string; result: string; service_date: string; remaining_life_percent: number | null; notes: string; order_number: string | null };

const palette = ['purple', 'orange', 'green', 'blue', 'red'];

function displayDate(value: string | null) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value));
}

export function CustomerPortalTools({ organizationId, customerId }: Props) {
  const [tools, setTools] = React.useState<ToolRow[]>([]);
  const [services, setServices] = React.useState<ServiceRow[]>([]);
  const [selectedId, setSelectedId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const loadTools = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [toolResult, serviceResult] = await Promise.all([
      supabase.rpc('get_customer_portal_tools', { p_organization_id: organizationId, p_customer_id: customerId }),
      supabase.rpc('get_customer_portal_tool_services', { p_organization_id: organizationId, p_customer_id: customerId }),
    ]);
    setError(toolResult.error?.message ?? serviceResult.error?.message ?? '');
    const nextTools = (toolResult.data ?? []) as ToolRow[];
    setTools(nextTools);
    setServices((serviceResult.data ?? []) as ServiceRow[]);
    setSelectedId((current) => current && nextTools.some((tool) => tool.id === current) ? current : nextTools[0]?.id ?? '');
    setLoading(false);
  }, [customerId, organizationId]);

  React.useEffect(() => { void loadTools(); }, [loadTools]);

  const realtimeTables = React.useMemo(() => [
    { table: 'mes_customer_assets', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_asset_service_events', filter: `organization_id=eq.${organizationId}` },
  ], [organizationId]);
  useSupabaseRealtimeRefresh({ client: supabase, channelName: `customer-portal-tools:${organizationId}:${customerId}`, tables: realtimeTables, onRefresh: () => loadTools(true), debounceMs: 180 });

  const normalizedSearch = search.trim().toLowerCase();
  const filteredTools = tools.filter((tool) => !normalizedSearch || [tool.tool_id, tool.internal_tool_id, tool.serial_number, tool.asset_type, tool.family_category, tool.part_number].filter(Boolean).join(' ').toLowerCase().includes(normalizedSearch));
  const selected = tools.find((tool) => tool.id === selectedId) ?? filteredTools[0] ?? null;
  const selectedServices = selected ? services.filter((service) => service.asset_id === selected.id).sort((a, b) => b.service_date.localeCompare(a.service_date)) : [];
  const partTypeKpis = Array.from(tools.reduce((counts, tool) => { const type = tool.asset_type?.trim() || 'Unspecified'; counts.set(type, (counts.get(type) ?? 0) + 1); return counts; }, new Map<string, number>())).sort((a, b) => b[1] - a[1]);

  if (loading) return <div className="cp-dashboard-state"><LoaderCircle className="cp-spin" size={25} /><strong>Loading customer tools…</strong></div>;

  return <div className="cp-tools-page">
    <section className="cp-tools-heading"><div><small>CUSTOMER PORTAL</small><h1>Tools</h1><p>Your complete asset registry, lifecycle and service history.</p></div><div className="cp-tools-kpis"><span className="total"><strong>{tools.length}</strong><small>TOTAL TOOLS</small></span>{partTypeKpis.map(([type, count], index) => <span className={palette[index % palette.length]} key={type}><strong>{count}</strong><small>{type}</small></span>)}</div></section>
    <label className="cp-tools-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by Tool ID, serial number or part type" /><span>{filteredTools.length} results</span></label>
    {error ? <div className="cp-dashboard-warning">Some tool information could not be loaded: {error}</div> : null}
    <section className="cp-tools-workspace">
      <aside><header><span><Box size={16} /> Tool registry</span><strong>{filteredTools.length} items</strong></header><div>{filteredTools.map((tool) => <button className={selected?.id === tool.id ? 'selected' : ''} type="button" key={tool.id} onClick={() => setSelectedId(tool.id)}><span><Box size={17} /></span><div><em>{tool.asset_type}</em><strong>{tool.tool_id || 'Tool ID not assigned'}</strong><small>{tool.serial_number}</small></div><b>{tool.service_count}<small>services</small></b></button>)}{!filteredTools.length ? <p>No tools match your search.</p> : null}</div></aside>
      {selected ? <article className="cp-tool-detail"><header><span><Box size={22} /></span><div><small>{selected.source_type === 'production-order' ? 'GENERATED FROM PRODUCTION ORDER' : 'REGISTERED ASSET'}</small><h2>{selected.asset_type}</h2><strong>{selected.serial_number}</strong></div><em className={`status-${selected.status}`}>{selected.status.replaceAll('-', ' ')}</em></header>
        <div className="cp-tool-identity"><span><small>PART TYPE</small><strong>{selected.family_category || selected.asset_type}</strong></span><span><small>SERIAL NUMBER</small><strong>{selected.serial_number}</strong></span><span><small>TOOL ID</small><strong>{selected.tool_id || 'Not specified'}</strong></span><span><small>INTERNAL TOOL ID</small><strong>{selected.internal_tool_id || 'Not specified'}</strong></span></div>
        <section className="cp-tool-life"><header><span>Estimated useful life</span><strong>{selected.estimated_life_percent === null ? 'Not estimated' : `${Math.round(selected.estimated_life_percent)}%`}</strong></header><i><em style={{ width: `${selected.estimated_life_percent ?? 0}%` }} /></i><div><span><small>MAX SHARPENINGS</small><strong>{selected.max_sharpenings ?? '—'}</strong></span><span><small>MINIMUM LIFE EOL</small><strong>{selected.minimum_life === null ? '—' : `${selected.minimum_life} ${selected.measurement_unit ?? ''}`}</strong></span><span><small>TOTAL SERVICES</small><strong>{selected.service_count}</strong></span></div></section>
        <div className="cp-tool-facts"><span><CalendarClock size={17} /><small>LAST SERVICE</small><strong>{displayDate(selected.last_service_at)}</strong></span><span><CalendarClock size={17} /><small>LAST INSPECTION</small><strong>{displayDate(selected.last_inspection_at)}</strong></span><span><MapPin size={17} /><small>CURRENT LOCATION</small><strong>{selected.current_location || 'Not specified'}</strong></span></div>
        {selected.description ? <p className="cp-tool-description"><strong>Description</strong>{selected.description}</p> : null}
        <section className="cp-tool-history"><header><span><History size={17} /> Service history</span><strong>{selectedServices.length} events</strong></header>{selectedServices.length ? <div>{selectedServices.map((service) => <article key={service.id}><span><Wrench size={16} /><strong>{service.service_type}</strong></span><time>{displayDate(service.service_date)}</time><span><small>ORDER</small><strong>{service.order_number || 'Not linked'}</strong></span><em className={`result-${service.result}`}>{service.result}</em><span><small>REMAINING LIFE</small><strong>{service.remaining_life_percent === null ? '—' : `${service.remaining_life_percent}%`}</strong></span></article>)}</div> : <p>No service events have been recorded for this tool.</p>}</section>
      </article> : <div className="cp-tool-empty"><Box size={28} /><strong>Select a tool</strong><p>Choose an asset from the registry to see its details.</p></div>}
    </section>
  </div>;
}
