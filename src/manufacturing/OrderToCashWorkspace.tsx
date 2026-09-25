import React from 'react';
import { ArrowLeft, CalendarDays, Check, ChevronDown, ClipboardList, Eye, FileCheck2, FileText, History, ImagePlus, LockKeyhole, Plus, ReceiptText, RefreshCw, Search, Truck } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import { invoiceTotals } from './otcBalances';
import { fetchOtcOrders, legacyNotice, type DocumentStage, type OtcDocument, type OtcOrder, type OtcStatus } from './otcOrders';
import { DocumentPreviewModal, documentsBucket, errorMessage, fetchAllRows, formatCalendarDate, formatMoney, formatQuantity, isPdfFile, single, signedUrlSeconds } from './otcShared';
import './orderToCash.css';

type OtcFilter = 'all' | OtcStatus;

// An active PO, remission or invoice from its registry that an OTC step can link.
type RegistryCandidate = {
  id: string;
  customerId: string;
  folio: string;
  title: string;
  subtitle: string;
  detail: string;
  amount: string;
  search: string[];
  // Registry ids of the previous stage this record covers (the POs a remission delivers,
  // the remissions an invoice bills), used to put the matching records first.
  coversIds: string[];
  coversLabels: Record<string, string>;
  fileName: string;
  filePath: string;
  fileType: string;
};

type PurchaseOrderRow = {
  id: string;
  customer_id: string;
  po_reference: string;
  revision_number: number;
  po_date: string;
  currency: string;
  requisition_number: string;
  file_name: string;
  file_path: string;
  file_type: string;
  customer: { customer_name: string } | Array<{ customer_name: string }> | null;
  items: Array<{ subtotal: number | string; tool_ids: string[] | null }> | null;
};

type RemissionRow = {
  id: string;
  customer_id: string;
  remission_folio: string;
  remission_date: string;
  file_name: string;
  file_path: string;
  file_type: string;
  customer: { customer_name: string } | Array<{ customer_name: string }> | null;
  items: Array<{
    quantity: number | string;
    po_item: { purchase_order_id: string; purchase_order: { po_reference: string } | Array<{ po_reference: string }> | null } | Array<{ purchase_order_id: string; purchase_order: { po_reference: string } | Array<{ po_reference: string }> | null }> | null;
  }> | null;
};

type InvoiceRow = {
  id: string;
  customer_id: string;
  invoice_folio: string;
  invoice_date: string;
  currency: string;
  tax_rate: number | string;
  file_name: string;
  file_path: string;
  file_type: string;
  customer: { customer_name: string } | Array<{ customer_name: string }> | null;
  items: Array<{
    subtotal: number | string;
    remission_item: { remission_id: string; remission: { remission_folio: string } | Array<{ remission_folio: string }> | null } | Array<{ remission_id: string; remission: { remission_folio: string } | Array<{ remission_folio: string }> | null }> | null;
  }> | null;
};

type Preview = { title: string; subtitle: string; url: string; isPdf: boolean };

type Props = {
  organizationId: string;
  onNavigate: (path: string) => void;
};

const otcPath = '/workspace/manufacturing-ops/intelligence/otc';
const steps = ['Production Order', 'Purchase Order', 'Remission', 'Invoice'];
const documentStages: Array<{ stage: DocumentStage; label: string; folioLabel: string; description: string; column: string; registryPath: string; placeholder: string }> = [
  { stage: 'purchase-order', label: 'Purchase Order', folioLabel: 'PO reference', description: 'Select the active customer purchase order that covers this production order.', column: 'purchase_order_id', registryPath: `${otcPath}/purchase-orders`, placeholder: 'Search active POs by reference or Tool ID' },
  { stage: 'remission', label: 'Remission', folioLabel: 'Remission folio', description: 'Select the remission issued when the pieces were delivered.', column: 'remission_id', registryPath: `${otcPath}/remissions`, placeholder: 'Search remissions by folio or PO' },
  { stage: 'invoice', label: 'Invoice', folioLabel: 'Invoice folio', description: 'Select the invoice billed to the customer for this production order.', column: 'invoice_id', registryPath: `${otcPath}/invoices`, placeholder: 'Search invoices by folio or remission' },
];
const statusStep: Record<OtcStatus, number> = { 'purchase-order': 1, remission: 2, invoice: 3, completed: 4 };
const statusLabel: Record<OtcStatus, string> = {
  'purchase-order': 'Awaiting PO',
  remission: 'Awaiting Remission',
  invoice: 'Awaiting Invoice',
  completed: 'Completed',
};
const filters: Array<{ value: OtcFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'purchase-order', label: statusLabel['purchase-order'] },
  { value: 'remission', label: statusLabel.remission },
  { value: 'invoice', label: statusLabel.invoice },
  { value: 'completed', label: statusLabel.completed },
];

