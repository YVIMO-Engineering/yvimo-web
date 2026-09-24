import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CalendarDays, Check, ChevronDown, ClipboardList, Download, Eye, FileCheck2, FileText, History, ImagePlus, LockKeyhole, Plus, ReceiptText, RefreshCw, Search, ShoppingCart, Truck, Upload, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import './orderToCash.css';

type DocumentStage = 'purchase-order' | 'remission' | 'invoice';
type OtcStatus = DocumentStage | 'completed';
type OtcFilter = 'all' | OtcStatus;

type OtcDocument = {
  id: string;
  productionOrderId: string;
  stage: DocumentStage;
  folio: string;
  fileName: string;
  filePath: string;
  fileType: string;
  uploadedAt: string;
  purchaseOrderId: string;
};

// An active PO from the Purchase Orders registry that step 2 can link.
type RegisteredPo = {
  id: string;
  customerId: string;
  customerName: string;
  poReference: string;
  revisionNumber: number;
  poDate: string;
  currency: string;
  requisitionNumber: string;
  fileName: string;
  filePath: string;
  fileType: string;
  itemCount: number;
  toolIds: string[];
  total: number;
};

type OtcOrder = {
  productionOrderId: string;
  orderNumber: string;
  partNumber: string;
  partName: string;
  productionStatus: string;
  quantity: number;
  customerIds: string[];
  customerNames: string[];
  voucherNumbers: string[];
  receivedAt: string;
  isRework: boolean;
  orderCreatedAt: string;
  isLegacy: boolean;
  documents: Partial<Record<DocumentStage, OtcDocument>>;
  status: OtcStatus;
};

type ReceptionItemRow = {
  production_order_id: string | null;
  customer_id: string | null;
  production_order_number: string | null;
  quantity: number | null;
  is_rework: boolean | null;
  created_at: string;
  mes_customers: { customer_name: string } | Array<{ customer_name: string }> | null;
  voucher: { voucher_number: string; received_at: string | null; created_at: string } | Array<{ voucher_number: string; received_at: string | null; created_at: string }> | null;
  production_order: { order_number: string; part_number: string | null; part_name: string | null; status: string; created_at: string } | Array<{ order_number: string; part_number: string | null; part_name: string | null; status: string; created_at: string }> | null;
};

type DocumentRow = {
  id: string;
  production_order_id: string;
  stage: DocumentStage;
  folio: string;
  file_name: string;
  file_path: string;
  file_type: string;
  uploaded_at: string;
  purchase_order_id: string | null;
};

