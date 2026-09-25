import React from 'react';
import { ArrowLeft, ArrowRight, ClipboardList, Factory, Receipt, RefreshCw, Scale, Search, ShoppingCart, Truck, Users } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import { addToCurrency, assignUsageToLines, daysBetween, sumActiveQuantities } from './otcBalances';
import { fetchOtcOrders, type OtcOrder, type OtcStatus } from './otcOrders';
import { errorMessage, fetchAllRows, formatCalendarDate, formatMoneyByCurrency, formatQuantity, single, todayIso } from './otcShared';
import './orderToCash.css';

type Panel = 'lines' | 'remissions' | 'orders';
type LineScope = 'open' | 'all';
type OrderScope = Exclude<OtcStatus, 'completed'>;

type PoLineBalance = {
  id: string;
  purchaseOrderId: string;
  poReference: string;
  poActive: boolean;
  customerId: string;
  customerName: string;
  currency: string;
  lineNumber: number;
  description: string;
  toolIds: string[];
  unitPrice: number;
  ordered: number;
  consumed: number;
  remissioned: number;
  invoiced: number;
  toRemission: number;
  toInvoice: number;
};

type RemissionBalance = {
  id: string;
  folio: string;
  customerId: string;
  customerName: string;
  date: string;
  ageDays: number;
  pieces: number;
  invoiced: number;
  pending: number;
  pendingValue: Map<string, number>;
  purchaseOrders: string[];
};

type PurchaseOrderRow = { id: string; customer_id: string; po_reference: string; status: string; currency: string; customer: { customer_name: string } | Array<{ customer_name: string }> | null };
type PoItemRow = { id: string; purchase_order_id: string; line_number: number; description: string; tool_ids: string[] | null; quantity: number | string; unit_price: number | string };
type UsageRow = { purchase_order_id: string; tool_id: string | null; pieces: number };
type RemissionRow = { id: string; customer_id: string; remission_folio: string; remission_date: string; status: string; customer: { customer_name: string } | Array<{ customer_name: string }> | null };
type RemissionItemRow = { id: string; remission_id: string; purchase_order_item_id: string; quantity: number | string };
type InvoiceItemRow = { remission_item_id: string; quantity: number | string; invoice: { status: string } | Array<{ status: string }> | null };

type Props = {
  organizationId: string;
  onNavigate: (path: string) => void;
};

const otcPath = '/workspace/manufacturing-ops/intelligence/otc';
const panels: Array<{ value: Panel; label: string }> = [
  { value: 'lines', label: 'PO lines' },
  { value: 'remissions', label: 'Remissions to invoice' },
  { value: 'orders', label: 'Orders missing paperwork' },
];
const orderScopes: Array<{ value: OrderScope; label: string }> = [
  { value: 'purchase-order', label: 'Without PO' },
  { value: 'remission', label: 'Without remission' },
  { value: 'invoice', label: 'Without invoice' },
];

