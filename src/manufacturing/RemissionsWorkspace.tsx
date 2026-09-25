import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Ban, CalendarDays, Check, Download, FileText, Maximize2, Pencil, Plus, RefreshCw, RotateCcw, Search, ShoppingCart, Trash2, Truck, Upload, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import { addToCurrency, billingStatus, sumActiveQuantities, type BillingStatus } from './otcBalances';
import { DocumentFrame, DocumentPreviewModal, documentAccept, errorMessage, fetchAllRows, formatCalendarDate as formatDate, formatMoneyByCurrency, formatQuantity, getDocumentMimeType, isAcceptedDocument, isPdfFile, parseNumber, removeRegistryFiles, single, todayIso, uploadRegistryFile, useSignedDocumentUrl } from './otcShared';
import './orderToCash.css';

type RemissionStatus = 'active' | 'cancelled';
type RemissionTab = 'to-invoice' | 'invoiced' | 'cancelled';

// A PO line a remission can deliver. remissioned counts every active remission.
type PoLine = {
  id: string;
  purchaseOrderId: string;
  poReference: string;
  revisionNumber: number;
  poStatus: string;
  customerId: string;
  currency: string;
  lineNumber: number;
  description: string;
  toolIds: string[];
  quantity: number;
  unitPrice: number;
  remissioned: number;
};

type RemissionLine = {
  id: string;
  lineNumber: number;
  poItemId: string;
  poLine: PoLine | null;
  quantity: number;
  invoiced: number;
};

type Remission = {
  id: string;
  customerId: string;
  customerName: string;
  folio: string;
  date: string;
  shipTo: string;
  receivedBy: string;
  notes: string;
  status: RemissionStatus;
  cancelledAt: string;
  fileName: string;
  filePath: string;
  fileType: string;
  lines: RemissionLine[];
  pieces: number;
  invoicedPieces: number;
  billing: BillingStatus;
  purchaseOrders: string[];
  invoices: string[];
  productionOrders: string[];
  pendingValue: Map<string, number>;
};

type RemissionRow = {
  id: string;
  customer_id: string;
  remission_folio: string;
  remission_date: string;
  ship_to: string;
  received_by: string;
  notes: string;
  status: RemissionStatus;
  cancelled_at: string | null;
  file_name: string;
  file_path: string;
  file_type: string;
  customer: { customer_name: string } | Array<{ customer_name: string }> | null;
};

type RemissionItemRow = { id: string; remission_id: string; line_number: number; purchase_order_item_id: string; quantity: number | string };
type PurchaseOrderRow = { id: string; customer_id: string; po_reference: string; revision_number: number; status: string; currency: string };
type PoItemRow = { id: string; purchase_order_id: string; line_number: number; description: string; tool_ids: string[] | null; quantity: number | string; unit_price: number | string };
type InvoiceItemRow = { remission_item_id: string; quantity: number | string; invoice: { invoice_folio: string; status: string } | Array<{ invoice_folio: string; status: string }> | null };
type LinkedOrderRow = { remission_id: string; production_order: { order_number: string } | Array<{ order_number: string }> | null };

type Customer = { id: string; name: string };

type FormLine = { key: string; poItemId: string; quantity: string };

type RemissionForm = {
  customerId: string;
  folio: string;
  date: string;
  shipTo: string;
  receivedBy: string;
  notes: string;
  lines: FormLine[];
};

type Props = {
  organizationId: string;
  onNavigate: (path: string) => void;
};

const otcPath = '/workspace/manufacturing-ops/intelligence/otc';
const tabs: Array<{ value: RemissionTab; label: string }> = [
  { value: 'to-invoice', label: 'To invoice' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'cancelled', label: 'Cancelled' },
];
const billingLabel: Record<BillingStatus, string> = { pending: 'Not invoiced', partial: 'Partially invoiced', invoiced: 'Invoiced' };

function remissionTab(remission: Remission): RemissionTab {
  if (remission.status === 'cancelled') return 'cancelled';
  return remission.billing === 'invoiced' ? 'invoiced' : 'to-invoice';
}

function statusClass(remission: Remission) {
  return remission.status === 'cancelled' ? 'doc-cancelled' : `bill-${remission.billing}`;
}

function statusText(remission: Remission) {
  return remission.status === 'cancelled' ? 'Cancelled' : billingLabel[remission.billing];
}

function sortFolios(values: Iterable<string>) {
  return Array.from(new Set(values)).sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
}

function poLineLabel(line: PoLine) {
  return line.description || line.toolIds.join(', ') || `Line ${line.lineNumber}`;
}

function newFormLine(poItemId = '', quantity = ''): FormLine {
  return { key: crypto.randomUUID(), poItemId, quantity };
}

function emptyForm(customerId = ''): RemissionForm {
  return { customerId, folio: '', date: todayIso(), shipTo: '', receivedBy: '', notes: '', lines: [newFormLine()] };
}