function previousStage(stage: DocumentStage): DocumentStage | null {
  return stage === 'remission' ? 'purchase-order' : stage === 'invoice' ? 'remission' : null;
}

function stageLabel(stage: DocumentStage) {
  return documentStages.find((entry) => entry.stage === stage)?.label ?? stage;
}

function formatDate(value: string) {
  if (!value) return 'Not specified';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimestamp(value: string) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatProductionStatus(status: string) {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Not specified';
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

type RegistryPickerProps = {
  candidates: RegistryCandidate[];
  currentId: string;
  // Registry id of the previous stage on this order; candidates covering it are marked.
  matchId: string;
  matchVerb: string;
  placeholder: string;
  disabled: boolean;
  onPick: (candidate: RegistryCandidate) => void;
};

// Search dropdown of the registry records a production order can be linked to. The list opens
// inline, under the search box, so the document card never clips it.
function RegistryPicker({ candidates, currentId, matchId, matchVerb, placeholder, disabled, onPick }: RegistryPickerProps) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listId = React.useId();

  const matches = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const found = needle ? candidates.filter((candidate) => candidate.search.some((value) => value.toLowerCase().includes(needle))) : candidates;
    return matchId ? [...found].sort((left, right) => Number(right.coversIds.includes(matchId)) - Number(left.coversIds.includes(matchId))) : found;
  }, [candidates, query, matchId]);

  React.useEffect(() => { setActiveIndex(0); }, [query]);

  const pick = (candidate: RegistryCandidate) => {
    setOpen(false);
    setQuery('');
    onPick(candidate);
  };

  return (
    <div className={`otc-po-picker${open ? ' open' : ''}`}>
      <label className="otc-po-picker-input">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter' && open && matches[activeIndex]) {
              event.preventDefault();
              pick(matches[activeIndex]);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        <ChevronDown size={15} />
      </label>
      {open ? (
        <ul id={listId} role="listbox" className="otc-po-picker-list">
          {matches.map((candidate, index) => (
            <li
              role="option"
              aria-selected={index === activeIndex}
              className={`${index === activeIndex ? 'active' : ''}${candidate.id === currentId ? ' current' : ''}`}
              key={candidate.id}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => pick(candidate)}
            >
              <span className="otc-po-picker-main">
                <strong>{candidate.title}</strong>
                <small>{candidate.subtitle}</small>
                {candidate.detail ? <small className="otc-po-picker-tools">{candidate.detail}</small> : null}
                {matchId && candidate.coversIds.includes(matchId) ? <small className="otc-po-picker-match"><Check size={11} /> {matchVerb} {candidate.coversLabels[matchId]}</small> : null}
              </span>
              <em>{candidate.amount}</em>
              {candidate.id === currentId ? <Check size={15} /> : null}
            </li>
          ))}
          {!matches.length ? <li className="otc-po-picker-empty">Nothing matches "{query.trim()}".</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

export function OrderToCashWorkspace({ organizationId, onNavigate }: Props) {
  const [orders, setOrders] = React.useState<OtcOrder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [selectedId, setSelectedId] = React.useState('');
  const [filter, setFilter] = React.useState<OtcFilter>('all');
  const [search, setSearch] = React.useState('');
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [previewError, setPreviewError] = React.useState('');
  const [registry, setRegistry] = React.useState<Record<DocumentStage, RegistryCandidate[]>>({ 'purchase-order': [], remission: [], invoice: [] });
  const [linkingStage, setLinkingStage] = React.useState<DocumentStage | null>(null);
  const [linkError, setLinkError] = React.useState<{ stage: DocumentStage; message: string } | null>(null);
  const [changingStage, setChangingStage] = React.useState<DocumentStage | null>(null);

  const loadOrders = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [nextOrders, purchaseOrderRows, remissionRows, invoiceRows] = await Promise.all([
        fetchOtcOrders(organizationId),
        fetchAllRows<PurchaseOrderRow>((from, to) => supabase
          .from('mes_customer_purchase_orders')
          .select('id, customer_id, po_reference, revision_number, po_date, currency, requisition_number, file_name, file_path, file_type, customer:mes_customers!customer_id(customer_name), items:mes_customer_purchase_order_items(subtotal, tool_ids)')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .order('po_date', { ascending: false })
          .order('id')
          .range(from, to)),
        fetchAllRows<RemissionRow>((from, to) => supabase
          .from('mes_customer_remissions')
          .select('id, customer_id, remission_folio, remission_date, file_name, file_path, file_type, customer:mes_customers!customer_id(customer_name), items:mes_customer_remission_items(quantity, po_item:mes_customer_purchase_order_items!purchase_order_item_id(purchase_order_id, purchase_order:mes_customer_purchase_orders!purchase_order_id(po_reference)))')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .order('remission_date', { ascending: false })
          .order('id')
          .range(from, to)),
        fetchAllRows<InvoiceRow>((from, to) => supabase
          .from('mes_customer_invoices')
          .select('id, customer_id, invoice_folio, invoice_date, currency, tax_rate, file_name, file_path, file_type, customer:mes_customers!customer_id(customer_name), items:mes_customer_invoice_items(subtotal, remission_item:mes_customer_remission_items!remission_item_id(remission_id, remission:mes_customer_remissions!remission_id(remission_folio)))')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .order('invoice_date', { ascending: false })
          .order('id')
          .range(from, to)),
      ]);
      setRegistry({
        'purchase-order': purchaseOrderRows.map((row) => {
          const items = row.items ?? [];
          const customerName = single(row.customer)?.customer_name ?? 'Unknown client';
          const toolIds = uniqueList(items.flatMap((item) => item.tool_ids ?? []));
          const total = Math.round(items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0) * 100) / 100;
          return {
            id: row.id,
            customerId: row.customer_id,
            folio: row.po_reference,
            title: `${row.po_reference}${row.revision_number ? ` · Rev ${row.revision_number}` : ''}`,
            subtitle: `${customerName} · ${formatCalendarDate(row.po_date)} · ${items.length} ${items.length === 1 ? 'item' : 'items'}`,
            detail: toolIds.length ? `${toolIds.slice(0, 4).join(', ')}${toolIds.length > 4 ? ` +${toolIds.length - 4}` : ''}` : '',
            amount: formatMoney(total, row.currency),
            search: [row.po_reference, row.requisition_number, customerName, ...toolIds],
            coversIds: [],
            coversLabels: {},
            fileName: row.file_name,
            filePath: row.file_path,
            fileType: row.file_type,
          };
        }),
        remission: remissionRows.map((row) => {
          const items = row.items ?? [];
          const customerName = single(row.customer)?.customer_name ?? 'Unknown client';
          const coversLabels: Record<string, string> = {};
          items.forEach((item) => {
            const poItem = single(item.po_item);
            if (poItem) coversLabels[poItem.purchase_order_id] = single(poItem.purchase_order)?.po_reference ?? 'PO';
          });
          const pieces = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
          const references = uniqueList(Object.values(coversLabels));
          return {
            id: row.id,
            customerId: row.customer_id,
            folio: row.remission_folio,
            title: row.remission_folio,
            subtitle: `${customerName} · ${formatCalendarDate(row.remission_date)} · ${items.length} ${items.length === 1 ? 'line' : 'lines'}`,
            detail: references.length ? `PO ${references.join(', ')}` : '',
            amount: `${formatQuantity(pieces)} pcs`,
            search: [row.remission_folio, customerName, ...references],
            coversIds: Object.keys(coversLabels),
            coversLabels,
            fileName: row.file_name,
            filePath: row.file_path,
            fileType: row.file_type,
          };
        }),
        invoice: invoiceRows.map((row) => {
          const items = row.items ?? [];
          const customerName = single(row.customer)?.customer_name ?? 'Unknown client';
          const coversLabels: Record<string, string> = {};
          items.forEach((item) => {
            const remissionItem = single(item.remission_item);
            if (remissionItem) coversLabels[remissionItem.remission_id] = single(remissionItem.remission)?.remission_folio ?? 'Remission';
          });
          const folios = uniqueList(Object.values(coversLabels));
          const totals = invoiceTotals(items.map((item) => Number(item.subtotal) || 0), Number(row.tax_rate) || 0);
          return {
            id: row.id,
            customerId: row.customer_id,
            folio: row.invoice_folio,
            title: row.invoice_folio,
            subtitle: `${customerName} · ${formatCalendarDate(row.invoice_date)} · ${items.length} ${items.length === 1 ? 'line' : 'lines'}`,
            detail: folios.length ? `Remission ${folios.join(', ')}` : '',
            amount: formatMoney(totals.total, row.currency),
            search: [row.invoice_folio, customerName, ...folios],
            coversIds: Object.keys(coversLabels),
            coversLabels,
            fileName: row.file_name,
            filePath: row.file_path,
            fileType: row.file_type,
          };
        }),
      });
      setOrders(nextOrders);
      setSelectedId((current) => (nextOrders.some((order) => order.productionOrderId === current) ? current : nextOrders[0]?.productionOrderId ?? ''));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Order-to-Cash records.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const realtimeTables = React.useMemo(() => ([
    { table: 'mes_order_to_cash_documents', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_reception_items', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_production_orders', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_purchase_orders', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_remissions', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_invoices', filter: `organization_id=eq.${organizationId}` },
  ]), [organizationId]);

  useSupabaseRealtimeRefresh({
    channelName: `mes-order-to-cash-live:${organizationId}`,
    tables: realtimeTables,
    onRefresh: loadOrders,
    enabled: Boolean(organizationId),
    debounceMs: 400,
  });

  const counts = React.useMemo(() => {
    const result: Record<OtcFilter, number> = { all: orders.length, 'purchase-order': 0, remission: 0, invoice: 0, completed: 0 };
    orders.forEach((order) => { result[order.status] += 1; });
    return result;
  }, [orders]);

  const filteredOrders = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter !== 'all' && order.status !== filter) return false;
      if (!query) return true;
      return [order.orderNumber, order.partNumber, order.partName, ...order.customerNames, ...order.voucherNumbers, ...Object.values(order.documents).map((document) => document?.folio ?? '')]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [orders, filter, search]);

  const selected = orders.find((order) => order.productionOrderId === selectedId) ?? null;

  React.useEffect(() => {
    setChangingStage(null);
    setLinkError(null);
  }, [selectedId]);

  const linkRegistryDocument = async (order: OtcOrder, stage: DocumentStage, candidate: RegistryCandidate) => {
    const existing = order.documents[stage];
    const entry = documentStages.find((item) => item.stage === stage);
    if (!entry || linkingStage || existing?.registryId === candidate.id) {
      setChangingStage(null);
      return;
    }
    setLinkingStage(stage);
    setLinkError(null);
    try {
      // Folio and file are copied from the registry by the database; they are sent too
      // because the columns are required.
      const { error: saveError } = await supabase.from('mes_order_to_cash_documents').upsert({
        organization_id: organizationId,
        production_order_id: order.productionOrderId,
        stage,
        [entry.column]: candidate.id,
        folio: candidate.folio,
        file_name: candidate.fileName,
        file_path: candidate.filePath,
        file_type: candidate.fileType,
      }, { onConflict: 'production_order_id,stage' });
      if (saveError) throw saveError;
      // A document uploaded directly in OTC (before the registries) owned its file; a
      // registry record's file belongs to the registry and must stay.
      if (existing && !existing.registryId) {
        await supabase.storage.from(documentsBucket).remove([existing.filePath]);
      }
      setChangingStage(null);
      await loadOrders();
    } catch (saveError) {
      console.error(`Unable to link ${stage}`, saveError);
      setLinkError({ stage, message: errorMessage(saveError, `Unable to link the ${stageLabel(stage).toLowerCase()}.`) });
    } finally {
      setLinkingStage(null);
    }
  };

  const renderRegistryPicker = (order: OtcOrder, stage: DocumentStage) => {
    const entry = documentStages.find((item) => item.stage === stage)!;
    const candidates = registry[stage].filter((candidate) => order.customerIds.includes(candidate.customerId));
    const clientName = order.customerNames.join(', ') || 'this client';
    if (!candidates.length) {
      return (
        <div className="otc-po-picker-none">
          <p className="otc-document-hint">No active {entry.label.toLowerCase()}s for {clientName}.</p>
          <button type="button" onClick={() => onNavigate(entry.registryPath)}><Plus size={15} /> Register {entry.label}</button>
        </div>
      );
    }
    const required = previousStage(stage);
    return (
      <RegistryPicker
        candidates={candidates}
        currentId={order.documents[stage]?.registryId ?? ''}
        matchId={required ? order.documents[required]?.registryId ?? '' : ''}
        matchVerb={stage === 'invoice' ? 'Bills' : 'Delivers'}
        placeholder={entry.placeholder}
        disabled={Boolean(linkingStage)}
        onPick={(candidate) => void linkRegistryDocument(order, stage, candidate)}
      />
    );
  };

  const openPreview = async (linkedDocument: OtcDocument) => {
    setPreviewError('');
    const { data, error: signedUrlError } = await supabase.storage.from(documentsBucket).createSignedUrl(linkedDocument.filePath, signedUrlSeconds);
    if (signedUrlError || !data?.signedUrl) {
      setPreviewError(signedUrlError?.message || 'This document could not be opened.');
      return;
    }
    setPreview({ title: linkedDocument.fileName, subtitle: `${stageLabel(linkedDocument.stage)} · Folio ${linkedDocument.folio}`, url: data.signedUrl, isPdf: isPdfFile(linkedDocument) });
  };

  return (
    <section className="mes-workspace-panel otc-workspace">
      <header className="otc-compact-header">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/intelligence')}><ArrowLeft size={16} /> Ops Intelligence</button>
        <div>
          <p className="eyebrow">OPS INTELLIGENCE / OTC</p>
          <h1>Order-to-Cash</h1>
          <span>Administrative status of every production order, from purchase order to invoice</span>
        </div>
        <button className="otc-refresh" type="button" onClick={() => void loadOrders()} disabled={loading}><RefreshCw size={15} className={loading ? 'spinning' : ''} /> Refresh</button>
      </header>

      {error ? <div className="otc-feedback error" role="alert">{error}</div> : null}
      {previewError ? <div className="otc-feedback error" role="alert">{previewError}</div> : null}

      <div className="otc-toolbar">
        <div className="otc-filter-chips" role="radiogroup" aria-label="Filter by administrative status">
          {filters.map((entry) => (
            <button type="button" role="radio" aria-checked={filter === entry.value} className={`${filter === entry.value ? 'active' : ''} ${entry.value}`} onClick={() => setFilter(entry.value)} key={entry.value}>
              <span>{entry.label}</span><strong>{counts[entry.value]}</strong>
            </button>
          ))}
        </div>
        <label className="otc-search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order, client, voucher or folio" aria-label="Search Order-to-Cash records" />
        </label>
      </div>

      <div className="supplier-transfer-registry-layout otc-layout">
        <section className="supplier-active-transfers">
          <div><span><ClipboardList size={16} /> Order Registry</span><strong>{filteredOrders.length} shown</strong></div>
          <div className="supplier-active-transfer-list">
            {filteredOrders.map((order) => (
              <article
                className={order.productionOrderId === selectedId ? 'active' : ''}
                key={order.productionOrderId}
                role="button"
                tabIndex={0}
                aria-pressed={order.productionOrderId === selectedId}
                onClick={() => setSelectedId(order.productionOrderId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(order.productionOrderId);
                  }
                }}
              >
                <span className="supplier-active-transfer-select">
                  <span className="supplier-transfer-registry-icon otc-registry-icon"><ReceiptText size={18} /></span>
                  <span className="supplier-transfer-registry-copy">
                    <strong>{order.orderNumber}</strong>
                    <em>{order.customerNames.join(', ') || 'Client not specified'}</em>
                    <small>{order.quantity.toLocaleString()} pieces · {order.voucherNumbers.join(', ') || 'No voucher'}</small>
                  </span>
                </span>
                <div className="supplier-transfer-registry-meta">
                  <span className="otc-registry-date"><CalendarDays size={14} /> {formatDate(order.receivedAt)}</span>
                  <span className={`otc-status ${order.status}`}>{statusLabel[order.status]}</span>
                </div>
                {order.isLegacy ? <span className="otc-legacy-tag" title={legacyNotice}><History size={13} /> Processed before OTC</span> : null}
                <ol className="otc-mini-progress" aria-label={`${statusStep[order.status]} of 4 steps complete`}>
                  {steps.map((step, index) => <li className={index < statusStep[order.status] ? 'done' : ''} key={step} title={step} />)}
                </ol>
              </article>
            ))}
            {!orders.length && loading ? <div className="supplier-empty-note">Loading Order-to-Cash records...</div> : null}
            {!orders.length && !loading ? <div className="supplier-empty-note">Production orders appear here as soon as they are assigned to a customer reception.</div> : null}
            {orders.length > 0 && !filteredOrders.length ? <div className="supplier-empty-note">No production orders match these filters.</div> : null}
          </div>
        </section>

        <section className="supplier-transfer-combined-panel">
          {selected ? (
            <div className="supplier-selected-transfer-summary">
              <div className="supplier-transfer-detail-hero otc-detail-hero">
                <span className="supplier-transfer-detail-icon"><ReceiptText size={24} /></span>
                <div><small>Order-to-Cash</small><h3>{selected.orderNumber}</h3><p>{[selected.partNumber, selected.partName].filter(Boolean).join(' · ') || 'Part not specified'} · {selected.quantity.toLocaleString()} pieces</p></div>
                <div className="otc-hero-controls">
                  {selected.isRework ? <span className="otc-rework-tag">Rework</span> : null}
                  {selected.isLegacy ? <span className="otc-legacy-tag"><History size={13} /> Pre-OTC</span> : null}
                  <span className={`otc-status ${selected.status}`}>{statusLabel[selected.status]}</span>
                </div>
              </div>
              <ol className={`supplier-transfer-progress otc-progress${selected.status === 'completed' ? ' completed' : ''}`}>
                {steps.map((step, index) => {
                  const currentStep = statusStep[selected.status];
                  const isCompleted = index < currentStep;
                  return <li className={`${isCompleted ? 'complete' : ''} ${index === currentStep ? 'current' : ''}`} key={step}><span>{isCompleted ? <Check size={15} /> : index + 1}</span><strong>{step}</strong></li>;
                })}
              </ol>
              {selected.isLegacy ? <div className="otc-legacy-notice" role="note"><History size={18} /><span><strong>Processed before OTC</strong>{legacyNotice}</span></div> : null}
              <div className="supplier-selected-transfer-grid otc-identification">
                <span><b>Production Order</b>{selected.orderNumber}<small>{formatProductionStatus(selected.productionStatus)} · Created {formatDate(selected.orderCreatedAt)}</small></span>
                <span><b>Client</b>{selected.customerNames.join(', ') || 'Not specified'}</span>
                <span><b>Reception Voucher</b>{selected.voucherNumbers.join(', ') || 'Not specified'}</span>
                <span><b>Reception Date</b>{formatDate(selected.receivedAt)}</span>
                <span className={`otc-status-box ${selected.status}`}><b>Status</b>{statusLabel[selected.status]}{selected.isLegacy ? <small>Processed before OTC</small> : null}</span>
              </div>
              <section className="otc-documents" aria-label="Administrative documents">
                {documentStages.map((entry, index) => {
                  const linkedDocument = selected.documents[entry.stage];
                  const required = previousStage(entry.stage);
                  const locked = Boolean(required && !selected.documents[required]);
                  const notRequired = !linkedDocument && selected.isLegacy;
                  const picking = !notRequired && !locked && (!linkedDocument || changingStage === entry.stage);
                  return (
                    <article className={`otc-document-card ${linkedDocument ? 'linked' : notRequired ? 'legacy' : locked ? 'locked' : 'pending'}`} key={entry.stage}>
                      <header>
                        <span className="otc-document-step">{linkedDocument || notRequired ? <Check size={15} /> : index + 2}</span>
                        <div><small>Step {index + 2}</small><strong>{entry.label}</strong></div>
                        <em>{linkedDocument ? 'Linked' : notRequired ? 'Not required' : locked ? 'Locked' : 'Pending'}</em>
                      </header>
                      {picking ? (
                        <>
                          <p className="otc-document-hint">{entry.description}</p>
                          {renderRegistryPicker(selected, entry.stage)}
                          {linkingStage === entry.stage ? <p className="otc-document-hint">Linking {entry.label.toLowerCase()}...</p> : null}
                          {linkError?.stage === entry.stage ? <div className="otc-feedback error" role="alert">{linkError.message}</div> : null}
                          {linkedDocument ? <footer><button type="button" onClick={() => { setChangingStage(null); setLinkError(null); }} disabled={Boolean(linkingStage)}>Cancel</button></footer> : null}
                        </>
                      ) : linkedDocument ? (
                        <>
                          <div className="otc-document-folio"><small>{entry.folioLabel}</small><strong>{linkedDocument.folio}</strong>{linkedDocument.registryId ? <em className="otc-po-registry-tag"><FileCheck2 size={12} /> {entry.label}s registry</em> : null}</div>
                          <button type="button" className="otc-document-file" onClick={() => void openPreview(linkedDocument)} title={`View ${linkedDocument.fileName}`}>
                            {isPdfFile(linkedDocument) ? <FileText size={18} /> : <ImagePlus size={18} />}
                            <span><strong>{linkedDocument.fileName}</strong><small>Uploaded {formatTimestamp(linkedDocument.uploadedAt)}</small></span>
                          </button>
                          <footer>
                            <button type="button" className="primary" onClick={() => void openPreview(linkedDocument)}><Eye size={15} /> View document</button>
                            <button type="button" onClick={() => { setChangingStage(entry.stage); setLinkError(null); }}><RefreshCw size={15} /> Change {entry.stage === 'purchase-order' ? 'PO' : entry.label.toLowerCase()}</button>
                          </footer>
                        </>
                      ) : notRequired ? (
                        <p className="otc-document-hint"><History size={15} /> Processed before OTC. No {entry.label.toLowerCase()} is required in the system.</p>
                      ) : (
                        <p className="otc-document-hint"><LockKeyhole size={15} /> Link the {stageLabel(required as DocumentStage).toLowerCase()} first.</p>
                      )}
                    </article>
                  );
                })}
              </section>
            </div>
          ) : (
            <div className="otc-empty">
              <FileCheck2 size={30} />
              <h2>{loading ? 'Loading Order-to-Cash' : 'No production order selected'}</h2>
              <p>Assign a production order to a customer reception to start its Order-to-Cash trail.</p>
              <button type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes/clients/receptions')}><Truck size={15} /> Go to Receptions</button>
            </div>
          )}
        </section>
      </div>

      {preview ? <DocumentPreviewModal subtitle={preview.subtitle} title={preview.title} url={preview.url} isPdf={preview.isPdf} onClose={() => setPreview(null)} /> : null}
    </section>
  );
}