type RegisteredPoRow = {
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

type LinkTarget = { order: OtcOrder; stage: DocumentStage; existing?: OtcDocument };
type Preview = { title: string; subtitle: string; url: string; isPdf: boolean };

type Props = {
  organizationId: string;
  onNavigate: (path: string) => void;
};

const documentsBucket = 'mes-order-to-cash-documents';
const documentAccept = 'application/pdf,.pdf,image/*';
const documentExtensions = /\.(?:pdf|jpe?g|png|webp|heic|heif|avif)$/i;
const documentMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']);
const rowPageSize = 1000;

// OTC went live in September 2026. Orders created before then were already billed outside
// the system, so they count as completed instead of showing up as pending paperwork.
const otcStartDate = new Date(2026, 8, 1);
const legacyNotice = 'This order was processed before the OTC system was implemented (September 2026). Its administrative steps are considered complete.';

const steps = ['Production Order', 'Purchase Order', 'Remission', 'Invoice'];
const documentStages: Array<{ stage: DocumentStage; label: string; folioLabel: string; description: string }> = [
  { stage: 'purchase-order', label: 'Purchase Order', folioLabel: 'PO reference', description: 'Select the active customer purchase order that covers this production order.' },
  { stage: 'remission', label: 'Remission', folioLabel: 'Remission folio', description: 'Link the remission issued when the pieces were delivered.' },
  { stage: 'invoice', label: 'Invoice', folioLabel: 'Invoice folio', description: 'Link the invoice billed to the customer for this production order.' },
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

function single<Row>(value: Row | Row[] | null): Row | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function getStatus(documents: OtcOrder['documents']): OtcStatus {
  if (!documents['purchase-order']) return 'purchase-order';
  if (!documents.remission) return 'remission';
  if (!documents.invoice) return 'invoice';
  return 'completed';
}

function previousStage(stage: DocumentStage): DocumentStage | null {
  return stage === 'remission' ? 'purchase-order' : stage === 'invoice' ? 'remission' : null;
}

function stageLabel(stage: DocumentStage) {
  return documentStages.find((entry) => entry.stage === stage)?.label ?? stage;
}

function isPdfDocument(document: { fileType: string; fileName: string }) {
  return document.fileType === 'application/pdf' || document.fileName.toLowerCase().endsWith('.pdf');
}

function getDocumentMimeType(file: File) {
  if (file.type && file.type !== 'application/octet-stream') return file.type.toLowerCase();
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return extension ? `image/${extension}` : 'image/jpeg';
}

function formatDate(value: string) {
  if (!value) return 'Not specified';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimestamp(value: string) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatPoDate(value: string) {
  if (!value) return 'Not specified';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMoney(value: number, currency: string) {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatProductionStatus(status: string) {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Not specified';
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

type PurchaseOrderPickerProps = {
  candidates: RegisteredPo[];
  currentId: string;
  disabled: boolean;
  onPick: (purchaseOrder: RegisteredPo) => void;
};

// Search dropdown of the active POs a production order can be linked to. The list opens
// inline, under the search box, so the document card never clips it.
function PurchaseOrderPicker({ candidates, currentId, disabled, onPick }: PurchaseOrderPickerProps) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listId = React.useId();

  const matches = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter((purchaseOrder) => [purchaseOrder.poReference, purchaseOrder.requisitionNumber, purchaseOrder.customerName, ...purchaseOrder.toolIds]
      .some((value) => value.toLowerCase().includes(needle)));
  }, [candidates, query]);

  React.useEffect(() => { setActiveIndex(0); }, [query]);

  const pick = (purchaseOrder: RegisteredPo) => {
    setOpen(false);
    setQuery('');
    onPick(purchaseOrder);
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
          placeholder="Search active POs by reference or Tool ID"
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
          {matches.map((purchaseOrder, index) => (
            <li
              role="option"
              aria-selected={index === activeIndex}
              className={`${index === activeIndex ? 'active' : ''}${purchaseOrder.id === currentId ? ' current' : ''}`}
              key={purchaseOrder.id}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => pick(purchaseOrder)}
            >
              <span className="otc-po-picker-main">
                <strong>{purchaseOrder.poReference}{purchaseOrder.revisionNumber ? ` · Rev ${purchaseOrder.revisionNumber}` : ''}</strong>
                <small>{purchaseOrder.customerName} · {formatPoDate(purchaseOrder.poDate)} · {purchaseOrder.itemCount} {purchaseOrder.itemCount === 1 ? 'item' : 'items'}</small>
                {purchaseOrder.toolIds.length ? <small className="otc-po-picker-tools">{purchaseOrder.toolIds.slice(0, 4).join(', ')}{purchaseOrder.toolIds.length > 4 ? ` +${purchaseOrder.toolIds.length - 4}` : ''}</small> : null}
              </span>
              <em>{formatMoney(purchaseOrder.total, purchaseOrder.currency)}</em>
              {purchaseOrder.id === currentId ? <Check size={15} /> : null}
            </li>
          ))}
          {!matches.length ? <li className="otc-po-picker-empty">No active POs match "{query.trim()}".</li> : null}
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
  const [linkTarget, setLinkTarget] = React.useState<LinkTarget | null>(null);
  const [linkFolio, setLinkFolio] = React.useState('');
  const [linkFile, setLinkFile] = React.useState<File | null>(null);
  const [linkError, setLinkError] = React.useState('');
  const [linkSaving, setLinkSaving] = React.useState(false);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [previewError, setPreviewError] = React.useState('');
  const [purchaseOrders, setPurchaseOrders] = React.useState<RegisteredPo[]>([]);
  const [poLinking, setPoLinking] = React.useState(false);
  const [poLinkError, setPoLinkError] = React.useState('');
  const [changingPo, setChangingPo] = React.useState(false);

  const loadOrders = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [itemRows, documentRows, purchaseOrderResult] = await Promise.all([
        fetchAllRows<ReceptionItemRow>((from, to) => supabase
          .from('mes_customer_reception_items')
          .select('production_order_id, customer_id, production_order_number, quantity, is_rework, created_at, mes_customers(customer_name), voucher:mes_customer_reception_vouchers!reception_voucher_id(voucher_number, received_at, created_at), production_order:mes_production_orders!production_order_id(order_number, part_number, part_name, status, created_at)')
          .eq('organization_id', organizationId)
          .not('production_order_id', 'is', null)
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to)),
        fetchAllRows<DocumentRow>((from, to) => supabase
          .from('mes_order_to_cash_documents')
          .select('id, production_order_id, stage, folio, file_name, file_path, file_type, uploaded_at, purchase_order_id')
          .eq('organization_id', organizationId)
          .order('id')
          .range(from, to)),
        supabase
          .from('mes_customer_purchase_orders')
          .select('id, customer_id, po_reference, revision_number, po_date, currency, requisition_number, file_name, file_path, file_type, customer:mes_customers!customer_id(customer_name), items:mes_customer_purchase_order_items(subtotal, tool_ids)')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .order('po_date', { ascending: false })
          .returns<RegisteredPoRow[]>(),
      ]);
      if (purchaseOrderResult.error) throw new Error(purchaseOrderResult.error.message);
      setPurchaseOrders((purchaseOrderResult.data ?? []).map((row) => {
        const items = row.items ?? [];
        return {
          id: row.id,
          customerId: row.customer_id,
          customerName: single(row.customer)?.customer_name ?? 'Unknown client',
          poReference: row.po_reference,
          revisionNumber: row.revision_number,
          poDate: row.po_date,
          currency: row.currency,
          requisitionNumber: row.requisition_number,
          fileName: row.file_name,
          filePath: row.file_path,
          fileType: row.file_type,
          itemCount: items.length,
          toolIds: Array.from(new Set(items.flatMap((item) => item.tool_ids ?? []))),
          total: Math.round(items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0) * 100) / 100,
        };
      }));
      const documentsByOrder = new Map<string, OtcOrder['documents']>();
      documentRows.forEach((row) => {
        const documents = documentsByOrder.get(row.production_order_id) ?? {};
        documents[row.stage] = { id: row.id, productionOrderId: row.production_order_id, stage: row.stage, folio: row.folio, fileName: row.file_name, filePath: row.file_path, fileType: row.file_type, uploadedAt: row.uploaded_at, purchaseOrderId: row.purchase_order_id ?? '' };
        documentsByOrder.set(row.production_order_id, documents);
      });
      // One production order can be split across several reception items (and vouchers);
      // Order-to-Cash tracks the order itself, so its items are folded into a single entry.
      const ordersById = new Map<string, OtcOrder>();
      itemRows.forEach((row) => {
        if (!row.production_order_id) return;
        const productionOrder = single(row.production_order);
        const voucher = single(row.voucher);
        const customerName = single(row.mes_customers)?.customer_name ?? '';
        const receivedAt = voucher ? voucher.received_at || voucher.created_at : row.created_at;
        const current = ordersById.get(row.production_order_id);
        if (current) {
          current.quantity += Number(row.quantity) || 0;
          if (row.customer_id && !current.customerIds.includes(row.customer_id)) current.customerIds.push(row.customer_id);
          if (customerName && !current.customerNames.includes(customerName)) current.customerNames.push(customerName);
          if (voucher && !current.voucherNumbers.includes(voucher.voucher_number)) current.voucherNumbers.push(voucher.voucher_number);
          if (receivedAt > current.receivedAt) current.receivedAt = receivedAt;
          return;
        }
        const documents = documentsByOrder.get(row.production_order_id) ?? {};
        const orderCreatedAt = productionOrder?.created_at || row.created_at;
        const isLegacy = new Date(orderCreatedAt) < otcStartDate;
        ordersById.set(row.production_order_id, {
          productionOrderId: row.production_order_id,
          orderNumber: productionOrder?.order_number || row.production_order_number || 'Unnumbered order',
          partNumber: productionOrder?.part_number ?? '',
          partName: productionOrder?.part_name ?? '',
          productionStatus: productionOrder?.status ?? '',
          quantity: Number(row.quantity) || 0,
          customerIds: row.customer_id ? [row.customer_id] : [],
          customerNames: customerName ? [customerName] : [],
          voucherNumbers: voucher ? [voucher.voucher_number] : [],
          receivedAt,
          isRework: Boolean(row.is_rework),
          orderCreatedAt,
          isLegacy,
          documents,
          status: isLegacy ? 'completed' : getStatus(documents),
        });
      });
      const nextOrders = Array.from(ordersById.values()).sort((left, right) => right.receivedAt.localeCompare(left.receivedAt) || right.orderNumber.localeCompare(left.orderNumber));
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
    setChangingPo(false);
    setPoLinkError('');
  }, [selectedId]);

  const linkPurchaseOrder = async (order: OtcOrder, purchaseOrder: RegisteredPo) => {
    const existing = order.documents['purchase-order'];
    if (poLinking || existing?.purchaseOrderId === purchaseOrder.id) {
      setChangingPo(false);
      return;
    }
    setPoLinking(true);
    setPoLinkError('');
    try {
      // Folio and file are copied from the registered PO by the database; they are sent too
      // because the columns are required.
      const { error: saveError } = await supabase.from('mes_order_to_cash_documents').upsert({
        organization_id: organizationId,
        production_order_id: order.productionOrderId,
        stage: 'purchase-order',
        purchase_order_id: purchaseOrder.id,
        folio: purchaseOrder.poReference,
        file_name: purchaseOrder.fileName,
        file_path: purchaseOrder.filePath,
        file_type: purchaseOrder.fileType,
      }, { onConflict: 'production_order_id,stage' });
      if (saveError) throw saveError;
      // A PO uploaded directly in OTC (before the registry) owned its file; a registered PO's
      // file belongs to the registry and must stay.
      if (existing && !existing.purchaseOrderId) {
        await supabase.storage.from(documentsBucket).remove([existing.filePath]);
      }
      setChangingPo(false);
      await loadOrders();
    } catch (saveError) {
      console.error('Unable to link purchase order', saveError);
      setPoLinkError(saveError instanceof Error ? saveError.message : typeof saveError === 'object' && saveError && 'message' in saveError ? String(saveError.message) : 'Unable to link the purchase order.');
    } finally {
      setPoLinking(false);
    }
  };

  const renderPurchaseOrderPicker = (order: OtcOrder) => {
    const candidates = purchaseOrders.filter((purchaseOrder) => order.customerIds.includes(purchaseOrder.customerId));
    const clientName = order.customerNames.join(', ') || 'this client';
    if (!candidates.length) {
      return (
        <div className="otc-po-picker-none">
          <p className="otc-document-hint">No active purchase orders for {clientName}.</p>
          <button type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/intelligence/otc/purchase-orders')}><Plus size={15} /> Register Purchase Order</button>
        </div>
      );
    }
    return (
      <PurchaseOrderPicker
        candidates={candidates}
        currentId={order.documents['purchase-order']?.purchaseOrderId ?? ''}
        disabled={poLinking}
        onPick={(purchaseOrder) => void linkPurchaseOrder(order, purchaseOrder)}
      />
    );
  };

  const openLink = (order: OtcOrder, stage: DocumentStage) => {
    const existing = order.documents[stage];
    setLinkTarget({ order, stage, existing });
    setLinkFolio(existing?.folio ?? '');
    setLinkFile(null);
    setLinkError('');
  };

  const closeLink = () => {
    if (linkSaving) return;
    setLinkTarget(null);
  };

  const saveLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!linkTarget || linkSaving) return;
    const folio = linkFolio.trim();
    const { order, stage, existing } = linkTarget;
    if (!folio) {
      setLinkError(`Enter the ${stageLabel(stage).toLowerCase()} folio.`);
      return;
    }
    if (!linkFile && !existing) {
      setLinkError('Attach the document file.');
      return;
    }
    if (linkFile && !documentExtensions.test(linkFile.name) && !documentMimeTypes.has(linkFile.type.toLowerCase())) {
      setLinkError('The document must be a PDF or a photo.');
      return;
    }
    setLinkSaving(true);
    setLinkError('');
    let uploadedPath = '';
    try {
      let file = existing ? { name: existing.fileName, path: existing.filePath, type: existing.fileType } : null;
      if (linkFile) {
        const safeFileName = linkFile.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        uploadedPath = `${organizationId}/${order.productionOrderId}/${stage}/${Date.now()}-${safeFileName}`;
        const fileType = getDocumentMimeType(linkFile);
        const { error: uploadError } = await supabase.storage.from(documentsBucket).upload(uploadedPath, linkFile, { contentType: fileType });
        if (uploadError) throw uploadError;
        file = { name: linkFile.name, path: uploadedPath, type: fileType };
      }
      if (!file) throw new Error('Attach the document file.');
      const { error: saveError } = await supabase.from('mes_order_to_cash_documents').upsert({
        organization_id: organizationId,
        production_order_id: order.productionOrderId,
        stage,
        folio,
        file_name: file.name,
        file_path: file.path,
        file_type: file.type,
      }, { onConflict: 'production_order_id,stage' });
      if (saveError) throw saveError;
      if (existing && uploadedPath && existing.filePath !== uploadedPath) {
        await supabase.storage.from(documentsBucket).remove([existing.filePath]);
      }
      setLinkTarget(null);
      await loadOrders();
    } catch (saveError) {
      if (uploadedPath) await supabase.storage.from(documentsBucket).remove([uploadedPath]);
      console.error('Unable to link Order-to-Cash document', saveError);
      setLinkError(saveError instanceof Error ? saveError.message : 'Unable to link the document.');
    } finally {
      setLinkSaving(false);
    }
  };

  const openPreview = async (linkedDocument: OtcDocument) => {
    setPreviewError('');
    const { data, error: signedUrlError } = await supabase.storage.from(documentsBucket).createSignedUrl(linkedDocument.filePath, 60 * 10);
    if (signedUrlError || !data?.signedUrl) {
      setPreviewError(signedUrlError?.message || 'This document could not be opened.');
      return;
    }
    setPreview({ title: linkedDocument.fileName, subtitle: `${stageLabel(linkedDocument.stage)} · Folio ${linkedDocument.folio}`, url: data.signedUrl, isPdf: isPdfDocument(linkedDocument) });
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
                  return (
                    <article className={`otc-document-card ${linkedDocument ? 'linked' : notRequired ? 'legacy' : locked ? 'locked' : 'pending'}`} key={entry.stage}>
                      <header>
                        <span className="otc-document-step">{linkedDocument || notRequired ? <Check size={15} /> : index + 2}</span>
                        <div><small>Step {index + 2}</small><strong>{entry.label}</strong></div>
                        <em>{linkedDocument ? 'Linked' : notRequired ? 'Not required' : locked ? 'Locked' : 'Pending'}</em>
                      </header>
                      {entry.stage === 'purchase-order' && !notRequired && (!linkedDocument || changingPo) ? (
                        <>
                          <p className="otc-document-hint">{entry.description}</p>
                          {renderPurchaseOrderPicker(selected)}
                          {poLinking ? <p className="otc-document-hint">Linking purchase order...</p> : null}
                          {poLinkError ? <div className="otc-feedback error" role="alert">{poLinkError}</div> : null}
                          {linkedDocument ? <footer><button type="button" onClick={() => { setChangingPo(false); setPoLinkError(''); }} disabled={poLinking}>Cancel</button></footer> : null}
                        </>
                      ) : linkedDocument ? (
                        <>
                          <div className="otc-document-folio"><small>{entry.folioLabel}</small><strong>{linkedDocument.folio}</strong>{linkedDocument.purchaseOrderId ? <em className="otc-po-registry-tag"><ShoppingCart size={12} /> Purchase Orders registry</em> : null}</div>
                          <button type="button" className="otc-document-file" onClick={() => void openPreview(linkedDocument)} title={`View ${linkedDocument.fileName}`}>
                            {isPdfDocument(linkedDocument) ? <FileText size={18} /> : <ImagePlus size={18} />}
                            <span><strong>{linkedDocument.fileName}</strong><small>Uploaded {formatTimestamp(linkedDocument.uploadedAt)}</small></span>
                          </button>
                          <footer>
                            <button type="button" className="primary" onClick={() => void openPreview(linkedDocument)}><Eye size={15} /> View document</button>
                            {entry.stage === 'purchase-order'
                              ? <button type="button" onClick={() => { setChangingPo(true); setPoLinkError(''); }}><RefreshCw size={15} /> Change PO</button>
                              : <button type="button" onClick={() => openLink(selected, entry.stage)}><RefreshCw size={15} /> Replace</button>}
                          </footer>
                        </>
                      ) : notRequired ? (
                        <p className="otc-document-hint"><History size={15} /> Processed before OTC. No {entry.label.toLowerCase()} is required in the system.</p>
                      ) : locked ? (
                        <p className="otc-document-hint"><LockKeyhole size={15} /> Link the {stageLabel(required as DocumentStage).toLowerCase()} first.</p>
                      ) : (
                        <>
                          <p className="otc-document-hint">{entry.description}</p>
                          <footer>
                            <button type="button" className="primary" onClick={() => openLink(selected, entry.stage)}><Upload size={15} /> Link {entry.label}</button>
                          </footer>
                        </>
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

      {linkTarget ? createPortal((
        <div className="mes-modal-backdrop otc-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeLink(); }}>
          <section className="mes-order-modal otc-link-modal" role="dialog" aria-modal="true" aria-labelledby="otc-link-title">
            <button className="supplier-modal-close" type="button" onClick={closeLink} disabled={linkSaving} aria-label="Close"><X size={18} /></button>
            <form onSubmit={saveLink}>
              <span className="otc-link-icon"><Upload size={24} /></span>
              <p className="eyebrow">Production Order {linkTarget.order.orderNumber}</p>
              <h3 id="otc-link-title">{linkTarget.existing ? `Replace ${stageLabel(linkTarget.stage)}` : `Link ${stageLabel(linkTarget.stage)}`}</h3>
              <p>{documentStages.find((entry) => entry.stage === linkTarget.stage)?.description}</p>
              <label className="otc-link-field">
                <span>{documentStages.find((entry) => entry.stage === linkTarget.stage)?.folioLabel} <b>*</b></span>
                <input value={linkFolio} onChange={(event) => setLinkFolio(event.target.value)} placeholder="Document folio" autoFocus disabled={linkSaving} />
              </label>
              <label className={`otc-link-file${linkFile ? ' selected' : ''}`}>
                <span>Document file {linkTarget.existing ? null : <b>*</b>}</span>
                <span className="otc-link-file-drop">
                  {linkFile ? <Check size={16} /> : <Upload size={16} />}
                  <span>{linkFile?.name || (linkTarget.existing ? `Keep ${linkTarget.existing.fileName} or choose a new PDF or photo` : 'Choose a PDF or photo')}</span>
                </span>
                <input type="file" accept={documentAccept} disabled={linkSaving} onChange={(event) => { setLinkFile(event.target.files?.[0] ?? null); setLinkError(''); }} />
              </label>
              {linkError ? <div className="otc-feedback error" role="alert">{linkError}</div> : null}
              <div className="otc-link-actions">
                <button type="button" className="secondary" onClick={closeLink} disabled={linkSaving}>Cancel</button>
                <button type="submit" disabled={linkSaving || !linkFolio.trim() || (!linkFile && !linkTarget.existing)}>{linkSaving ? 'Saving...' : linkTarget.existing ? 'Save changes' : `Link ${stageLabel(linkTarget.stage)}`}</button>
              </div>
            </form>
          </section>
        </div>
      ), document.body) : null}

      {preview ? createPortal((
        <div className="supplier-modal-backdrop otc-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>
          <div className="supplier-modal production-order-preview-modal otc-preview-modal" role="dialog" aria-modal="true" aria-labelledby="otc-preview-title">
            <button className="supplier-modal-close" type="button" onClick={() => setPreview(null)} aria-label="Close document preview"><X size={18} /></button>
            <div>
              <div className="supplier-modal-header">
                <span>{preview.subtitle}</span>
                <strong id="otc-preview-title">{preview.title}</strong>
              </div>
              <div className={`supplier-document-preview production-order-preview-frame ${preview.isPdf ? 'pdf' : 'image'}`}>
                {preview.isPdf
                  ? <iframe src={`${preview.url}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`} title={`Preview ${preview.title}`} />
                  : <img src={preview.url} alt={preview.title} draggable={false} />}
              </div>
              <div className="supplier-modal-actions">
                <a className="otc-preview-download" href={preview.url} target="_blank" rel="noreferrer"><Download size={15} /> Open in new tab</a>
                <button type="button" onClick={() => setPreview(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      ), document.body) : null}
    </section>
  );
}