export function RemissionsWorkspace({ organizationId, onNavigate }: Props) {
  const [remissions, setRemissions] = React.useState<Remission[]>([]);
  const [poLines, setPoLines] = React.useState<PoLine[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [selectedId, setSelectedId] = React.useState('');
  const [tab, setTab] = React.useState<RemissionTab>('to-invoice');
  const [customerFilter, setCustomerFilter] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [expanded, setExpanded] = React.useState(false);
  const [statusSaving, setStatusSaving] = React.useState(false);
  const [editing, setEditing] = React.useState<Remission | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<RemissionForm>(emptyForm);
  const [formFile, setFormFile] = React.useState<File | null>(null);
  const [formFileUrl, setFormFileUrl] = React.useState('');
  const [formError, setFormError] = React.useState('');
  const [formSaving, setFormSaving] = React.useState(false);
  // Remission to select once the list reloads, in whichever tab it lands.
  const focusRef = React.useRef('');

  const loadRemissions = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [remissionRows, remissionItemRows, purchaseOrderRows, poItemRows, invoiceItemRows, linkedRows, customerResult] = await Promise.all([
        fetchAllRows<RemissionRow>((from, to) => supabase
          .from('mes_customer_remissions')
          .select('id, customer_id, remission_folio, remission_date, ship_to, received_by, notes, status, cancelled_at, file_name, file_path, file_type, customer:mes_customers!customer_id(customer_name)')
          .eq('organization_id', organizationId)
          .order('remission_date', { ascending: false })
          .order('id')
          .range(from, to)),
        fetchAllRows<RemissionItemRow>((from, to) => supabase
          .from('mes_customer_remission_items')
          .select('id, remission_id, line_number, purchase_order_item_id, quantity')
          .eq('organization_id', organizationId)
          .order('remission_id')
          .order('line_number')
          .range(from, to)),
        fetchAllRows<PurchaseOrderRow>((from, to) => supabase
          .from('mes_customer_purchase_orders')
          .select('id, customer_id, po_reference, revision_number, status, currency')
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
        fetchAllRows<InvoiceItemRow>((from, to) => supabase
          .from('mes_customer_invoice_items')
          .select('remission_item_id, quantity, invoice:mes_customer_invoices!invoice_id(invoice_folio, status)')
          .eq('organization_id', organizationId)
          .order('id')
          .range(from, to)),
        fetchAllRows<LinkedOrderRow>((from, to) => supabase
          .from('mes_order_to_cash_documents')
          .select('remission_id, production_order:mes_production_orders!production_order_id(order_number)')
          .eq('organization_id', organizationId)
          .not('remission_id', 'is', null)
          .order('id')
          .range(from, to)),
        supabase.from('mes_customers').select('id, customer_name, status').eq('organization_id', organizationId).order('customer_name'),
      ]);
      if (customerResult.error) throw new Error(customerResult.error.message);

      const statusByRemission = new Map(remissionRows.map((row) => [row.id, row.status]));
      const items = remissionItemRows.map((row) => ({ ...row, quantity: Number(row.quantity) || 0 }));
      const remissionedByPoItem = sumActiveQuantities(items, (row) => row.purchase_order_item_id, (row) => statusByRemission.get(row.remission_id) === 'active');
      const invoiceItems = invoiceItemRows.map((row) => ({ ...row, quantity: Number(row.quantity) || 0, invoice: single(row.invoice) }));
      const invoicedByItem = sumActiveQuantities(invoiceItems, (row) => row.remission_item_id, (row) => row.invoice?.status === 'active');
      const invoiceFoliosByItem = new Map<string, string[]>();
      invoiceItems.forEach((row) => {
        if (row.invoice?.status === 'active') invoiceFoliosByItem.set(row.remission_item_id, [...(invoiceFoliosByItem.get(row.remission_item_id) ?? []), row.invoice.invoice_folio]);
      });

      const purchaseOrders = new Map(purchaseOrderRows.map((row) => [row.id, row]));
      const nextPoLines = poItemRows.flatMap((row): PoLine[] => {
        const purchaseOrder = purchaseOrders.get(row.purchase_order_id);
        if (!purchaseOrder) return [];
        return [{
          id: row.id,
          purchaseOrderId: row.purchase_order_id,
          poReference: purchaseOrder.po_reference,
          revisionNumber: purchaseOrder.revision_number,
          poStatus: purchaseOrder.status,
          customerId: purchaseOrder.customer_id,
          currency: purchaseOrder.currency,
          lineNumber: row.line_number,
          description: row.description,
          toolIds: row.tool_ids ?? [],
          quantity: Number(row.quantity) || 0,
          unitPrice: Number(row.unit_price) || 0,
          remissioned: remissionedByPoItem.get(row.id) ?? 0,
        }];
      });
      const poLineById = new Map(nextPoLines.map((line) => [line.id, line]));

      const linesByRemission = new Map<string, RemissionLine[]>();
      items.forEach((row) => {
        const lines = linesByRemission.get(row.remission_id) ?? [];
        lines.push({ id: row.id, lineNumber: row.line_number, poItemId: row.purchase_order_item_id, poLine: poLineById.get(row.purchase_order_item_id) ?? null, quantity: row.quantity, invoiced: invoicedByItem.get(row.id) ?? 0 });
        linesByRemission.set(row.remission_id, lines);
      });
      const productionOrdersByRemission = new Map<string, string[]>();
      linkedRows.forEach((row) => {
        const orderNumber = single(row.production_order)?.order_number;
        if (orderNumber) productionOrdersByRemission.set(row.remission_id, [...(productionOrdersByRemission.get(row.remission_id) ?? []), orderNumber]);
      });

      const nextRemissions = remissionRows.map((row): Remission => {
        const lines = linesByRemission.get(row.id) ?? [];
        const pendingValue = new Map<string, number>();
        lines.forEach((line) => {
          const pending = Math.max(line.quantity - line.invoiced, 0);
          if (line.poLine && pending > 0) addToCurrency(pendingValue, line.poLine.currency, pending * line.poLine.unitPrice);
        });
        return {
          id: row.id,
          customerId: row.customer_id,
          customerName: single(row.customer)?.customer_name ?? 'Unknown client',
          folio: row.remission_folio,
          date: row.remission_date,
          shipTo: row.ship_to,
          receivedBy: row.received_by,
          notes: row.notes,
          status: row.status,
          cancelledAt: row.cancelled_at ?? '',
          fileName: row.file_name,
          filePath: row.file_path,
          fileType: row.file_type,
          lines,
          pieces: lines.reduce((sum, line) => sum + line.quantity, 0),
          invoicedPieces: lines.reduce((sum, line) => sum + Math.min(line.invoiced, line.quantity), 0),
          billing: billingStatus(lines),
          purchaseOrders: sortFolios(lines.flatMap((line) => (line.poLine ? [line.poLine.poReference] : []))),
          invoices: sortFolios(lines.flatMap((line) => invoiceFoliosByItem.get(line.id) ?? [])),
          productionOrders: sortFolios(productionOrdersByRemission.get(row.id) ?? []),
          pendingValue,
        };
      });
      setPoLines(nextPoLines);
      setRemissions(nextRemissions);
      // Inactive clients stay listed only when a remission already points at them.
      setCustomers((customerResult.data ?? [])
        .filter((customer) => customer.status === 'active' || nextRemissions.some((remission) => remission.customerId === customer.id))
        .map((customer) => ({ id: String(customer.id), name: String(customer.customer_name) })));
      setError('');
    } catch (loadError) {
      setError(errorMessage(loadError, 'Unable to load remissions.'));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    void loadRemissions();
  }, [loadRemissions]);

  const realtimeTables = React.useMemo(() => ([
    { table: 'mes_customer_remissions', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_remission_items', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_purchase_orders', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_purchase_order_items', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_invoices', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_invoice_items', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_order_to_cash_documents', filter: `organization_id=eq.${organizationId}` },
  ]), [organizationId]);

  useSupabaseRealtimeRefresh({
    channelName: `mes-remissions-live:${organizationId}`,
    tables: realtimeTables,
    onRefresh: loadRemissions,
    enabled: Boolean(organizationId),
    debounceMs: 400,
  });

  const counts = React.useMemo(() => {
    const result: Record<RemissionTab, number> = { 'to-invoice': 0, invoiced: 0, cancelled: 0 };
    remissions.forEach((remission) => {
      if (!customerFilter || remission.customerId === customerFilter) result[remissionTab(remission)] += 1;
    });
    return result;
  }, [remissions, customerFilter]);

  const filteredRemissions = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return remissions.filter((remission) => {
      if (remissionTab(remission) !== tab) return false;
      if (customerFilter && remission.customerId !== customerFilter) return false;
      if (!query) return true;
      return [remission.folio, remission.customerName, remission.receivedBy, ...remission.purchaseOrders, ...remission.invoices, ...remission.productionOrders, ...remission.lines.flatMap((line) => (line.poLine ? [line.poLine.description, ...line.poLine.toolIds] : []))]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [remissions, tab, customerFilter, search]);

  React.useEffect(() => {
    const target = remissions.find((remission) => remission.id === focusRef.current);
    if (!target) return;
    focusRef.current = '';
    setTab(remissionTab(target));
    setSelectedId(target.id);
  }, [remissions]);

  // Keep the selection inside the visible tab so the detail never shows a remission the list hides.
  React.useEffect(() => {
    setSelectedId((current) => (filteredRemissions.some((remission) => remission.id === current) ? current : filteredRemissions[0]?.id ?? ''));
  }, [filteredRemissions]);

  const selected = remissions.find((remission) => remission.id === selectedId) ?? null;
  const viewer = useSignedDocumentUrl(selected?.id ?? '', selected?.filePath ?? '');

  React.useEffect(() => {
    if (!formFile) {
      setFormFileUrl('');
      return;
    }
    const url = URL.createObjectURL(formFile);
    setFormFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [formFile]);

  // Pieces of each PO line this remission may still take: the PO quantity minus what the
  // other active remissions already delivered.
  const ownQuantities = React.useMemo(() => {
    const quantities = new Map<string, number>();
    if (editing?.status === 'active') editing.lines.forEach((line) => quantities.set(line.poItemId, line.quantity));
    return quantities;
  }, [editing]);
  const availableFor = (line: PoLine) => line.quantity - (line.remissioned - (ownQuantities.get(line.id) ?? 0));

  // Lines of active POs of the client, plus the lines this remission already has (a closed PO
  // keeps the lines it delivered).
  const clientPoLines = React.useMemo(() => poLines.filter((line) => line.customerId === form.customerId && (line.poStatus === 'active' || editing?.lines.some((entry) => entry.poItemId === line.id))), [poLines, form.customerId, editing]);
  const clientPurchaseOrders = React.useMemo(() => {
    const groups = new Map<string, { id: string; reference: string; lines: PoLine[] }>();
    clientPoLines.forEach((line) => {
      const group = groups.get(line.purchaseOrderId) ?? { id: line.purchaseOrderId, reference: `${line.poReference}${line.revisionNumber ? ` · Rev ${line.revisionNumber}` : ''}`, lines: [] };
      group.lines.push(line);
      groups.set(line.purchaseOrderId, group);
    });
    return Array.from(groups.values());
  }, [clientPoLines]);
  const poLineById = React.useMemo(() => new Map(poLines.map((line) => [line.id, line])), [poLines]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(customerFilter));
    setFormFile(null);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (remission: Remission) => {
    setEditing(remission);
    setForm({
      customerId: remission.customerId,
      folio: remission.folio,
      date: remission.date,
      shipTo: remission.shipTo,
      receivedBy: remission.receivedBy,
      notes: remission.notes,
      lines: remission.lines.map((line) => newFormLine(line.poItemId, String(line.quantity))),
    });
    setFormFile(null);
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    if (formSaving) return;
    setFormOpen(false);
    setFormFile(null);
  };

  const updateForm = <Key extends keyof RemissionForm>(key: Key, value: RemissionForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormError('');
  };

  const updateLine = (key: string, patch: Partial<FormLine>) => {
    setForm((current) => ({ ...current, lines: current.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) }));
    setFormError('');
  };

  const pickPoLine = (key: string, poItemId: string) => {
    const poLine = poLineById.get(poItemId);
    updateLine(key, { poItemId, quantity: poLine ? String(Math.max(availableFor(poLine), 0)) : '' });
  };

  // Adds every line of the PO that still has pieces to remission and is not on the form yet.
  const addPurchaseOrderLines = (purchaseOrderId: string) => {
    const group = clientPurchaseOrders.find((entry) => entry.id === purchaseOrderId);
    if (!group) return;
    setForm((current) => {
      const kept = current.lines.filter((line) => line.poItemId);
      const additions = group.lines
        .filter((line) => availableFor(line) > 0 && !kept.some((entry) => entry.poItemId === line.id))
        .map((line) => newFormLine(line.id, String(availableFor(line))));
      const lines = [...kept, ...additions];
      return { ...current, lines: lines.length ? lines : current.lines };
    });
    setFormError('');
  };

  const removeLine = (key: string) => {
    setForm((current) => ({ ...current, lines: current.lines.length > 1 ? current.lines.filter((line) => line.key !== key) : current.lines }));
  };

  const formPieces = form.lines.reduce((sum, line) => sum + (parseNumber(line.quantity) || 0), 0);
  const formPreviewUrl = formFileUrl || (editing && editing.id === selected?.id ? viewer.url : '');
  const formPreviewIsPdf = formFile ? getDocumentMimeType(formFile) === 'application/pdf' : editing ? isPdfFile(editing) : false;

  const saveRemission = async (event: React.FormEvent) => {
    event.preventDefault();
    if (formSaving) return;
    const folio = form.folio.trim();
    if (!form.customerId) return setFormError('Select the client.');
    if (!folio) return setFormError('Enter the remission folio.');
    if (!form.date) return setFormError('Enter the remission date.');
    const duplicate = remissions.find((remission) => remission.id !== editing?.id && remission.folio.toLowerCase() === folio.toLowerCase());
    if (duplicate) return setFormError(`Remission ${duplicate.folio} is already registered.`);
    const items = form.lines.map((line) => ({ purchase_order_item_id: line.poItemId, quantity: parseNumber(line.quantity) }));
    for (const [index, item] of items.entries()) {
      const poLine = poLineById.get(item.purchase_order_item_id);
      if (!poLine) return setFormError(`Item ${index + 1} needs a PO line.`);
      if (items.findIndex((entry) => entry.purchase_order_item_id === item.purchase_order_item_id) !== index) return setFormError(`Item ${index + 1} repeats PO ${poLine.poReference} line ${poLine.lineNumber}.`);
      if (!(item.quantity > 0)) return setFormError(`Item ${index + 1} needs a quantity greater than zero.`);
      // A cancelled remission does not count, so its lines are only checked when it is reactivated.
      if (editing?.status !== 'cancelled' && item.quantity > availableFor(poLine)) return setFormError(`Item ${index + 1}: PO ${poLine.poReference} line ${poLine.lineNumber} has ${formatQuantity(Math.max(availableFor(poLine), 0))} pieces left to remission.`);
    }
    if (!formFile && !editing) return setFormError('Attach the remission file.');
    if (formFile && !isAcceptedDocument(formFile)) return setFormError('The remission file must be a PDF or a photo.');

    setFormSaving(true);
    setFormError('');
    const remissionId = editing?.id ?? crypto.randomUUID();
    let uploadedPath = '';
    try {
      let file = editing ? { name: editing.fileName, path: editing.filePath, type: editing.fileType } : null;
      if (formFile) {
        file = await uploadRegistryFile(organizationId, 'remissions', remissionId, formFile);
        uploadedPath = file.path;
      }
      if (!file) throw new Error('Attach the remission file.');
      const { error: saveError } = await supabase.rpc('save_mes_customer_remission', {
        p_organization_id: organizationId,
        p_remission_id: editing?.id ?? null,
        p_remission: {
          id: remissionId,
          customer_id: form.customerId,
          remission_folio: folio,
          remission_date: form.date,
          ship_to: form.shipTo.trim(),
          received_by: form.receivedBy.trim(),
          notes: form.notes.trim(),
          file_name: file.name,
          file_path: file.path,
          file_type: file.type,
        },
        p_items: items,
      });
      if (saveError) throw saveError;
      if (editing && uploadedPath && editing.filePath !== uploadedPath) await removeRegistryFiles([editing.filePath]);
      setFormOpen(false);
      setFormFile(null);
      setSearch('');
      if (customerFilter && customerFilter !== form.customerId) setCustomerFilter('');
      focusRef.current = remissionId;
      await loadRemissions();
    } catch (saveError) {
      if (uploadedPath) await removeRegistryFiles([uploadedPath]);
      console.error('Unable to save remission', saveError);
      const message = errorMessage(saveError, 'Unable to save the remission.');
      setFormError(message.includes('mes_customer_remissions_folio_uidx') ? 'A remission with that folio is already registered.' : message);
    } finally {
      setFormSaving(false);
    }
  };

  const toggleStatus = async (remission: Remission) => {
    if (statusSaving) return;
    const nextStatus: RemissionStatus = remission.status === 'active' ? 'cancelled' : 'active';
    if (nextStatus === 'cancelled' && !window.confirm(`Cancel remission ${remission.folio}? Its pieces go back to pending on their POs${remission.productionOrders.length ? ' and it is unlinked from its production orders in Order-to-Cash' : ''}.`)) return;
    setStatusSaving(true);
    const { error: statusError } = await supabase.from('mes_customer_remissions').update({ status: nextStatus }).eq('id', remission.id).eq('organization_id', organizationId);
    setStatusSaving(false);
    if (statusError) {
      setError(statusError.message);
      return;
    }
    setError('');
    focusRef.current = remission.id;
    await loadRemissions();
  };

  return (
    <section className="mes-workspace-panel otc-workspace">
      <header className="otc-compact-header">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/intelligence')}><ArrowLeft size={16} /> Ops Intelligence</button>
        <div>
          <p className="eyebrow">OPS INTELLIGENCE / OTC</p>
          <h1>Remissions</h1>
          <span>Registry of the remissions issued for delivered pieces and the PO lines they deliver</span>
        </div>
        <div className="otc-header-actions">
          <button className="otc-refresh" type="button" onClick={() => void loadRemissions()} disabled={loading}><RefreshCw size={15} className={loading ? 'spinning' : ''} /> Refresh</button>
          <button className="otc-primary-action" type="button" onClick={openCreate} disabled={!customers.length}><Plus size={15} /> New Remission</button>
        </div>
      </header>

      {error ? <div className="otc-feedback error" role="alert">{error}</div> : null}

      <div className="otc-toolbar">
        <div className="otc-filter-chips" role="tablist" aria-label="Remission status">
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
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Folio, PO, invoice or Tool ID" aria-label="Search remissions" />
          </label>
        </div>
      </div>

      <div className="supplier-transfer-registry-layout otc-layout">
        <section className="supplier-active-transfers">
          <div><span><Truck size={16} /> Remission Registry</span><strong>{filteredRemissions.length} shown</strong></div>
          <div className="supplier-active-transfer-list">
            {filteredRemissions.map((remission) => (
              <article
                className={remission.id === selectedId ? 'active' : ''}
                key={remission.id}
                role="button"
                tabIndex={0}
                aria-pressed={remission.id === selectedId}
                onClick={() => setSelectedId(remission.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(remission.id);
                  }
                }}
              >
                <span className="supplier-active-transfer-select">
                  <span className="supplier-transfer-registry-icon otc-registry-icon"><Truck size={18} /></span>
                  <span className="supplier-transfer-registry-copy">
                    <strong>{remission.folio}</strong>
                    <em>{remission.customerName}</em>
                    <small>{formatQuantity(remission.pieces)} pcs · PO {remission.purchaseOrders.join(', ') || '—'}</small>
                  </span>
                </span>
                <div className="supplier-transfer-registry-meta">
                  <span className="otc-registry-date"><CalendarDays size={14} /> {formatDate(remission.date)}</span>
                  <span className={`otc-status ${statusClass(remission)}`}>{statusText(remission)}</span>
                </div>
              </article>
            ))}
            {!remissions.length && loading ? <div className="supplier-empty-note">Loading remissions...</div> : null}
            {!remissions.length && !loading ? <div className="supplier-empty-note">No remissions registered yet. Use New Remission to add the first one.</div> : null}
            {remissions.length > 0 && !filteredRemissions.length ? <div className="supplier-empty-note">No remissions in this tab match these filters.</div> : null}
          </div>
        </section>

        <section className="supplier-transfer-combined-panel">
          {selected ? (
            <div className="supplier-selected-transfer-summary">
              <div className="supplier-transfer-detail-hero otc-detail-hero">
                <span className="supplier-transfer-detail-icon"><Truck size={24} /></span>
                <div><small>Remission</small><h3>{selected.folio}</h3><p>{selected.customerName} · {selected.lines.length} {selected.lines.length === 1 ? 'line' : 'lines'} · {formatQuantity(selected.pieces)} pieces</p></div>
                <div className="otc-hero-controls">
                  <span className={`otc-status ${statusClass(selected)}`}>{statusText(selected)}</span>
                </div>
              </div>
              <div className="otc-po-actions">
                <button type="button" onClick={() => openEdit(selected)}><Pencil size={15} /> Edit</button>
                <button type="button" onClick={() => void toggleStatus(selected)} disabled={statusSaving}>
                  {selected.status === 'active' ? <><Ban size={15} /> Cancel remission</> : <><RotateCcw size={15} /> Reactivate</>}
                </button>
              </div>
              <div className="supplier-selected-transfer-grid otc-identification">
                <span><b>Remission folio</b>{selected.folio}</span>
                <span><b>Client</b>{selected.customerName}</span>
                <span><b>Date</b>{formatDate(selected.date)}</span>
                <span><b>Received by</b>{selected.receivedBy || 'Not specified'}</span>
                <span className="otc-status-box po-total"><b>Invoiced</b>{formatQuantity(selected.invoicedPieces)} of {formatQuantity(selected.pieces)}{selected.status === 'cancelled' && selected.cancelledAt ? <small>Cancelled {formatDate(selected.cancelledAt)}</small> : null}</span>
              </div>
              <div className="otc-po-facts">
                <span><b>Ship to</b>{selected.shipTo || '—'}</span>
                <span><b>Pieces to invoice</b>{formatQuantity(Math.max(selected.pieces - selected.invoicedPieces, 0))}</span>
                <span><b>Value to invoice</b>{selected.status === 'cancelled' ? '—' : formatMoneyByCurrency(selected.pendingValue)}</span>
              </div>
              <div className="otc-po-linked-orders">
                <b>Purchase orders</b>
                <span className="otc-tool-chips">{selected.purchaseOrders.map((reference) => <em key={reference}>{reference}</em>)}</span>
              </div>
              <div className="otc-po-linked-orders">
                <b>Invoices</b>
                {selected.invoices.length
                  ? <span className="otc-tool-chips">{selected.invoices.map((folio) => <em key={folio}>{folio}</em>)}</span>
                  : <small>No active invoice bills this remission yet.</small>}
              </div>
              <div className="otc-po-linked-orders">
                <b>Production orders</b>
                {selected.productionOrders.length
                  ? <span className="otc-tool-chips">{selected.productionOrders.map((orderNumber) => <em key={orderNumber}>{orderNumber}</em>)}</span>
                  : <small>Not linked to any production order yet. Link it from step 3 of Order-to-Cash.</small>}
              </div>
              {selected.notes ? <p className="otc-po-notes">{selected.notes}</p> : null}

              <div className="otc-po-body">
                <section className="otc-po-items" aria-label="Remission lines">
                  <header><strong>Lines</strong><span>{selected.lines.length}</span></header>
                  <div className="otc-po-table-wrap">
                    <table>
                      <thead>
                        <tr><th>#</th><th>PO line</th><th>Item</th><th className="numeric">Qty</th><th className="numeric" title="Pieces billed by active invoices">Invoiced</th><th className="numeric">To invoice</th></tr>
                      </thead>
                      <tbody>
                        {selected.lines.map((line) => (
                          <tr key={line.id}>
                            <td>{line.lineNumber}</td>
                            <td>{line.poLine ? <><strong>{line.poLine.poReference}</strong><small className="otc-cell-note">Line {line.poLine.lineNumber}</small></> : '—'}</td>
                            <td>
                              {line.poLine?.description ? <strong>{line.poLine.description}</strong> : null}
                              {line.poLine?.toolIds.length ? <span className="otc-tool-chips">{line.poLine.toolIds.map((toolId) => <em key={toolId}>{toolId}</em>)}</span> : null}
                            </td>
                            <td className="numeric">{formatQuantity(line.quantity)}</td>
                            <td className="numeric"><span className={`otc-po-used ${line.invoiced >= line.quantity ? 'full' : line.invoiced > 0 ? 'partial' : ''}`}>{formatQuantity(line.invoiced)}</span></td>
                            <td className="numeric"><strong>{formatQuantity(Math.max(line.quantity - line.invoiced, 0))}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr><td colSpan={3}>Total</td><td className="numeric">{formatQuantity(selected.pieces)}</td><td className="numeric">{formatQuantity(selected.invoicedPieces)}</td><td className="numeric">{formatQuantity(Math.max(selected.pieces - selected.invoicedPieces, 0))}</td></tr>
                      </tfoot>
                    </table>
                  </div>
                </section>

                <section className="otc-po-viewer" aria-label="Remission document">
                  <header>
                    <FileText size={16} />
                    <span><strong title={selected.fileName}>{selected.fileName}</strong><small>Remission document</small></span>
                    {viewer.url ? (
                      <>
                        <button type="button" onClick={() => setExpanded(true)} aria-label="Expand document"><Maximize2 size={15} /></button>
                        <a href={viewer.url} target="_blank" rel="noreferrer" aria-label="Open in new tab"><Download size={15} /></a>
                      </>
                    ) : null}
                  </header>
                  <div className={`otc-po-viewer-frame ${isPdfFile(selected) ? 'pdf' : 'image'}`}>
                    {viewer.url
                      ? <DocumentFrame url={viewer.url} title={`Preview ${selected.fileName}`} isPdf={isPdfFile(selected)} />
                      : <p>{viewer.error || 'Loading document...'}</p>}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="otc-empty">
              <Truck size={30} />
              <h2>{loading ? 'Loading remissions' : 'No remission selected'}</h2>
              <p>{poLines.length ? 'Register each remission with the PO lines it delivers and its file.' : 'Register the customer purchase orders first; every remission line delivers a PO line.'}</p>
              {poLines.length
                ? <button type="button" onClick={openCreate}><Plus size={15} /> New Remission</button>
                : <button type="button" onClick={() => onNavigate(`${otcPath}/purchase-orders`)}><ShoppingCart size={15} /> Go to Purchase Orders</button>}
            </div>
          )}
        </section>
      </div>

      {formOpen ? createPortal((
        <div className="mes-modal-backdrop otc-modal-backdrop otc-po-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
          <section className="mes-order-modal otc-link-modal otc-po-modal" role="dialog" aria-modal="true" aria-labelledby="otc-remission-form-title">
            <button className="supplier-modal-close" type="button" onClick={closeForm} disabled={formSaving} aria-label="Close"><X size={18} /></button>
            <form onSubmit={saveRemission}>
              <div className="otc-po-form-head">
                <span className="otc-link-icon"><Truck size={24} /></span>
                <div>
                  <p className="eyebrow">OTC / Remissions</p>
                  <h3 id="otc-remission-form-title">{editing ? `Edit remission ${editing.folio}` : 'New Remission'}</h3>
                </div>
              </div>
              <div className="otc-po-form-layout">
                <div className="otc-po-form-fields">
                  <fieldset>
                    <legend>Identification</legend>
                    <div className="otc-po-form-grid">
                      <label className="otc-link-field wide">
                        <span>Client <b>*</b></span>
                        <select
                          value={form.customerId}
                          onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value, lines: current.customerId === event.target.value ? current.lines : [newFormLine()] }))}
                          disabled={formSaving}
                        >
                          <option value="">Select a client</option>
                          {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
                        </select>
                      </label>
                      <label className="otc-link-field">
                        <span>Remission folio <b>*</b></span>
                        <input value={form.folio} onChange={(event) => updateForm('folio', event.target.value)} placeholder="R-10452" disabled={formSaving} />
                      </label>
                      <label className="otc-link-field">
                        <span>Date <b>*</b></span>
                        <input type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} disabled={formSaving} />
                      </label>
                      <label className="otc-link-field">
                        <span>Received by</span>
                        <input value={form.receivedBy} onChange={(event) => updateForm('receivedBy', event.target.value)} disabled={formSaving} />
                      </label>
                      <label className="otc-link-field wide">
                        <span>Ship to</span>
                        <input value={form.shipTo} onChange={(event) => updateForm('shipTo', event.target.value)} placeholder="Plant or delivery address" disabled={formSaving} />
                      </label>
                      <label className="otc-link-field wide">
                        <span>Notes</span>
                        <textarea rows={2} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} disabled={formSaving} />
                      </label>
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend>Lines delivered</legend>
                    {!form.customerId ? <p className="otc-form-hint">Select the client to see the lines of its active purchase orders.</p> : null}
                    {form.customerId && !clientPurchaseOrders.length ? <p className="otc-form-hint">This client has no active purchase orders. Register one in Purchase Orders first.</p> : null}
                    {clientPurchaseOrders.length ? (
                      <div className="otc-reg-form-lines">
                        {form.lines.map((line, index) => {
                          const poLine = poLineById.get(line.poItemId);
                          const available = poLine ? availableFor(poLine) : 0;
                          const quantity = parseNumber(line.quantity);
                          return (
                            <div className="otc-reg-form-line" key={line.key}>
                              <span className="otc-po-line">{index + 1}</span>
                              <label className="otc-link-field source">
                                <span>PO line <b>*</b></span>
                                <select value={line.poItemId} onChange={(event) => pickPoLine(line.key, event.target.value)} disabled={formSaving}>
                                  <option value="">Select a PO line</option>
                                  {clientPurchaseOrders.map((group) => (
                                    <optgroup label={`PO ${group.reference}`} key={group.id}>
                                      {group.lines.map((entry) => (
                                        <option value={entry.id} key={entry.id} disabled={entry.id !== line.poItemId && form.lines.some((other) => other.poItemId === entry.id)}>
                                          L{entry.lineNumber} · {poLineLabel(entry)} · {formatQuantity(Math.max(availableFor(entry), 0))} left
                                        </option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                              </label>
                              <label className="otc-link-field quantity">
                                <span>Qty <b>*</b></span>
                                <input inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} disabled={formSaving || !line.poItemId} />
                              </label>
                              <button type="button" className="otc-po-remove" onClick={() => removeLine(line.key)} disabled={formSaving || form.lines.length === 1} aria-label={`Remove line ${index + 1}`}><Trash2 size={15} /></button>
                              {poLine ? (
                                <div className={`otc-reg-form-line-info${quantity > available ? ' over' : ''}`}>
                                  <span>PO qty <b>{formatQuantity(poLine.quantity)}</b></span>
                                  <span>Other remissions <b>{formatQuantity(poLine.remissioned - (ownQuantities.get(poLine.id) ?? 0))}</b></span>
                                  <span>Left <b>{formatQuantity(Math.max(available, 0))}</b></span>
                                  {poLine.toolIds.length ? <span className="otc-tool-chips">{poLine.toolIds.map((toolId) => <em key={toolId}>{toolId}</em>)}</span> : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className="otc-po-form-total">
                      <div className="otc-reg-form-add">
                        <button type="button" onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, newFormLine()] }))} disabled={formSaving || !clientPurchaseOrders.length}><Plus size={15} /> Add line</button>
                        {clientPurchaseOrders.length ? (
                          <label className="otc-search otc-select">
                            <ShoppingCart size={15} />
                            <select value="" onChange={(event) => addPurchaseOrderLines(event.target.value)} disabled={formSaving} aria-label="Add the pending lines of a PO">
                              <option value="">Add pending lines of a PO…</option>
                              {clientPurchaseOrders.map((group) => <option value={group.id} key={group.id}>{group.reference}</option>)}
                            </select>
                          </label>
                        ) : null}
                      </div>
                      <span><small>Pieces</small>{formatQuantity(formPieces)}</span>
                    </div>
                  </fieldset>

                  <label className={`otc-link-file${formFile ? ' selected' : ''}`}>
                    <span>Remission file {editing ? null : <b>*</b>}</span>
                    <span className="otc-link-file-drop">
                      {formFile ? <Check size={16} /> : <Upload size={16} />}
                      <span>{formFile?.name || (editing ? `Keep ${editing.fileName} or choose a new PDF or photo` : 'Choose the remission PDF or photo')}</span>
                    </span>
                    <input type="file" accept={documentAccept} disabled={formSaving} onChange={(event) => { setFormFile(event.target.files?.[0] ?? null); setFormError(''); }} />
                  </label>
                </div>

                <aside className="otc-po-form-preview" aria-label="Remission file preview">
                  {formPreviewUrl
                    ? <DocumentFrame url={formPreviewUrl} title="Remission file preview" isPdf={formPreviewIsPdf} />
                    : <p><FileText size={26} />Attach the remission file to see it here while you capture the data.</p>}
                </aside>
              </div>
              {formError ? <div className="otc-feedback error" role="alert">{formError}</div> : null}
              <div className="otc-link-actions">
                <button type="button" className="secondary" onClick={closeForm} disabled={formSaving}>Cancel</button>
                <button type="submit" disabled={formSaving}>{formSaving ? 'Saving...' : editing ? 'Save changes' : 'Register Remission'}</button>
              </div>
            </form>
          </section>
        </div>
      ), document.body) : null}

      {expanded && selected && viewer.url
        ? <DocumentPreviewModal subtitle={`Remission · ${selected.folio} · ${selected.customerName}`} title={selected.fileName} url={viewer.url} isPdf={isPdfFile(selected)} onClose={() => setExpanded(false)} />
        : null}
    </section>
  );
}
