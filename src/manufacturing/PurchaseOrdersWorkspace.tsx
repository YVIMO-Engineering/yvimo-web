import React from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, ArrowLeft, CalendarDays, Check, Download, FileText, Maximize2, Pencil, Plus, RefreshCw, Search, ShoppingCart, Trash2, Upload, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import './orderToCash.css';

type PoStatus = 'active' | 'closed';
type Currency = 'USD' | 'MXN' | 'EUR';

type PoItem = {
  id: string;
  lineNumber: number;
  description: string;
  toolIds: string[];
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

type PurchaseOrder = {
  id: string;
  customerId: string;
  customerName: string;
  poReference: string;
  revisionNumber: number;
  poDate: string;
  expirationDate: string;
  currency: Currency;
  buyerName: string;
  buyerEmail: string;
  requisitionNumber: string;
  paymentTerms: string;
  notes: string;
  status: PoStatus;
  closedAt: string;
  fileName: string;
  filePath: string;
  fileType: string;
  createdAt: string;
  items: PoItem[];
  total: number;
  productionOrders: string[];
};

type PurchaseOrderRow = {
  id: string;
  customer_id: string;
  po_reference: string;
  revision_number: number;
  po_date: string;
  expiration_date: string | null;
  currency: Currency;
  buyer_name: string;
  buyer_email: string;
  requisition_number: string;
  payment_terms: string;
  notes: string;
  status: PoStatus;
  closed_at: string | null;
  file_name: string;
  file_path: string;
  file_type: string;
  created_at: string;
  customer: { customer_name: string } | Array<{ customer_name: string }> | null;
};

type ItemRow = {
  id: string;
  purchase_order_id: string;
  line_number: number;
  description: string;
  tool_ids: string[] | null;
  quantity: number | string;
  unit_price: number | string;
  subtotal: number | string;
};

type LinkedOrderRow = {
  purchase_order_id: string;
  production_order: { order_number: string } | Array<{ order_number: string }> | null;
};

type Customer = { id: string; name: string; paymentTerms: string };

type FormItem = { key: string; description: string; toolIds: string[]; toolDraft: string; quantity: string; unitPrice: string };

type PoForm = {
  customerId: string;
  poReference: string;
  revisionNumber: string;
  poDate: string;
  expirationDate: string;
  currency: Currency;
  buyerName: string;
  buyerEmail: string;
  requisitionNumber: string;
  paymentTerms: string;
  notes: string;
  items: FormItem[];
};

type Viewer = { purchaseOrderId: string; filePath: string; url: string };

type Props = {
  organizationId: string;
  onNavigate: (path: string) => void;
};

const documentsBucket = 'mes-order-to-cash-documents';
const documentAccept = 'application/pdf,.pdf,image/*';
const documentExtensions = /\.(?:pdf|jpe?g|png|webp|heic|heif|avif)$/i;
const documentMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']);
const currencies: Currency[] = ['USD', 'MXN', 'EUR'];
const rowPageSize = 1000;
const signedUrlSeconds = 60 * 60;
const tabs: Array<{ value: PoStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];

function single<Row>(value: Row | Row[] | null): Row | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isPdfFile(file: { fileType: string; fileName: string }) {
  return file.fileType === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf');
}

function getDocumentMimeType(file: File) {
  if (file.type && file.type !== 'application/octet-stream') return file.type.toLowerCase();
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return extension ? `image/${extension}` : 'image/jpeg';
}

// PO dates are calendar days; parsing them as local dates keeps them from shifting a day.
function formatDate(value: string) {
  if (!value) return 'Not specified';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMoney(value: number, currency: Currency) {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatQuantity(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function parseNumber(value: string) {
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

function splitToolIds(value: string) {
  return value.split(/[\s,;]+/).map((entry) => entry.trim()).filter(Boolean);
}

function hasToolId(list: string[], toolId: string) {
  return list.some((entry) => entry.toLowerCase() === toolId.toLowerCase());
}

function newFormItem(): FormItem {
  return { key: crypto.randomUUID(), description: '', toolIds: [], toolDraft: '', quantity: '1', unitPrice: '' };
}

function emptyForm(): PoForm {
  return { customerId: '', poReference: '', revisionNumber: '0', poDate: todayIso(), expirationDate: '', currency: 'USD', buyerName: '', buyerEmail: '', requisitionNumber: '', paymentTerms: '', notes: '', items: [newFormItem()] };
}

function formFromPurchaseOrder(order: PurchaseOrder): PoForm {
  return {
    customerId: order.customerId,
    poReference: order.poReference,
    revisionNumber: String(order.revisionNumber),
    poDate: order.poDate,
    expirationDate: order.expirationDate,
    currency: order.currency,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    requisitionNumber: order.requisitionNumber,
    paymentTerms: order.paymentTerms,
    notes: order.notes,
    items: order.items.map((item) => ({ key: item.id, description: item.description, toolIds: [...item.toolIds], toolDraft: '', quantity: String(item.quantity), unitPrice: String(item.unitPrice) })),
  };
}

// Tool IDs still typed in the draft box count as entered, so the user does not lose them by
// saving without pressing Enter first.
function itemToolIds(item: FormItem) {
  return splitToolIds(item.toolDraft).reduce((list, toolId) => (hasToolId(list, toolId) ? list : [...list, toolId]), item.toolIds);
}

function itemSubtotal(item: FormItem) {
  const quantity = parseNumber(item.quantity);
  const unitPrice = parseNumber(item.unitPrice);
  return Number.isFinite(quantity) && Number.isFinite(unitPrice) ? Math.round(quantity * unitPrice * 100) / 100 : 0;
}

async function fetchAllRows<Row>(request: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>) {
  const rows: Row[] = [];
  for (let from = 0; ; from += rowPageSize) {
    const { data, error } = await request(from, from + rowPageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < rowPageSize) return rows;
  }
}

function DocumentFrame({ url, title, isPdf }: { url: string; title: string; isPdf: boolean }) {
  return isPdf
    ? <iframe src={`${url}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`} title={title} />
    : <img src={url} alt={title} draggable={false} />;
}

export function PurchaseOrdersWorkspace({ organizationId, onNavigate }: Props) {
  const [orders, setOrders] = React.useState<PurchaseOrder[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [catalogToolIds, setCatalogToolIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [selectedId, setSelectedId] = React.useState('');
  const [tab, setTab] = React.useState<PoStatus>('active');
  const [customerFilter, setCustomerFilter] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [viewer, setViewer] = React.useState<Viewer | null>(null);
  const [viewerError, setViewerError] = React.useState('');
  const [expanded, setExpanded] = React.useState(false);
  const [statusSaving, setStatusSaving] = React.useState(false);
  const [editing, setEditing] = React.useState<PurchaseOrder | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<PoForm>(emptyForm);
  const [formFile, setFormFile] = React.useState<File | null>(null);
  const [formFileUrl, setFormFileUrl] = React.useState('');
  const [formError, setFormError] = React.useState('');
  const [formSaving, setFormSaving] = React.useState(false);

  const loadOrders = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [orderRows, itemRows, linkedRows, customerResult, toolResult] = await Promise.all([
        fetchAllRows<PurchaseOrderRow>((from, to) => supabase
          .from('mes_customer_purchase_orders')
          .select('id, customer_id, po_reference, revision_number, po_date, expiration_date, currency, buyer_name, buyer_email, requisition_number, payment_terms, notes, status, closed_at, file_name, file_path, file_type, created_at, customer:mes_customers!customer_id(customer_name)')
          .eq('organization_id', organizationId)
          .order('po_date', { ascending: false })
          .order('id')
          .range(from, to)),
        fetchAllRows<ItemRow>((from, to) => supabase
          .from('mes_customer_purchase_order_items')
          .select('id, purchase_order_id, line_number, description, tool_ids, quantity, unit_price, subtotal')
          .eq('organization_id', organizationId)
          .order('purchase_order_id')
          .order('line_number')
          .range(from, to)),
        fetchAllRows<LinkedOrderRow>((from, to) => supabase
          .from('mes_order_to_cash_documents')
          .select('purchase_order_id, production_order:mes_production_orders!production_order_id(order_number)')
          .eq('organization_id', organizationId)
          .not('purchase_order_id', 'is', null)
          .order('id')
          .range(from, to)),
        supabase.from('mes_customers').select('id, customer_name, payment_terms, status').eq('organization_id', organizationId).order('customer_name'),
        supabase.from('mes_customer_tool_ids').select('tool_id').eq('organization_id', organizationId).order('tool_id'),
      ]);
      if (customerResult.error) throw new Error(customerResult.error.message);
      const itemsByOrder = new Map<string, PoItem[]>();
      itemRows.forEach((row) => {
        const items = itemsByOrder.get(row.purchase_order_id) ?? [];
        items.push({ id: row.id, lineNumber: row.line_number, description: row.description, toolIds: row.tool_ids ?? [], quantity: Number(row.quantity) || 0, unitPrice: Number(row.unit_price) || 0, subtotal: Number(row.subtotal) || 0 });
        itemsByOrder.set(row.purchase_order_id, items);
      });
      const productionOrdersByPo = new Map<string, string[]>();
      linkedRows.forEach((row) => {
        const orderNumber = single(row.production_order)?.order_number;
        if (!orderNumber) return;
        productionOrdersByPo.set(row.purchase_order_id, [...(productionOrdersByPo.get(row.purchase_order_id) ?? []), orderNumber]);
      });
      const nextOrders = orderRows.map((row): PurchaseOrder => {
        const items = itemsByOrder.get(row.id) ?? [];
        return {
          id: row.id,
          customerId: row.customer_id,
          customerName: single(row.customer)?.customer_name ?? 'Unknown client',
          poReference: row.po_reference,
          revisionNumber: row.revision_number,
          poDate: row.po_date,
          expirationDate: row.expiration_date ?? '',
          currency: row.currency,
          buyerName: row.buyer_name,
          buyerEmail: row.buyer_email,
          requisitionNumber: row.requisition_number,
          paymentTerms: row.payment_terms,
          notes: row.notes,
          status: row.status,
          closedAt: row.closed_at ?? '',
          fileName: row.file_name,
          filePath: row.file_path,
          fileType: row.file_type,
          createdAt: row.created_at,
          items,
          total: Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100,
          productionOrders: (productionOrdersByPo.get(row.id) ?? []).sort((left, right) => right.localeCompare(left, undefined, { numeric: true })),
        };
      });
      setOrders(nextOrders);
      // Inactive clients stay listed only when a PO already points at them, so old POs remain editable.
      setCustomers((customerResult.data ?? [])
        .filter((customer) => customer.status === 'active' || nextOrders.some((order) => order.customerId === customer.id))
        .map((customer) => ({ id: String(customer.id), name: String(customer.customer_name), paymentTerms: String(customer.payment_terms ?? '') })));
      // The Tool ID catalog only feeds suggestions; a PO may cover Tool IDs not registered yet.
      setCatalogToolIds(toolResult.error ? [] : (toolResult.data ?? []).map((tool) => String(tool.tool_id)));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load purchase orders.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const realtimeTables = React.useMemo(() => ([
    { table: 'mes_customer_purchase_orders', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_purchase_order_items', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_order_to_cash_documents', filter: `organization_id=eq.${organizationId}` },
  ]), [organizationId]);

  useSupabaseRealtimeRefresh({
    channelName: `mes-purchase-orders-live:${organizationId}`,
    tables: realtimeTables,
    onRefresh: loadOrders,
    enabled: Boolean(organizationId),
    debounceMs: 400,
  });

  const counts = React.useMemo(() => {
    const result: Record<PoStatus, number> = { active: 0, closed: 0 };
    orders.forEach((order) => {
      if (!customerFilter || order.customerId === customerFilter) result[order.status] += 1;
    });
    return result;
  }, [orders, customerFilter]);

  const filteredOrders = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (order.status !== tab) return false;
      if (customerFilter && order.customerId !== customerFilter) return false;
      if (!query) return true;
      return [order.poReference, order.customerName, order.requisitionNumber, order.buyerName, ...order.items.flatMap((item) => [item.description, ...item.toolIds])]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [orders, tab, customerFilter, search]);

  // Keep the selection inside the visible tab so the detail never shows a PO the list hides.
  React.useEffect(() => {
    setSelectedId((current) => (filteredOrders.some((order) => order.id === current) ? current : filteredOrders[0]?.id ?? ''));
  }, [filteredOrders]);

  const selected = orders.find((order) => order.id === selectedId) ?? null;

  React.useEffect(() => {
    if (!selected) {
      setViewer(null);
      return;
    }
    if (viewer?.purchaseOrderId === selected.id && viewer.filePath === selected.filePath) return;
    let cancelled = false;
    setViewerError('');
    void supabase.storage.from(documentsBucket).createSignedUrl(selected.filePath, signedUrlSeconds).then(({ data, error: signedUrlError }) => {
      if (cancelled) return;
      if (signedUrlError || !data?.signedUrl) {
        setViewer(null);
        setViewerError(signedUrlError?.message || 'This document could not be opened.');
        return;
      }
      setViewer({ purchaseOrderId: selected.id, filePath: selected.filePath, url: data.signedUrl });
    });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.filePath]);

  React.useEffect(() => {
    if (!formFile) {
      setFormFileUrl('');
      return;
    }
    const url = URL.createObjectURL(formFile);
    setFormFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [formFile]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm(), customerId: customerFilter, paymentTerms: customers.find((customer) => customer.id === customerFilter)?.paymentTerms ?? '' });
    setFormFile(null);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (order: PurchaseOrder) => {
    setEditing(order);
    setForm(formFromPurchaseOrder(order));
    setFormFile(null);
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    if (formSaving) return;
    setFormOpen(false);
    setFormFile(null);
  };

  const updateForm = <Key extends keyof PoForm>(key: Key, value: PoForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormError('');
  };

  const selectCustomer = (customerId: string) => {
    const customer = customers.find((entry) => entry.id === customerId);
    // Default the PO's payment terms to the client's agreed terms unless the user already typed some.
    setForm((current) => ({ ...current, customerId, paymentTerms: current.paymentTerms || customer?.paymentTerms || '' }));
    setFormError('');
  };

  const updateItem = (key: string, patch: Partial<FormItem>) => {
    setForm((current) => ({ ...current, items: current.items.map((item) => (item.key === key ? { ...item, ...patch } : item)) }));
    setFormError('');
  };

  const commitToolDraft = (key: string) => {
    setForm((current) => ({ ...current, items: current.items.map((item) => (item.key === key ? { ...item, toolIds: itemToolIds(item), toolDraft: '' } : item)) }));
  };

  const removeToolId = (key: string, toolId: string) => {
    setForm((current) => ({ ...current, items: current.items.map((item) => (item.key === key ? { ...item, toolIds: item.toolIds.filter((entry) => entry !== toolId) } : item)) }));
  };

  const removeItem = (key: string) => {
    setForm((current) => ({ ...current, items: current.items.length > 1 ? current.items.filter((item) => item.key !== key) : current.items }));
  };

  const formTotal = form.items.reduce((sum, item) => sum + itemSubtotal(item), 0);
  const formPreviewUrl = formFileUrl || (editing && viewer?.purchaseOrderId === editing.id ? viewer.url : '');
  const formPreviewIsPdf = formFile ? getDocumentMimeType(formFile) === 'application/pdf' : editing ? isPdfFile(editing) : false;
  const catalogLookup = React.useMemo(() => new Set(catalogToolIds.map((toolId) => toolId.toLowerCase())), [catalogToolIds]);

  const savePurchaseOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (formSaving) return;
    const poReference = form.poReference.trim();
    const revisionNumber = Number(form.revisionNumber || 0);
    if (!form.customerId) return setFormError('Select the client.');
    if (!poReference) return setFormError('Enter the PO reference.');
    if (!Number.isInteger(revisionNumber) || revisionNumber < 0) return setFormError('The revision must be a whole number.');
    if (!form.poDate) return setFormError('Enter the PO date.');
    if (form.expirationDate && form.expirationDate < form.poDate) return setFormError('The expiration date cannot be before the PO date.');
    const duplicate = orders.find((order) => order.id !== editing?.id && order.customerId === form.customerId && order.poReference.toLowerCase() === poReference.toLowerCase());
    if (duplicate) return setFormError(`This client already has a PO with reference ${duplicate.poReference}.`);
    const items = form.items.map((item) => ({ description: item.description.trim(), tool_ids: itemToolIds(item), quantity: parseNumber(item.quantity), unit_price: parseNumber(item.unitPrice) }));
    for (const [index, item] of items.entries()) {
      if (!item.description && !item.tool_ids.length) return setFormError(`Item ${index + 1} needs a description or at least one Tool ID.`);
      if (!(item.quantity > 0)) return setFormError(`Item ${index + 1} needs a quantity greater than zero.`);
      if (!(item.unit_price >= 0)) return setFormError(`Item ${index + 1} needs a valid unit price.`);
    }
    if (!formFile && !editing) return setFormError('Attach the purchase order file.');
    if (formFile && !documentExtensions.test(formFile.name) && !documentMimeTypes.has(formFile.type.toLowerCase())) return setFormError('The purchase order file must be a PDF or a photo.');

    setFormSaving(true);
    setFormError('');
    const purchaseOrderId = editing?.id ?? crypto.randomUUID();
    let uploadedPath = '';
    try {
      let file = editing ? { name: editing.fileName, path: editing.filePath, type: editing.fileType } : null;
      if (formFile) {
        const safeFileName = formFile.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        uploadedPath = `${organizationId}/purchase-orders/${purchaseOrderId}/${Date.now()}-${safeFileName}`;
        const fileType = getDocumentMimeType(formFile);
        const { error: uploadError } = await supabase.storage.from(documentsBucket).upload(uploadedPath, formFile, { contentType: fileType });
        if (uploadError) throw uploadError;
        file = { name: formFile.name, path: uploadedPath, type: fileType };
      }
      if (!file) throw new Error('Attach the purchase order file.');
      const { error: saveError } = await supabase.rpc('save_mes_customer_purchase_order', {
        p_organization_id: organizationId,
        p_purchase_order_id: editing?.id ?? null,
        p_purchase_order: {
          id: purchaseOrderId,
          customer_id: form.customerId,
          po_reference: poReference,
          revision_number: revisionNumber,
          po_date: form.poDate,
          expiration_date: form.expirationDate,
          currency: form.currency,
          buyer_name: form.buyerName.trim(),
          buyer_email: form.buyerEmail.trim(),
          requisition_number: form.requisitionNumber.trim(),
          payment_terms: form.paymentTerms.trim(),
          notes: form.notes.trim(),
          file_name: file.name,
          file_path: file.path,
          file_type: file.type,
        },
        p_items: items,
      });
      if (saveError) throw saveError;
      if (editing && uploadedPath && editing.filePath !== uploadedPath) {
        await supabase.storage.from(documentsBucket).remove([editing.filePath]);
      }
      setFormOpen(false);
      setFormFile(null);
      setTab(editing?.status ?? 'active');
      setSearch('');
      if (customerFilter && customerFilter !== form.customerId) setCustomerFilter('');
      await loadOrders();
      setSelectedId(purchaseOrderId);
    } catch (saveError) {
      if (uploadedPath) await supabase.storage.from(documentsBucket).remove([uploadedPath]);
      console.error('Unable to save purchase order', saveError);
      const message = saveError instanceof Error ? saveError.message : typeof saveError === 'object' && saveError && 'message' in saveError ? String(saveError.message) : 'Unable to save the purchase order.';
      setFormError(message.includes('mes_customer_purchase_orders_reference_uidx') ? 'This client already has a PO with that reference.' : message);
    } finally {
      setFormSaving(false);
    }
  };

  const toggleStatus = async (order: PurchaseOrder) => {
    if (statusSaving) return;
    const nextStatus: PoStatus = order.status === 'active' ? 'closed' : 'active';
    setStatusSaving(true);
    const { error: statusError } = await supabase.from('mes_customer_purchase_orders').update({ status: nextStatus }).eq('id', order.id).eq('organization_id', organizationId);
    setStatusSaving(false);
    if (statusError) {
      setError(statusError.message);
      return;
    }
    setTab(nextStatus);
    await loadOrders();
    setSelectedId(order.id);
  };

  const selectedToolCount = selected ? new Set(selected.items.flatMap((item) => item.toolIds.map((toolId) => toolId.toLowerCase()))).size : 0;
  const selectedQuantity = selected ? selected.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

  return (
    <section className="mes-workspace-panel otc-workspace">
      <header className="otc-compact-header">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/intelligence')}><ArrowLeft size={16} /> Ops Intelligence</button>
        <div>
          <p className="eyebrow">OPS INTELLIGENCE / OTC</p>
          <h1>Purchase Orders</h1>
          <span>Registry of customer purchase orders, their items and the Tool IDs they cover</span>
        </div>
        <div className="otc-header-actions">
          <button className="otc-refresh" type="button" onClick={() => void loadOrders()} disabled={loading}><RefreshCw size={15} className={loading ? 'spinning' : ''} /> Refresh</button>
          <button className="otc-primary-action" type="button" onClick={openCreate} disabled={!customers.length}><Plus size={15} /> New Purchase Order</button>
        </div>
      </header>

      {error ? <div className="otc-feedback error" role="alert">{error}</div> : null}

      <div className="otc-toolbar">
        <div className="otc-filter-chips" role="tablist" aria-label="Purchase order status">
          {tabs.map((entry) => (
            <button type="button" role="tab" aria-selected={tab === entry.value} className={tab === entry.value ? 'active' : ''} onClick={() => setTab(entry.value)} key={entry.value}>
              <span>{entry.label}</span><strong>{counts[entry.value]}</strong>
            </button>
          ))}
        </div>
        <div className="otc-toolbar-filters">
          <label className="otc-search otc-select">
            <Users size={16} />
            <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} aria-label="Filter by client">
              <option value="">All clients</option>
              {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <label className="otc-search">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="PO reference, Tool ID or requisition" aria-label="Search purchase orders" />
          </label>
        </div>
      </div>

      <div className="supplier-transfer-registry-layout otc-layout">
        <section className="supplier-active-transfers">
          <div><span><ShoppingCart size={16} /> PO Registry</span><strong>{filteredOrders.length} shown</strong></div>
          <div className="supplier-active-transfer-list">
            {filteredOrders.map((order) => (
              <article
                className={order.id === selectedId ? 'active' : ''}
                key={order.id}
                role="button"
                tabIndex={0}
                aria-pressed={order.id === selectedId}
                onClick={() => setSelectedId(order.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(order.id);
                  }
                }}
              >
                <span className="supplier-active-transfer-select">
                  <span className="supplier-transfer-registry-icon otc-registry-icon"><ShoppingCart size={18} /></span>
                  <span className="supplier-transfer-registry-copy">
                    <strong>{order.poReference}{order.revisionNumber ? ` · Rev ${order.revisionNumber}` : ''}</strong>
                    <em>{order.customerName}</em>
                    <small>{order.items.length} {order.items.length === 1 ? 'item' : 'items'} · {formatMoney(order.total, order.currency)}</small>
                  </span>
                </span>
                <div className="supplier-transfer-registry-meta">
                  <span className="otc-registry-date"><CalendarDays size={14} /> {formatDate(order.poDate)}</span>
                  <span className={`otc-status po-${order.status}`}>{order.status === 'active' ? 'Active' : 'Closed'}</span>
                </div>
              </article>
            ))}
            {!orders.length && loading ? <div className="supplier-empty-note">Loading purchase orders...</div> : null}
            {!orders.length && !loading ? <div className="supplier-empty-note">No purchase orders registered yet. Use New Purchase Order to add the first one.</div> : null}
            {orders.length > 0 && !filteredOrders.length ? <div className="supplier-empty-note">{tab === 'active' ? 'No active purchase orders match these filters.' : 'No closed purchase orders match these filters.'}</div> : null}
          </div>
        </section>

        <section className="supplier-transfer-combined-panel">
          {selected ? (
            <div className="supplier-selected-transfer-summary">
              <div className="supplier-transfer-detail-hero otc-detail-hero">
                <span className="supplier-transfer-detail-icon"><ShoppingCart size={24} /></span>
                <div><small>Purchase Order</small><h3>{selected.poReference}</h3><p>{selected.customerName} · {selected.items.length} {selected.items.length === 1 ? 'item' : 'items'} · {formatMoney(selected.total, selected.currency)}</p></div>
                <div className="otc-hero-controls">
                  <span className={`otc-status po-${selected.status}`}>{selected.status === 'active' ? 'Active' : 'Closed'}</span>
                </div>
              </div>
              <div className="otc-po-actions">
                <button type="button" onClick={() => openEdit(selected)}><Pencil size={15} /> Edit</button>
                <button type="button" onClick={() => void toggleStatus(selected)} disabled={statusSaving}>
                  {selected.status === 'active' ? <><Archive size={15} /> Close PO</> : <><ArchiveRestore size={15} /> Reopen PO</>}
                </button>
              </div>
              <div className="supplier-selected-transfer-grid otc-identification">
                <span><b>PO Reference</b>{selected.poReference}<small>Revision {selected.revisionNumber}</small></span>
                <span><b>Client</b>{selected.customerName}</span>
                <span><b>PO Date</b>{formatDate(selected.poDate)}{selected.expirationDate ? <small>Expires {formatDate(selected.expirationDate)}</small> : null}</span>
                <span><b>Buyer</b>{selected.buyerName || 'Not specified'}{selected.buyerEmail ? <small>{selected.buyerEmail}</small> : null}</span>
                <span className="otc-status-box po-total"><b>Total</b>{formatMoney(selected.total, selected.currency)}{selected.status === 'closed' && selected.closedAt ? <small>Closed {formatDate(selected.closedAt)}</small> : null}</span>
              </div>
              <div className="otc-po-facts">
                <span><b>Requisition</b>{selected.requisitionNumber || '—'}</span>
                <span><b>Payment terms</b>{selected.paymentTerms || '—'}</span>
                <span><b>Pieces</b>{formatQuantity(selectedQuantity)}</span>
                <span><b>Tool IDs covered</b>{selectedToolCount}</span>
              </div>
              <div className="otc-po-linked-orders">
                <b>Production orders covered</b>
                {selected.productionOrders.length
                  ? <span className="otc-tool-chips">{selected.productionOrders.map((orderNumber) => <em key={orderNumber}>{orderNumber}</em>)}</span>
                  : <small>Not linked to any production order yet. Link it from step 2 of Order-to-Cash.</small>}
              </div>
              {selected.notes ? <p className="otc-po-notes">{selected.notes}</p> : null}

              <div className="otc-po-body">
                <section className="otc-po-items" aria-label="Purchase order items">
                  <header><strong>Items</strong><span>{selected.items.length}</span></header>
                  <div className="otc-po-table-wrap">
                    <table>
                      <thead>
                        <tr><th>#</th><th>Item</th><th className="numeric">Qty</th><th className="numeric">Unit price</th><th className="numeric">Subtotal</th></tr>
                      </thead>
                      <tbody>
                        {selected.items.map((item) => (
                          <tr key={item.id}>
                            <td>{item.lineNumber}</td>
                            <td>
                              {item.description ? <strong>{item.description}</strong> : null}
                              {item.toolIds.length ? <span className="otc-tool-chips">{item.toolIds.map((toolId) => <em key={toolId}>{toolId}</em>)}</span> : null}
                            </td>
                            <td className="numeric">{formatQuantity(item.quantity)}</td>
                            <td className="numeric">{formatMoney(item.unitPrice, selected.currency)}</td>
                            <td className="numeric"><strong>{formatMoney(item.subtotal, selected.currency)}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr><td colSpan={4}>Total</td><td className="numeric">{formatMoney(selected.total, selected.currency)}</td></tr>
                      </tfoot>
                    </table>
                  </div>
                </section>

                <section className="otc-po-viewer" aria-label="Purchase order document">
                  <header>
                    <FileText size={16} />
                    <span><strong title={selected.fileName}>{selected.fileName}</strong><small>Customer PO document</small></span>
                    {viewer ? (
                      <>
                        <button type="button" onClick={() => setExpanded(true)} aria-label="Expand document"><Maximize2 size={15} /></button>
                        <a href={viewer.url} target="_blank" rel="noreferrer" aria-label="Open in new tab"><Download size={15} /></a>
                      </>
                    ) : null}
                  </header>
                  <div className={`otc-po-viewer-frame ${isPdfFile(selected) ? 'pdf' : 'image'}`}>
                    {viewer?.purchaseOrderId === selected.id
                      ? <DocumentFrame url={viewer.url} title={`Preview ${selected.fileName}`} isPdf={isPdfFile(selected)} />
                      : <p>{viewerError || 'Loading document...'}</p>}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="otc-empty">
              <ShoppingCart size={30} />
              <h2>{loading ? 'Loading purchase orders' : tab === 'active' ? 'No active purchase order selected' : 'No closed purchase order selected'}</h2>
              <p>{customers.length ? 'Register each customer purchase order with its items, the Tool IDs they cover and the PO file.' : 'Register a client in the Clients module before adding purchase orders.'}</p>
              {customers.length
                ? <button type="button" onClick={openCreate}><Plus size={15} /> New Purchase Order</button>
                : <button type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes/clients')}><Users size={15} /> Go to Clients</button>}
            </div>
          )}
        </section>
      </div>

      {formOpen ? createPortal((
        <div className="mes-modal-backdrop otc-modal-backdrop otc-po-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
          <section className="mes-order-modal otc-link-modal otc-po-modal" role="dialog" aria-modal="true" aria-labelledby="otc-po-form-title">
            <button className="supplier-modal-close" type="button" onClick={closeForm} disabled={formSaving} aria-label="Close"><X size={18} /></button>
            <form onSubmit={savePurchaseOrder}>
              <div className="otc-po-form-head">
                <span className="otc-link-icon"><ShoppingCart size={24} /></span>
                <div>
                  <p className="eyebrow">OTC / Purchase Orders</p>
                  <h3 id="otc-po-form-title">{editing ? `Edit PO ${editing.poReference}` : 'New Purchase Order'}</h3>
                </div>
              </div>
              <div className="otc-po-form-layout">
                <div className="otc-po-form-fields">
                  <fieldset>
                    <legend>Identification</legend>
                    <div className="otc-po-form-grid">
                      <label className="otc-link-field wide">
                        <span>Client <b>*</b></span>
                        <select value={form.customerId} onChange={(event) => selectCustomer(event.target.value)} disabled={formSaving}>
                          <option value="">Select a client</option>
                          {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
                        </select>
                      </label>
                      <label className="otc-link-field">
                        <span>PO reference <b>*</b></span>
                        <input value={form.poReference} onChange={(event) => updateForm('poReference', event.target.value)} placeholder="D1008052" disabled={formSaving} />
                      </label>
                      <label className="otc-link-field">
                        <span>Revision</span>
                        <input type="number" min={0} step={1} value={form.revisionNumber} onChange={(event) => updateForm('revisionNumber', event.target.value)} disabled={formSaving} />
                      </label>
                      <label className="otc-link-field">
                        <span>PO date <b>*</b></span>
                        <input type="date" value={form.poDate} onChange={(event) => updateForm('poDate', event.target.value)} disabled={formSaving} />
                      </label>
                      <label className="otc-link-field">
                        <span>Expiration date</span>
                        <input type="date" value={form.expirationDate} min={form.poDate || undefined} onChange={(event) => updateForm('expirationDate', event.target.value)} disabled={formSaving} />
                      </label>
                      <label className="otc-link-field">
                        <span>Currency <b>*</b></span>
                        <select value={form.currency} onChange={(event) => updateForm('currency', event.target.value as Currency)} disabled={formSaving}>
                          {currencies.map((currency) => <option value={currency} key={currency}>{currency}</option>)}
                        </select>
                      </label>
                      <label className="otc-link-field">
                        <span>Requisition number</span>
                        <input value={form.requisitionNumber} onChange={(event) => updateForm('requisitionNumber', event.target.value)} disabled={formSaving} />
                      </label>
                      <label className="otc-link-field">
                        <span>Buyer name</span>
                        <input value={form.buyerName} onChange={(event) => updateForm('buyerName', event.target.value)} disabled={formSaving} />
                      </label>
                      <label className="otc-link-field">
                        <span>Buyer email</span>
                        <input type="email" value={form.buyerEmail} onChange={(event) => updateForm('buyerEmail', event.target.value)} disabled={formSaving} />
                      </label>
                      <label className="otc-link-field">
                        <span>Payment terms</span>
                        <input value={form.paymentTerms} onChange={(event) => updateForm('paymentTerms', event.target.value)} disabled={formSaving} />
                      </label>
                      <label className="otc-link-field wide">
                        <span>Notes</span>
                        <textarea rows={2} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} disabled={formSaving} />
                      </label>
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend>Items</legend>
                    <datalist id="otc-po-tool-ids">
                      {catalogToolIds.map((toolId) => <option value={toolId} key={toolId} />)}
                    </datalist>
                    <div className="otc-po-form-items">
                      {form.items.map((item, index) => (
                        <div className="otc-po-form-item" key={item.key}>
                          <span className="otc-po-line">{index + 1}</span>
                          <label className="otc-link-field description">
                            <span>Description</span>
                            <input value={item.description} onChange={(event) => updateItem(item.key, { description: event.target.value })} placeholder="AF Y REC HOB" disabled={formSaving} />
                          </label>
                          <label className="otc-link-field quantity">
                            <span>Qty <b>*</b></span>
                            <input inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: event.target.value })} disabled={formSaving} />
                          </label>
                          <label className="otc-link-field price">
                            <span>Unit price <b>*</b></span>
                            <input inputMode="decimal" value={item.unitPrice} onChange={(event) => updateItem(item.key, { unitPrice: event.target.value })} placeholder="0.00" disabled={formSaving} />
                          </label>
                          <span className="otc-po-subtotal"><small>Subtotal</small>{formatMoney(itemSubtotal(item), form.currency)}</span>
                          <button type="button" className="otc-po-remove" onClick={() => removeItem(item.key)} disabled={formSaving || form.items.length === 1} aria-label={`Remove item ${index + 1}`}><Trash2 size={15} /></button>
                          <div className="otc-link-field tools">
                            <span>Tool IDs covered</span>
                            <div className="otc-tool-input">
                              {item.toolIds.map((toolId) => (
                                <em className={catalogLookup.has(toolId.toLowerCase()) ? '' : 'unregistered'} title={catalogLookup.has(toolId.toLowerCase()) ? undefined : 'Not in the Tool ID catalog'} key={toolId}>
                                  {toolId}
                                  <button type="button" onClick={() => removeToolId(item.key, toolId)} disabled={formSaving} aria-label={`Remove ${toolId}`}><X size={12} /></button>
                                </em>
                              ))}
                              <input
                                list="otc-po-tool-ids"
                                value={item.toolDraft}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  // Pasting a list (or typing a separator) turns the finished entries into chips.
                                  if (/[\s,;]/.test(value)) {
                                    const parts = value.split(/[\s,;]+/);
                                    const draft = /[\s,;]$/.test(value) ? '' : parts.pop() ?? '';
                                    updateItem(item.key, { toolIds: itemToolIds({ ...item, toolDraft: parts.join(' ') }), toolDraft: draft });
                                  } else {
                                    updateItem(item.key, { toolDraft: value });
                                  }
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    commitToolDraft(item.key);
                                  } else if (event.key === 'Backspace' && !item.toolDraft && item.toolIds.length) {
                                    removeToolId(item.key, item.toolIds[item.toolIds.length - 1]);
                                  }
                                }}
                                onBlur={() => commitToolDraft(item.key)}
                                placeholder={item.toolIds.length ? '' : 'ID-29193-002, HB-6721...'}
                                disabled={formSaving}
                                aria-label={`Tool IDs for item ${index + 1}`}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="otc-po-form-total">
                      <button type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, newFormItem()] }))} disabled={formSaving}><Plus size={15} /> Add item</button>
                      <span><small>PO total</small>{formatMoney(formTotal, form.currency)}</span>
                    </div>
                  </fieldset>

                  <label className={`otc-link-file${formFile ? ' selected' : ''}`}>
                    <span>Purchase order file {editing ? null : <b>*</b>}</span>
                    <span className="otc-link-file-drop">
                      {formFile ? <Check size={16} /> : <Upload size={16} />}
                      <span>{formFile?.name || (editing ? `Keep ${editing.fileName} or choose a new PDF or photo` : 'Choose the PO PDF or photo')}</span>
                    </span>
                    <input type="file" accept={documentAccept} disabled={formSaving} onChange={(event) => { setFormFile(event.target.files?.[0] ?? null); setFormError(''); }} />
                  </label>
                </div>

                <aside className="otc-po-form-preview" aria-label="Purchase order file preview">
                  {formPreviewUrl
                    ? <DocumentFrame url={formPreviewUrl} title="Purchase order file preview" isPdf={formPreviewIsPdf} />
                    : <p><FileText size={26} />Attach the PO file to see it here while you capture the data.</p>}
                </aside>
              </div>
              {formError ? <div className="otc-feedback error" role="alert">{formError}</div> : null}
              <div className="otc-link-actions">
                <button type="button" className="secondary" onClick={closeForm} disabled={formSaving}>Cancel</button>
                <button type="submit" disabled={formSaving}>{formSaving ? 'Saving...' : editing ? 'Save changes' : 'Register Purchase Order'}</button>
              </div>
            </form>
          </section>
        </div>
      ), document.body) : null}

      {expanded && selected && viewer?.purchaseOrderId === selected.id ? createPortal((
        <div className="supplier-modal-backdrop otc-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpanded(false); }}>
          <div className="supplier-modal production-order-preview-modal otc-preview-modal" role="dialog" aria-modal="true" aria-labelledby="otc-po-preview-title">
            <button className="supplier-modal-close" type="button" onClick={() => setExpanded(false)} aria-label="Close document preview"><X size={18} /></button>
            <div>
              <div className="supplier-modal-header">
                <span>Purchase Order · {selected.poReference} · {selected.customerName}</span>
                <strong id="otc-po-preview-title">{selected.fileName}</strong>
              </div>
              <div className={`supplier-document-preview production-order-preview-frame ${isPdfFile(selected) ? 'pdf' : 'image'}`}>
                <DocumentFrame url={viewer.url} title={`Preview ${selected.fileName}`} isPdf={isPdfFile(selected)} />
              </div>
              <div className="supplier-modal-actions">
                <a className="otc-preview-download" href={viewer.url} target="_blank" rel="noreferrer"><Download size={15} /> Open in new tab</a>
                <button type="button" onClick={() => setExpanded(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      ), document.body) : null}
    </section>
  );
}