// Reception dates are timestamps, so they are shown in local time (unlike registry calendar dates).
function formatTimestampDate(value: string) {
  return value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function percent(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

function Kpi({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: 'warn' | 'good' }) {
  return (
    <article className={`otc-kpi${tone ? ` ${tone}` : ''}`}>
      <span className="otc-kpi-icon">{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
      <em>{detail}</em>
    </article>
  );
}

export function OtcReconciliationWorkspace({ organizationId, onNavigate }: Props) {
  const [lines, setLines] = React.useState<PoLineBalance[]>([]);
  const [remissions, setRemissions] = React.useState<RemissionBalance[]>([]);
  const [orders, setOrders] = React.useState<OtcOrder[]>([]);
  const [unmatchedByPo, setUnmatchedByPo] = React.useState<Map<string, number>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [panel, setPanel] = React.useState<Panel>('lines');
  const [lineScope, setLineScope] = React.useState<LineScope>('open');
  const [orderScope, setOrderScope] = React.useState<OrderScope>('purchase-order');
  const [customerFilter, setCustomerFilter] = React.useState('');
  const [search, setSearch] = React.useState('');

  const load = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [purchaseOrderRows, poItemRows, usageRows, remissionRows, remissionItemRows, invoiceItemRows, nextOrders] = await Promise.all([
        fetchAllRows<PurchaseOrderRow>((from, to) => supabase
          .from('mes_customer_purchase_orders')
          .select('id, customer_id, po_reference, status, currency, customer:mes_customers!customer_id(customer_name)')
          .eq('organization_id', organizationId)
          .order('po_date', { ascending: false })
          .order('id')
          .range(from, to)),
        fetchAllRows<PoItemRow>((from, to) => supabase
          .from('mes_customer_purchase_order_items')
          .select('id, purchase_order_id, line_number, description, tool_ids, quantity, unit_price')
          .eq('organization_id', organizationId)
          .order('purchase_order_id')
          .order('line_number')
          .range(from, to)),
        fetchAllRows<UsageRow>((from, to) => supabase
          .from('mes_customer_purchase_order_usage')
          .select('purchase_order_id, tool_id, pieces')
          .eq('organization_id', organizationId)
          .order('purchase_order_id')
          .order('tool_id')
          .range(from, to)),
        fetchAllRows<RemissionRow>((from, to) => supabase
          .from('mes_customer_remissions')
          .select('id, customer_id, remission_folio, remission_date, status, customer:mes_customers!customer_id(customer_name)')
          .eq('organization_id', organizationId)
          .order('remission_date', { ascending: true })
          .order('id')
          .range(from, to)),
        fetchAllRows<RemissionItemRow>((from, to) => supabase
          .from('mes_customer_remission_items')
          .select('id, remission_id, purchase_order_item_id, quantity')
          .eq('organization_id', organizationId)
          .order('id')
          .range(from, to)),
        fetchAllRows<InvoiceItemRow>((from, to) => supabase
          .from('mes_customer_invoice_items')
          .select('remission_item_id, quantity, invoice:mes_customer_invoices!invoice_id(status)')
          .eq('organization_id', organizationId)
          .order('id')
          .range(from, to)),
        fetchOtcOrders(organizationId),
      ]);

      const remissionStatus = new Map(remissionRows.map((row) => [row.id, row.status]));
      const remissionItems = remissionItemRows.map((row) => ({ ...row, quantity: Number(row.quantity) || 0, active: remissionStatus.get(row.remission_id) === 'active' }));
      const invoicedByRemissionItem = sumActiveQuantities(
        invoiceItemRows.map((row) => ({ key: row.remission_item_id, quantity: Number(row.quantity) || 0, active: single(row.invoice)?.status === 'active' })),
        (row) => row.key,
        (row) => row.active,
      );
      const remissionedByPoItem = sumActiveQuantities(remissionItems, (row) => row.purchase_order_item_id, (row) => row.active);
      const invoicedByPoItem = sumActiveQuantities(
        remissionItems.map((row) => ({ key: row.purchase_order_item_id, quantity: invoicedByRemissionItem.get(row.id) ?? 0, active: row.active })),
        (row) => row.key,
        (row) => row.active,
      );

      const itemsByPo = new Map<string, PoItemRow[]>();
      poItemRows.forEach((row) => itemsByPo.set(row.purchase_order_id, [...(itemsByPo.get(row.purchase_order_id) ?? []), row]));
      const usageByPo = new Map<string, UsageRow[]>();
      usageRows.forEach((row) => usageByPo.set(row.purchase_order_id, [...(usageByPo.get(row.purchase_order_id) ?? []), row]));

      const nextUnmatched = new Map<string, number>();
      const nextLines = purchaseOrderRows.flatMap((po) => {
        const items = (itemsByPo.get(po.id) ?? []).map((row) => ({ ...row, toolIds: row.tool_ids ?? [] }));
        const usage = assignUsageToLines(items, (usageByPo.get(po.id) ?? []).map((entry) => ({ toolId: entry.tool_id, pieces: entry.pieces })));
        if (usage.unmatched) nextUnmatched.set(po.id, usage.unmatched);
        const customerName = single(po.customer)?.customer_name ?? 'Unknown client';
        return items.map((row, index): PoLineBalance => {
          const ordered = Number(row.quantity) || 0;
          const remissioned = remissionedByPoItem.get(row.id) ?? 0;
          const invoiced = invoicedByPoItem.get(row.id) ?? 0;
          return {
            id: row.id,
            purchaseOrderId: po.id,
            poReference: po.po_reference,
            poActive: po.status === 'active',
            customerId: po.customer_id,
            customerName,
            currency: po.currency,
            lineNumber: row.line_number,
            description: row.description,
            toolIds: row.toolIds,
            unitPrice: Number(row.unit_price) || 0,
            ordered,
            consumed: usage.used[index],
            remissioned,
            invoiced,
            toRemission: Math.max(ordered - remissioned, 0),
            toInvoice: Math.max(remissioned - invoiced, 0),
          };
        });
      });
      const lineById = new Map(nextLines.map((line) => [line.id, line]));

      const today = todayIso();
      const itemsByRemission = new Map<string, typeof remissionItems>();
      remissionItems.forEach((row) => itemsByRemission.set(row.remission_id, [...(itemsByRemission.get(row.remission_id) ?? []), row]));
      const nextRemissions = remissionRows.flatMap((row): RemissionBalance[] => {
        if (row.status !== 'active') return [];
        const items = itemsByRemission.get(row.id) ?? [];
        const pendingValue = new Map<string, number>();
        let pieces = 0;
        let invoiced = 0;
        items.forEach((item) => {
          const billed = Math.min(invoicedByRemissionItem.get(item.id) ?? 0, item.quantity);
          const line = lineById.get(item.purchase_order_item_id);
          pieces += item.quantity;
          invoiced += billed;
          if (line && item.quantity > billed) addToCurrency(pendingValue, line.currency, (item.quantity - billed) * line.unitPrice);
        });
        if (pieces - invoiced <= 0) return [];
        return [{
          id: row.id,
          folio: row.remission_folio,
          customerId: row.customer_id,
          customerName: single(row.customer)?.customer_name ?? 'Unknown client',
          date: row.remission_date,
          ageDays: daysBetween(row.remission_date, today),
          pieces,
          invoiced,
          pending: pieces - invoiced,
          pendingValue,
          purchaseOrders: Array.from(new Set(items.flatMap((item) => { const line = lineById.get(item.purchase_order_item_id); return line ? [line.poReference] : []; }))),
        }];
      });

      setLines(nextLines);
      setUnmatchedByPo(nextUnmatched);
      setRemissions(nextRemissions);
      setOrders(nextOrders);
      setError('');
    } catch (loadError) {
      setError(errorMessage(loadError, 'Unable to load the reconciliation.'));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const realtimeTables = React.useMemo(() => ([
    { table: 'mes_customer_purchase_orders', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_purchase_order_items', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_remissions', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_remission_items', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_invoices', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_invoice_items', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_order_to_cash_documents', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_reception_items', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_production_serials', filter: `organization_id=eq.${organizationId}` },
  ]), [organizationId]);

  useSupabaseRealtimeRefresh({
    channelName: `mes-otc-reconciliation-live:${organizationId}`,
    tables: realtimeTables,
    onRefresh: load,
    enabled: Boolean(organizationId),
    debounceMs: 600,
  });

  const customers = React.useMemo(() => {
    const byId = new Map<string, string>();
    lines.forEach((line) => byId.set(line.customerId, line.customerName));
    remissions.forEach((remission) => byId.set(remission.customerId, remission.customerName));
    // An order's client ids and names are collected apart, so names from orders are only a fallback.
    orders.forEach((order) => order.customerIds.forEach((id, index) => { if (!byId.has(id)) byId.set(id, order.customerNames[index] ?? 'Unknown client'); }));
    return Array.from(byId.entries()).map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name));
  }, [lines, remissions, orders]);

  const scopedLines = React.useMemo(() => lines.filter((line) => !customerFilter || line.customerId === customerFilter), [lines, customerFilter]);
  const scopedRemissions = React.useMemo(() => remissions.filter((remission) => !customerFilter || remission.customerId === customerFilter), [remissions, customerFilter]);
  // Orders processed before OTC are complete by definition and never count as missing paperwork.
  const scopedOrders = React.useMemo(() => orders.filter((order) => !order.isLegacy && (!customerFilter || order.customerIds.includes(customerFilter))), [orders, customerFilter]);

  const summary = React.useMemo(() => {
    const active = scopedLines.filter((line) => line.poActive);
    const sum = (list: PoLineBalance[], pick: (line: PoLineBalance) => number) => list.reduce((total, line) => total + pick(line), 0);
    const orderedValue = new Map<string, number>();
    active.forEach((line) => addToCurrency(orderedValue, line.currency, line.ordered * line.unitPrice));
    const pendingInvoiceValue = new Map<string, number>();
    scopedRemissions.forEach((remission) => remission.pendingValue.forEach((value, currency) => addToCurrency(pendingInvoiceValue, currency, value)));
    const ordersBy = (status: OrderScope) => scopedOrders.filter((order) => order.status === status).length;
    return {
      activePos: new Set(active.map((line) => line.purchaseOrderId)).size,
      ordered: sum(active, (line) => line.ordered),
      orderedValue,
      consumed: sum(active, (line) => line.consumed),
      consumedNotRemissioned: sum(active, (line) => Math.max(line.consumed - line.remissioned, 0)),
      remissioned: sum(active, (line) => line.remissioned),
      toRemission: sum(active, (line) => line.toRemission),
      invoiced: sum(active, (line) => line.invoiced),
      toInvoice: sum(scopedLines, (line) => line.toInvoice),
      pendingRemissions: scopedRemissions.length,
      pendingInvoiceValue,
      withoutPo: ordersBy('purchase-order'),
      withoutRemission: ordersBy('remission'),
      withoutInvoice: ordersBy('invoice'),
    };
  }, [scopedLines, scopedRemissions, scopedOrders]);

  const query = search.trim().toLowerCase();
  const matches = (values: string[]) => !query || values.some((value) => value.toLowerCase().includes(query));

  const visibleLines = scopedLines
    .filter((line) => lineScope === 'all' || (line.poActive && line.toRemission > 0) || line.toInvoice > 0)
    .filter((line) => matches([line.poReference, line.customerName, line.description, ...line.toolIds]));
  const visibleRemissions = scopedRemissions
    .filter((remission) => matches([remission.folio, remission.customerName, ...remission.purchaseOrders]));
  const visibleOrders = scopedOrders
    .filter((order) => order.status === orderScope)
    .filter((order) => matches([order.orderNumber, order.partNumber, order.partName, ...order.customerNames, ...order.voucherNumbers]));
  const scopedUnmatched = Array.from(unmatchedByPo.entries())
    .filter(([poId]) => scopedLines.some((line) => line.purchaseOrderId === poId && line.poActive))
    .reduce((total, [, pieces]) => total + pieces, 0);

  const panelCount: Record<Panel, number> = { lines: visibleLines.length, remissions: visibleRemissions.length, orders: visibleOrders.length };

  return (
    <section className="mes-workspace-panel otc-workspace">
      <header className="otc-compact-header">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/intelligence')}><ArrowLeft size={16} /> Ops Intelligence</button>
        <div>
          <p className="eyebrow">OPS INTELLIGENCE / OTC</p>
          <h1>Reconciliation</h1>
          <span>How purchase orders, remissions, invoices and production orders line up</span>
        </div>
        <div className="otc-header-actions">
          <label className="otc-search otc-select">
            <Users size={16} />
            <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} aria-label="Filter by client">
              <option value="">All clients</option>
              {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <button className="otc-refresh" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'spinning' : ''} /> Refresh</button>
        </div>
      </header>

      {error ? <div className="otc-feedback error" role="alert">{error}</div> : null}

      <section className="otc-kpis" aria-label="Reconciliation summary">
        <Kpi icon={<ShoppingCart size={16} />} label="Ordered · active POs" value={formatQuantity(summary.ordered)} detail={`${summary.activePos} active ${summary.activePos === 1 ? 'PO' : 'POs'} · ${formatMoneyByCurrency(summary.orderedValue)}`} />
        <Kpi icon={<Factory size={16} />} label="Consumed in production" value={formatQuantity(summary.consumed)} detail={`${percent(summary.consumed, summary.ordered)} of ordered · ${formatQuantity(summary.consumedNotRemissioned)} produced, not remissioned`} tone={summary.consumedNotRemissioned > 0 ? 'warn' : undefined} />
        <Kpi icon={<Truck size={16} />} label="Remissioned" value={formatQuantity(summary.remissioned)} detail={`${percent(summary.remissioned, summary.ordered)} of ordered · ${formatQuantity(summary.toRemission)} left to remission`} />
        <Kpi icon={<Receipt size={16} />} label="Invoiced" value={formatQuantity(summary.invoiced)} detail={`${formatQuantity(summary.toInvoice)} remissioned, not invoiced`} tone={summary.toInvoice > 0 ? 'warn' : summary.invoiced > 0 ? 'good' : undefined} />
        <Kpi icon={<Scale size={16} />} label="Remissions to invoice" value={String(summary.pendingRemissions)} detail={formatMoneyByCurrency(summary.pendingInvoiceValue)} tone={summary.pendingRemissions > 0 ? 'warn' : 'good'} />
        <Kpi icon={<ClipboardList size={16} />} label="Orders without PO" value={String(summary.withoutPo)} detail={`${summary.withoutRemission} without remission · ${summary.withoutInvoice} without invoice`} tone={summary.withoutPo > 0 ? 'warn' : 'good'} />
      </section>

      {scopedUnmatched > 0 ? (
        <div className="otc-po-unmatched" role="note">
          {formatQuantity(scopedUnmatched)} {scopedUnmatched === 1 ? 'piece' : 'pieces'} produced for active POs {scopedUnmatched === 1 ? 'has' : 'have'} a Tool ID that is on no line of {scopedUnmatched === 1 ? 'its' : 'their'} PO (or no Tool ID yet), so {scopedUnmatched === 1 ? 'it is' : 'they are'} not counted as consumed.
        </div>
      ) : null}

      <div className="otc-toolbar">
        <div className="otc-filter-chips" role="tablist" aria-label="Reconciliation view">
          {panels.map((entry) => (
            <button type="button" role="tab" aria-selected={panel === entry.value} className={panel === entry.value ? 'active' : ''} onClick={() => setPanel(entry.value)} key={entry.value}>
              <span>{entry.label}</span><strong>{panelCount[entry.value]}</strong>
            </button>
          ))}
        </div>
        <div className="otc-toolbar-filters">
          {panel === 'lines' ? (
            <div className="otc-segmented" role="radiogroup" aria-label="Lines shown">
              <button type="button" role="radio" aria-checked={lineScope === 'open'} className={lineScope === 'open' ? 'active' : ''} onClick={() => setLineScope('open')}>Open</button>
              <button type="button" role="radio" aria-checked={lineScope === 'all'} className={lineScope === 'all' ? 'active' : ''} onClick={() => setLineScope('all')}>All</button>
            </div>
          ) : null}
          {panel === 'orders' ? (
            <div className="otc-segmented" role="radiogroup" aria-label="Missing document">
              {orderScopes.map((entry) => (
                <button type="button" role="radio" aria-checked={orderScope === entry.value} className={orderScope === entry.value ? 'active' : ''} onClick={() => setOrderScope(entry.value)} key={entry.value}>{entry.label}</button>
              ))}
            </div>
          ) : null}
          <label className="otc-search">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={panel === 'orders' ? 'Order, part, client or voucher' : 'PO, folio, client or Tool ID'} aria-label="Search" />
          </label>
        </div>
      </div>

      {panel === 'lines' ? (
        <section className="otc-po-items otc-recon-table" aria-label="PO line balances">
          <header>
            <strong>PO line balance</strong><span>{visibleLines.length}</span>
            <button type="button" className="otc-recon-link" onClick={() => onNavigate(`${otcPath}/purchase-orders`)}>Purchase Orders <ArrowRight size={14} /></button>
          </header>
          <div className="otc-po-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PO</th><th>Item</th>
                  <th className="numeric">Ordered</th>
                  <th className="numeric" title="Pieces of the linked production orders that used this line">Consumed</th>
                  <th className="numeric">Remissioned</th>
                  <th className="numeric">Invoiced</th>
                  <th className="numeric">To remission</th>
                  <th className="numeric">To invoice</th>
                </tr>
              </thead>
              <tbody>
                {visibleLines.map((line) => (
                  <tr key={line.id}>
                    <td><strong>{line.poReference}</strong><small className="otc-cell-note">Line {line.lineNumber} · {line.customerName}{line.poActive ? '' : ' · Closed'}</small></td>
                    <td>
                      {line.description ? <strong>{line.description}</strong> : null}
                      {line.toolIds.length ? <span className="otc-tool-chips">{line.toolIds.map((toolId) => <em key={toolId}>{toolId}</em>)}</span> : null}
                    </td>
                    <td className="numeric">{formatQuantity(line.ordered)}</td>
                    <td className="numeric"><span className={`otc-po-used ${line.consumed > line.ordered ? 'over' : line.consumed > line.remissioned ? 'partial' : ''}`} title={line.consumed > line.remissioned ? `${formatQuantity(line.consumed - line.remissioned)} produced, not remissioned` : undefined}>{formatQuantity(line.consumed)}</span></td>
                    <td className="numeric">{formatQuantity(line.remissioned)}</td>
                    <td className="numeric">{formatQuantity(line.invoiced)}</td>
                    <td className="numeric">{line.toRemission > 0 ? <strong>{formatQuantity(line.toRemission)}</strong> : '—'}</td>
                    <td className="numeric">{line.toInvoice > 0 ? <span className="otc-po-used partial">{formatQuantity(line.toInvoice)}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visibleLines.length ? <p className="otc-recon-empty">{loading ? 'Loading...' : lineScope === 'open' ? 'Every PO line is remissioned and invoiced.' : 'No PO lines match these filters.'}</p> : null}
          </div>
        </section>
      ) : null}

      {panel === 'remissions' ? (
        <section className="otc-po-items otc-recon-table" aria-label="Remissions pending invoice">
          <header>
            <strong>Remissions pending invoice</strong><span>{visibleRemissions.length}</span>
            <button type="button" className="otc-recon-link" onClick={() => onNavigate(`${otcPath}/invoices`)}>Invoices <ArrowRight size={14} /></button>
          </header>
          <div className="otc-po-table-wrap">
            <table>
              <thead>
                <tr><th>Remission</th><th>Client</th><th>POs</th><th className="numeric">Age</th><th className="numeric">Pieces</th><th className="numeric">Invoiced</th><th className="numeric">To invoice</th><th className="numeric">Value to invoice</th></tr>
              </thead>
              <tbody>
                {visibleRemissions.map((remission) => (
                  <tr key={remission.id}>
                    <td><strong>{remission.folio}</strong><small className="otc-cell-note">{formatCalendarDate(remission.date)}</small></td>
                    <td>{remission.customerName}</td>
                    <td>{remission.purchaseOrders.join(', ') || '—'}</td>
                    <td className="numeric"><span className={`otc-po-used ${remission.ageDays > 30 ? 'over' : remission.ageDays > 7 ? 'partial' : ''}`}>{remission.ageDays} d</span></td>
                    <td className="numeric">{formatQuantity(remission.pieces)}</td>
                    <td className="numeric">{formatQuantity(remission.invoiced)}</td>
                    <td className="numeric"><strong>{formatQuantity(remission.pending)}</strong></td>
                    <td className="numeric">{formatMoneyByCurrency(remission.pendingValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visibleRemissions.length ? <p className="otc-recon-empty">{loading ? 'Loading...' : 'Every active remission is fully invoiced.'}</p> : null}
          </div>
        </section>
      ) : null}

      {panel === 'orders' ? (
        <section className="otc-po-items otc-recon-table" aria-label="Production orders missing paperwork">
          <header>
            <strong>{orderScopes.find((entry) => entry.value === orderScope)?.label}</strong><span>{visibleOrders.length}</span>
            <button type="button" className="otc-recon-link" onClick={() => onNavigate(otcPath)}>Order-to-Cash <ArrowRight size={14} /></button>
          </header>
          <div className="otc-po-table-wrap">
            <table>
              <thead>
                <tr><th>Production order</th><th>Client</th><th>Part</th><th>Voucher</th><th className="numeric">Received</th><th className="numeric">Age</th><th className="numeric">Pieces</th><th className="numeric" title="Pieces not covered by this document yet">Uncovered</th></tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const ageDays = daysBetween(order.receivedAt.slice(0, 10), todayIso());
                  return (
                    <tr key={order.productionOrderId}>
                      <td><strong>{order.orderNumber}</strong>{order.isRework ? <small className="otc-cell-note">Rework</small> : null}</td>
                      <td>{order.customerNames.join(', ') || '—'}</td>
                      <td>{[order.partNumber, order.partName].filter(Boolean).join(' · ') || '—'}</td>
                      <td>{order.voucherNumbers.join(', ') || '—'}</td>
                      <td className="numeric">{formatTimestampDate(order.receivedAt)}</td>
                      <td className="numeric"><span className={`otc-po-used ${ageDays > 30 ? 'over' : ageDays > 7 ? 'partial' : ''}`}>{ageDays} d</span></td>
                      <td className="numeric">{formatQuantity(order.quantity)}</td>
                      <td className="numeric">{formatQuantity(Math.max(order.quantity - order.coverage[orderScope], 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visibleOrders.length ? <p className="otc-recon-empty">{loading ? 'Loading...' : 'No production orders are missing this document.'}</p> : null}
          </div>
        </section>
      ) : null}
    </section>
  );
}
