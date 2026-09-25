import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Ban, CalendarDays, Check, Download, FileCode2, FileText, Maximize2, Pencil, Plus, Receipt, RefreshCw, RotateCcw, Search, Trash2, Truck, Upload, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import { invoiceTotals, roundMoney, sumActiveQuantities } from './otcBalances';
import { currencies, DocumentFrame, DocumentPreviewModal, SearchSelect, documentAccept, clearFocusParam, errorMessage, fetchAllRows, formatCalendarDate as formatDate, formatMoney, formatQuantity, getDocumentMimeType, isAcceptedDocument, isPdfFile, isXmlFile, openSignedFile, parseNumber, readFocusParam, removeRegistryFiles, single, todayIso, uploadRegistryFile, useSignedDocumentUrl, xmlAccept, type Currency } from './otcShared';
import { MesOrderDatePicker } from './MesWorkspaces';
import './orderToCash.css';

type InvoiceStatus = 'active' | 'cancelled';

// A remission line an invoice can bill. invoiced counts every active invoice.
type RemissionLine = {
  id: string;
  remissionId: string;
  remissionFolio: string;
  remissionStatus: string;
  customerId: string;
  lineNumber: number;
  quantity: number;
  invoiced: number;
  poReference: string;
  poLineNumber: number;
  poCurrency: string;
  poUnitPrice: number;
  description: string;
  toolIds: string[];
};

type InvoiceLine = {
  id: string;
  lineNumber: number;
  remissionItemId: string;
  source: RemissionLine | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

type Invoice = {
  id: string;
  customerId: string;
  customerName: string;
  folio: string;
  fiscalUuid: string;
  date: string;
  dueDate: string;
  currency: Currency;
  taxRate: number;
  paymentTerms: string;
  notes: string;
  status: InvoiceStatus;
  cancelledAt: string;
  fileName: string;
  filePath: string;
  fileType: string;
  xmlFileName: string;
  xmlFilePath: string;
  lines: InvoiceLine[];
  pieces: number;
  subtotal: number;
  tax: number;
  total: number;
  remissions: string[];
  purchaseOrders: string[];
  productionOrders: string[];
};

type InvoiceRow = {
  id: string;
  customer_id: string;
  invoice_folio: string;
  fiscal_uuid: string;
  invoice_date: string;
  due_date: string | null;
  currency: Currency;
  tax_rate: number | string;
  payment_terms: string;
  notes: string;
  status: InvoiceStatus;
  cancelled_at: string | null;
  file_name: string;
  file_path: string;
  file_type: string;
  xml_file_name: string;
  xml_file_path: string;
  customer: { customer_name: string } | Array<{ customer_name: string }> | null;
};

type InvoiceItemRow = { id: string; invoice_id: string; line_number: number; remission_item_id: string; quantity: number | string; unit_price: number | string; subtotal: number | string };
type RemissionRow = { id: string; customer_id: string; remission_folio: string; status: string };
type RemissionItemRow = { id: string; remission_id: string; line_number: number; purchase_order_item_id: string; quantity: number | string };
type PurchaseOrderRow = { id: string; po_reference: string; currency: string };
type PoItemRow = { id: string; purchase_order_id: string; line_number: number; description: string; tool_ids: string[] | null; unit_price: number | string };
type LinkedOrderRow = { invoice_id: string; pieces: number; production_order: { order_number: string } | Array<{ order_number: string }> | null };

type Customer = { id: string; name: string; paymentTerms: string };

type FormLine = { key: string; remissionItemId: string; quantity: string; unitPrice: string };

type InvoiceForm = {
  customerId: string;
  currency: Currency;
  folio: string;
  fiscalUuid: string;
  date: string;
  dueDate: string;
  paymentTerms: string;
  taxPercent: string;
  notes: string;
  lines: FormLine[];
};

type Props = {
  organizationId: string;
  onNavigate: (path: string) => void;
};

const otcPath = '/workspace/manufacturing-ops/intelligence/otc';
const defaultTaxPercent = '16';
const tabs: Array<{ value: InvoiceStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
];

function sortFolios(values: Iterable<string>) {
  return Array.from(new Set(values)).sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
}

function lineLabel(line: RemissionLine) {
  return line.description || line.toolIds.join(', ') || `PO line ${line.poLineNumber}`;
}

function formatPercent(rate: number) {
  return `${(rate * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

function newFormLine(remissionItemId = '', quantity = '', unitPrice = ''): FormLine {
  return { key: crypto.randomUUID(), remissionItemId, quantity, unitPrice };
}

function emptyForm(customer?: Customer): InvoiceForm {
  return { customerId: customer?.id ?? '', currency: 'USD', folio: '', fiscalUuid: '', date: todayIso(), dueDate: '', paymentTerms: customer?.paymentTerms ?? '', taxPercent: defaultTaxPercent, notes: '', lines: [newFormLine()] };
}

function lineSubtotal(line: FormLine) {
  const quantity = parseNumber(line.quantity);
  const unitPrice = parseNumber(line.unitPrice);
  return Number.isFinite(quantity) && Number.isFinite(unitPrice) ? roundMoney(quantity * unitPrice) : 0;
}

export function InvoicesWorkspace({ organizationId, onNavigate }: Props) {
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [remissionLines, setRemissionLines] = React.useState<RemissionLine[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [selectedId, setSelectedId] = React.useState('');
  // The record opened from Order-to-Cash with ?focus=<id>, until it is selected.
  const focusRef = React.useRef(readFocusParam());
  const [tab, setTab] = React.useState<InvoiceStatus>('active');
  const [customerFilter, setCustomerFilter] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [expanded, setExpanded] = React.useState(false);
  const [statusSaving, setStatusSaving] = React.useState(false);
  const [editing, setEditing] = React.useState<Invoice | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<InvoiceForm>(() => emptyForm());
  const [formFile, setFormFile] = React.useState<File | null>(null);
  const [formXml, setFormXml] = React.useState<File | null>(null);
  const [formFileUrl, setFormFileUrl] = React.useState('');
  const [formError, setFormError] = React.useState('');
  const [formSaving, setFormSaving] = React.useState(false);

  const loadInvoices = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [invoiceRows, invoiceItemRows, remissionRows, remissionItemRows, purchaseOrderRows, poItemRows, linkedRows, customerResult] = await Promise.all([
        fetchAllRows<InvoiceRow>((from, to) => supabase
          .from('mes_customer_invoices')
          .select('id, customer_id, invoice_folio, fiscal_uuid, invoice_date, due_date, currency, tax_rate, payment_terms, notes, status, cancelled_at, file_name, file_path, file_type, xml_file_name, xml_file_path, customer:mes_customers!customer_id(customer_name)')
          .eq('organization_id', organizationId)
          .order('invoice_date', { ascending: false })
          .order('id')
          .range(from, to)),
        fetchAllRows<InvoiceItemRow>((from, to) => supabase
          .from('mes_customer_invoice_items')
          .select('id, invoice_id, line_number, remission_item_id, quantity, unit_price, subtotal')
          .eq('organization_id', organizationId)
          .order('invoice_id')
          .order('line_number')
          .range(from, to)),
        fetchAllRows<RemissionRow>((from, to) => supabase
          .from('mes_customer_remissions')
          .select('id, customer_id, remission_folio, status')
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
          .select('id, po_reference, currency')
          .eq('organization_id', organizationId)
          .order('id')
          .range(from, to)),
        fetchAllRows<PoItemRow>((from, to) => supabase
          .from('mes_customer_purchase_order_items')
          .select('id, purchase_order_id, line_number, description, tool_ids, unit_price')
          .eq('organization_id', organizationId)
          .order('id')
          .range(from, to)),
        fetchAllRows<LinkedOrderRow>((from, to) => supabase
          .from('mes_order_to_cash_documents')
          .select('invoice_id, pieces, production_order:mes_production_orders!production_order_id(order_number)')
          .eq('organization_id', organizationId)
          .not('invoice_id', 'is', null)
          .order('id')
          .range(from, to)),
        supabase.from('mes_customers').select('id, customer_name, payment_terms, status').eq('organization_id', organizationId).order('customer_name'),
      ]);
      if (customerResult.error) throw new Error(customerResult.error.message);

      const statusByInvoice = new Map(invoiceRows.map((row) => [row.id, row.status]));
      const items = invoiceItemRows.map((row) => ({ ...row, quantity: Number(row.quantity) || 0, unitPrice: Number(row.unit_price) || 0, subtotal: Number(row.subtotal) || 0 }));
      const invoicedByRemissionItem = sumActiveQuantities(items, (row) => row.remission_item_id, (row) => statusByInvoice.get(row.invoice_id) === 'active');
      const remissions = new Map(remissionRows.map((row) => [row.id, row]));
      const purchaseOrders = new Map(purchaseOrderRows.map((row) => [row.id, row]));
      const poItems = new Map(poItemRows.map((row) => [row.id, row]));

      const nextRemissionLines = remissionItemRows.flatMap((row): RemissionLine[] => {
        const remission = remissions.get(row.remission_id);
        const poItem = poItems.get(row.purchase_order_item_id);
        const purchaseOrder = poItem ? purchaseOrders.get(poItem.purchase_order_id) : undefined;
        if (!remission || !poItem || !purchaseOrder) return [];
        return [{
          id: row.id,
          remissionId: remission.id,
          remissionFolio: remission.remission_folio,
          remissionStatus: remission.status,
          customerId: remission.customer_id,
          lineNumber: row.line_number,
          quantity: Number(row.quantity) || 0,
          invoiced: invoicedByRemissionItem.get(row.id) ?? 0,
          poReference: purchaseOrder.po_reference,
          poLineNumber: poItem.line_number,
          poCurrency: purchaseOrder.currency,
          poUnitPrice: Number(poItem.unit_price) || 0,
          description: poItem.description,
          toolIds: poItem.tool_ids ?? [],
        }];
      });
      const remissionLineById = new Map(nextRemissionLines.map((line) => [line.id, line]));

      const linesByInvoice = new Map<string, InvoiceLine[]>();
      items.forEach((row) => {
        const lines = linesByInvoice.get(row.invoice_id) ?? [];
        lines.push({ id: row.id, lineNumber: row.line_number, remissionItemId: row.remission_item_id, source: remissionLineById.get(row.remission_item_id) ?? null, quantity: row.quantity, unitPrice: row.unitPrice, subtotal: row.subtotal });
        linesByInvoice.set(row.invoice_id, lines);
      });
      const productionOrdersByInvoice = new Map<string, string[]>();
      linkedRows.forEach((row) => {
        const orderNumber = single(row.production_order)?.order_number;
        // Each order shows the pieces this record covers of it.
        if (orderNumber) productionOrdersByInvoice.set(row.invoice_id, [...(productionOrdersByInvoice.get(row.invoice_id) ?? []), `${orderNumber} · ${formatQuantity(Number(row.pieces) || 0)} pcs`]);
      });

      const nextInvoices = invoiceRows.map((row): Invoice => {
        const lines = linesByInvoice.get(row.id) ?? [];
        const taxRate = Number(row.tax_rate) || 0;
        const totals = invoiceTotals(lines.map((line) => line.subtotal), taxRate);
        return {
          id: row.id,
          customerId: row.customer_id,
          customerName: single(row.customer)?.customer_name ?? 'Unknown client',
          folio: row.invoice_folio,
          fiscalUuid: row.fiscal_uuid,
          date: row.invoice_date,
          dueDate: row.due_date ?? '',
          currency: row.currency,
          taxRate,
          paymentTerms: row.payment_terms,
          notes: row.notes,
          status: row.status,
          cancelledAt: row.cancelled_at ?? '',
          fileName: row.file_name,
          filePath: row.file_path,
          fileType: row.file_type,
          xmlFileName: row.xml_file_name,
          xmlFilePath: row.xml_file_path,
          lines,
          pieces: lines.reduce((sum, line) => sum + line.quantity, 0),
          ...totals,
          remissions: sortFolios(lines.flatMap((line) => (line.source ? [line.source.remissionFolio] : []))),
          purchaseOrders: sortFolios(lines.flatMap((line) => (line.source ? [line.source.poReference] : []))),
          productionOrders: sortFolios(productionOrdersByInvoice.get(row.id) ?? []),
        };
      });
      setRemissionLines(nextRemissionLines);
      setInvoices(nextInvoices);
      // Inactive clients stay listed only when an invoice already points at them.
      setCustomers((customerResult.data ?? [])
        .filter((customer) => customer.status === 'active' || nextInvoices.some((invoice) => invoice.customerId === customer.id))
        .map((customer) => ({ id: String(customer.id), name: String(customer.customer_name), paymentTerms: String(customer.payment_terms ?? '') })));
      setError('');
    } catch (loadError) {
      setError(errorMessage(loadError, 'Unable to load invoices.'));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const realtimeTables = React.useMemo(() => ([
    { table: 'mes_customer_invoices', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_invoice_items', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_remissions', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_remission_items', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_purchase_orders', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_order_to_cash_documents', filter: `organization_id=eq.${organizationId}` },
  ]), [organizationId]);

  useSupabaseRealtimeRefresh({
    channelName: `mes-invoices-live:${organizationId}`,
    tables: realtimeTables,
    onRefresh: loadInvoices,
    enabled: Boolean(organizationId),
    debounceMs: 400,
  });

  const counts = React.useMemo(() => {
    const result: Record<InvoiceStatus, number> = { active: 0, cancelled: 0 };
    invoices.forEach((invoice) => {
      if (!customerFilter || invoice.customerId === customerFilter) result[invoice.status] += 1;
    });
    return result;
  }, [invoices, customerFilter]);

  const filteredInvoices = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (invoice.status !== tab) return false;
      if (customerFilter && invoice.customerId !== customerFilter) return false;
      if (!query) return true;
      return [invoice.folio, invoice.fiscalUuid, invoice.customerName, ...invoice.remissions, ...invoice.purchaseOrders, ...invoice.productionOrders, ...invoice.lines.flatMap((line) => (line.source ? [line.source.description, ...line.source.toolIds] : []))]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [invoices, tab, customerFilter, search]);

  // Bring the record opened with ?focus=<id> into the list; the effect below selects it once it shows.
  React.useEffect(() => {
    const target = invoices.find((invoice) => invoice.id === focusRef.current);
    if (!target) return;
    setTab(target.status);
    setCustomerFilter((current) => (current && current !== target.customerId ? '' : current));
  }, [invoices]);

  // Keep the selection inside the visible tab so the detail never shows an invoice the list hides.
  React.useEffect(() => {
    const focusId = focusRef.current;
    if (focusId && filteredInvoices.some((invoice) => invoice.id === focusId)) {
      focusRef.current = '';
      clearFocusParam();
      setSelectedId(focusId);
      return;
    }
    setSelectedId((current) => (filteredInvoices.some((invoice) => invoice.id === current) ? current : filteredInvoices[0]?.id ?? ''));
  }, [filteredInvoices]);

  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? null;
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

  // Pieces of each remission line this invoice may still bill: what the line delivered minus
  // what the other active invoices already billed.
  const ownQuantities = React.useMemo(() => {
    const quantities = new Map<string, number>();
    if (editing?.status === 'active') editing.lines.forEach((line) => quantities.set(line.remissionItemId, line.quantity));
    return quantities;
  }, [editing]);
  const availableFor = (line: RemissionLine) => line.quantity - (line.invoiced - (ownQuantities.get(line.id) ?? 0));

  const customerGroups = React.useMemo(() => [{ id: 'customers', items: customers }], [customers]);
  const takenRemissionItemIds = React.useMemo(() => new Set(form.lines.map((line) => line.remissionItemId).filter(Boolean)), [form.lines]);

  const clientRemissions = React.useMemo(() => {
    const groups = new Map<string, { id: string; folio: string; lines: RemissionLine[] }>();
    remissionLines
      .filter((line) => line.customerId === form.customerId && line.remissionStatus === 'active')
      .forEach((line) => {
        const group = groups.get(line.remissionId) ?? { id: line.remissionId, folio: line.remissionFolio, lines: [] };
        group.lines.push(line);
        groups.set(line.remissionId, group);
      });
    return Array.from(groups.values());
  }, [remissionLines, form.customerId]);
  const remissionLineById = React.useMemo(() => new Map(remissionLines.map((line) => [line.id, line])), [remissionLines]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(customers.find((customer) => customer.id === customerFilter)));
    setFormFile(null);
    setFormXml(null);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (invoice: Invoice) => {
    setEditing(invoice);
    setForm({
      customerId: invoice.customerId,
      currency: invoice.currency,
      folio: invoice.folio,
      fiscalUuid: invoice.fiscalUuid,
      date: invoice.date,
      dueDate: invoice.dueDate,
      paymentTerms: invoice.paymentTerms,
      taxPercent: String(roundMoney(invoice.taxRate * 100)),
      notes: invoice.notes,
      lines: invoice.lines.map((line) => newFormLine(line.remissionItemId, String(line.quantity), String(line.unitPrice))),
    });
    setFormFile(null);
    setFormXml(null);
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    if (formSaving) return;
    setFormOpen(false);
    setFormFile(null);
    setFormXml(null);
  };

  const updateForm = <Key extends keyof InvoiceForm>(key: Key, value: InvoiceForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormError('');
  };

  const selectCustomer = (customerId: string) => {
    const customer = customers.find((entry) => entry.id === customerId);
    // Default the payment terms to the client's agreed terms unless the user already typed some.
    setForm((current) => ({ ...current, customerId, paymentTerms: current.paymentTerms || customer?.paymentTerms || '', lines: current.customerId === customerId ? current.lines : [newFormLine()] }));
    setFormError('');
  };

  const updateLine = (key: string, patch: Partial<FormLine>) => {
    setForm((current) => ({ ...current, lines: current.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) }));
    setFormError('');
  };

  // The first line picked sets the invoice currency to its PO's currency.
  const withDefaultCurrency = (current: InvoiceForm, lines: FormLine[]) => {
    const first = !current.lines.some((line) => line.remissionItemId) ? remissionLineById.get(lines.find((line) => line.remissionItemId)?.remissionItemId ?? '') : undefined;
    return { ...current, lines, currency: first && currencies.includes(first.poCurrency as Currency) ? first.poCurrency as Currency : current.currency };
  };

  const pickRemissionLine = (key: string, remissionItemId: string) => {
    const source = remissionLineById.get(remissionItemId);
    setForm((current) => withDefaultCurrency(current, current.lines.map((line) => (line.key === key
      ? { ...line, remissionItemId, quantity: source ? String(Math.max(availableFor(source), 0)) : '', unitPrice: source ? String(source.poUnitPrice) : '' }
      : line))));
    setFormError('');
  };

  // Adds every line of the remission that still has pieces to bill and is not on the form yet.
  const addRemissionLines = (remissionId: string) => {
    const group = clientRemissions.find((entry) => entry.id === remissionId);
    if (!group) return;
    setForm((current) => {
      const kept = current.lines.filter((line) => line.remissionItemId);
      const additions = group.lines
        .filter((line) => availableFor(line) > 0 && !kept.some((entry) => entry.remissionItemId === line.id))
        .map((line) => newFormLine(line.id, String(availableFor(line)), String(line.poUnitPrice)));
      const lines = [...kept, ...additions];
      return lines.length ? withDefaultCurrency(current, lines) : current;
    });
    setFormError('');
  };

  const removeLine = (key: string) => {
    setForm((current) => ({ ...current, lines: current.lines.length > 1 ? current.lines.filter((line) => line.key !== key) : current.lines }));
  };

  const taxRate = parseNumber(form.taxPercent) / 100;
  const formTotals = invoiceTotals(form.lines.map(lineSubtotal), Number.isFinite(taxRate) ? taxRate : 0);
  const formPreviewUrl = formFileUrl || (editing && editing.id === selected?.id ? viewer.url : '');
  const formPreviewIsPdf = formFile ? getDocumentMimeType(formFile) === 'application/pdf' : editing ? isPdfFile(editing) : false;

  const saveInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (formSaving) return;
    const folio = form.folio.trim();
    const fiscalUuid = form.fiscalUuid.trim().toUpperCase();
    if (!form.customerId) return setFormError('Select the client.');
    if (!folio) return setFormError('Enter the invoice folio.');
    if (!form.date) return setFormError('Enter the invoice date.');
    if (form.dueDate && form.dueDate < form.date) return setFormError('The due date cannot be before the invoice date.');
    if (!(taxRate >= 0 && taxRate <= 1)) return setFormError('The tax rate must be between 0 and 100%.');
    const duplicate = invoices.find((invoice) => invoice.id !== editing?.id && invoice.folio.toLowerCase() === folio.toLowerCase());
    if (duplicate) return setFormError(`Invoice ${duplicate.folio} is already registered.`);
    if (fiscalUuid && invoices.some((invoice) => invoice.id !== editing?.id && invoice.fiscalUuid === fiscalUuid)) return setFormError('Another invoice already has this fiscal UUID.');
    const items = form.lines.map((line) => ({ remission_item_id: line.remissionItemId, quantity: parseNumber(line.quantity), unit_price: parseNumber(line.unitPrice) }));
    for (const [index, item] of items.entries()) {
      const source = remissionLineById.get(item.remission_item_id);
      if (!source) return setFormError(`Item ${index + 1} needs a remission line.`);
      if (items.findIndex((entry) => entry.remission_item_id === item.remission_item_id) !== index) return setFormError(`Item ${index + 1} repeats remission ${source.remissionFolio} line ${source.lineNumber}.`);
      if (!(item.quantity > 0)) return setFormError(`Item ${index + 1} needs a quantity greater than zero.`);
      if (!(item.unit_price >= 0)) return setFormError(`Item ${index + 1} needs a valid unit price.`);
      // A cancelled invoice does not count, so its lines are only checked when it is reactivated.
      if (editing?.status !== 'cancelled' && item.quantity > availableFor(source)) return setFormError(`Item ${index + 1}: remission ${source.remissionFolio} line ${source.lineNumber} has ${formatQuantity(Math.max(availableFor(source), 0))} pieces left to invoice.`);
    }
    if (!formFile && !editing) return setFormError('Attach the invoice PDF.');
    if (formFile && !isAcceptedDocument(formFile)) return setFormError('The invoice file must be a PDF or a photo.');
    if (formXml && !isXmlFile(formXml)) return setFormError('The CFDI file must be an XML.');

    setFormSaving(true);
    setFormError('');
    const invoiceId = editing?.id ?? crypto.randomUUID();
    const uploadedPaths: string[] = [];
    try {
      let file = editing ? { name: editing.fileName, path: editing.filePath, type: editing.fileType } : null;
      let xml = editing?.xmlFilePath ? { name: editing.xmlFileName, path: editing.xmlFilePath } : null;
      if (formFile) {
        file = await uploadRegistryFile(organizationId, 'invoices', invoiceId, formFile);
        uploadedPaths.push(file.path);
      }
      if (formXml) {
        xml = await uploadRegistryFile(organizationId, 'invoices', invoiceId, formXml);
        uploadedPaths.push(xml.path);
      }
      if (!file) throw new Error('Attach the invoice PDF.');
      const { error: saveError } = await supabase.rpc('save_mes_customer_invoice', {
        p_organization_id: organizationId,
        p_invoice_id: editing?.id ?? null,
        p_invoice: {
          id: invoiceId,
          customer_id: form.customerId,
          invoice_folio: folio,
          fiscal_uuid: fiscalUuid,
          invoice_date: form.date,
          due_date: form.dueDate,
          currency: form.currency,
          tax_rate: taxRate,
          payment_terms: form.paymentTerms.trim(),
          notes: form.notes.trim(),
          file_name: file.name,
          file_path: file.path,
          file_type: file.type,
          xml_file_name: xml?.name ?? '',
          xml_file_path: xml?.path ?? '',
        },
        p_items: items,
      });
      if (saveError) throw saveError;
      if (editing) {
        await removeRegistryFiles([
          formFile && editing.filePath !== file.path ? editing.filePath : '',
          formXml && editing.xmlFilePath !== xml?.path ? editing.xmlFilePath : '',
        ]);
      }
      setFormOpen(false);
      setFormFile(null);
      setFormXml(null);
      setTab(editing?.status ?? 'active');
      setSearch('');
      if (customerFilter && customerFilter !== form.customerId) setCustomerFilter('');
      await loadInvoices();
      setSelectedId(invoiceId);
    } catch (saveError) {
      await removeRegistryFiles(uploadedPaths);
      console.error('Unable to save invoice', saveError);
      const message = errorMessage(saveError, 'Unable to save the invoice.');
      setFormError(message.includes('mes_customer_invoices_folio_uidx')
        ? 'An invoice with that folio is already registered.'
        : message.includes('mes_customer_invoices_fiscal_uuid_uidx') ? 'Another invoice already has this fiscal UUID.' : message);
    } finally {
      setFormSaving(false);
    }
  };

  const toggleStatus = async (invoice: Invoice) => {
    if (statusSaving) return;
    const nextStatus: InvoiceStatus = invoice.status === 'active' ? 'cancelled' : 'active';
    if (nextStatus === 'cancelled' && !window.confirm(`Cancel invoice ${invoice.folio}? Its pieces go back to pending on their remissions${invoice.productionOrders.length ? ' and it is unlinked from its production orders in Order-to-Cash' : ''}.`)) return;
    setStatusSaving(true);
    const { error: statusError } = await supabase.from('mes_customer_invoices').update({ status: nextStatus }).eq('id', invoice.id).eq('organization_id', organizationId);
    setStatusSaving(false);
    if (statusError) {
      setError(statusError.message);
      return;
    }
    setError('');
    setTab(nextStatus);
    await loadInvoices();
    setSelectedId(invoice.id);
  };

  const downloadXml = async (invoice: Invoice) => {
    try {
      await openSignedFile(invoice.xmlFilePath);
    } catch (downloadError) {
      setError(errorMessage(downloadError, 'The XML could not be opened.'));
    }
  };

  return (
    <section className="mes-workspace-panel otc-workspace">
      <header className="otc-compact-header">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/intelligence')}><ArrowLeft size={16} /> Ops Intelligence</button>
        <div>
          <p className="eyebrow">OPS INTELLIGENCE / OTC</p>
          <h1>Invoices</h1>
          <span>Registry of the invoices billed to customers and the remission lines they bill</span>
        </div>
        <div className="otc-header-actions">
          <button className="otc-refresh" type="button" onClick={() => void loadInvoices()} disabled={loading}><RefreshCw size={15} className={loading ? 'spinning' : ''} /> Refresh</button>
          <button className="otc-primary-action" type="button" onClick={openCreate} disabled={!customers.length}><Plus size={15} /> New Invoice</button>
        </div>
      </header>

      {error ? <div className="otc-feedback error" role="alert">{error}</div> : null}

      <div className="otc-toolbar">
        <div className="otc-filter-chips" role="tablist" aria-label="Invoice status">
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
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Folio, UUID, remission or PO" aria-label="Search invoices" />
          </label>
        </div>
      </div>

      <div className="supplier-transfer-registry-layout otc-layout">
        <section className="supplier-active-transfers">
          <div><span><Receipt size={16} /> Invoice Registry</span><strong>{filteredInvoices.length} shown</strong></div>
          <div className="supplier-active-transfer-list">
            {filteredInvoices.map((invoice) => (
              <article
                className={invoice.id === selectedId ? 'active' : ''}
                key={invoice.id}
                role="button"
                tabIndex={0}
                aria-pressed={invoice.id === selectedId}
                onClick={() => setSelectedId(invoice.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(invoice.id);
                  }
                }}
              >
                <span className="supplier-active-transfer-select">
                  <span className="supplier-transfer-registry-icon otc-registry-icon"><Receipt size={18} /></span>
                  <span className="supplier-transfer-registry-copy">
                    <strong>{invoice.folio}</strong>
                    <em>{invoice.customerName}</em>
                    <small>{formatQuantity(invoice.pieces)} pcs · {formatMoney(invoice.total, invoice.currency)}</small>
                  </span>
                </span>
                <div className="supplier-transfer-registry-meta">
                  <span className="otc-registry-date"><CalendarDays size={14} /> {formatDate(invoice.date)}</span>
                  <span className={`otc-status ${invoice.status === 'active' ? 'po-active' : 'doc-cancelled'}`}>{invoice.status === 'active' ? 'Active' : 'Cancelled'}</span>
                </div>
              </article>
            ))}
            {!invoices.length && loading ? <div className="supplier-empty-note">Loading invoices...</div> : null}
            {!invoices.length && !loading ? <div className="supplier-empty-note">No invoices registered yet. Use New Invoice to add the first one.</div> : null}
            {invoices.length > 0 && !filteredInvoices.length ? <div className="supplier-empty-note">{tab === 'active' ? 'No active invoices match these filters.' : 'No cancelled invoices match these filters.'}</div> : null}
          </div>
        </section>

        <section className="supplier-transfer-combined-panel">
          {selected ? (
            <div className="supplier-selected-transfer-summary">
              <div className="supplier-transfer-detail-hero otc-detail-hero">
                <span className="supplier-transfer-detail-icon"><Receipt size={24} /></span>
                <div><small>Invoice</small><h3>{selected.folio}</h3><p>{selected.customerName} · {selected.lines.length} {selected.lines.length === 1 ? 'line' : 'lines'} · {formatMoney(selected.total, selected.currency)}</p></div>
                <div className="otc-hero-controls">
                  <span className={`otc-status ${selected.status === 'active' ? 'po-active' : 'doc-cancelled'}`}>{selected.status === 'active' ? 'Active' : 'Cancelled'}</span>
                </div>
              </div>
              <div className="otc-po-actions">
                <button type="button" onClick={() => openEdit(selected)}><Pencil size={15} /> Edit</button>
                <button type="button" onClick={() => void toggleStatus(selected)} disabled={statusSaving}>
                  {selected.status === 'active' ? <><Ban size={15} /> Cancel invoice</> : <><RotateCcw size={15} /> Reactivate</>}
                </button>
              </div>
              <div className="supplier-selected-transfer-grid otc-identification">
                <span><b>Invoice folio</b>{selected.folio}{selected.fiscalUuid ? <small className="otc-cell-note mono">{selected.fiscalUuid}</small> : null}</span>
                <span><b>Client</b>{selected.customerName}</span>
                <span><b>Date</b>{formatDate(selected.date)}{selected.dueDate ? <small>Due {formatDate(selected.dueDate)}</small> : null}</span>
                <span><b>Payment terms</b>{selected.paymentTerms || 'Not specified'}</span>
                <span className="otc-status-box po-total"><b>Total</b>{formatMoney(selected.total, selected.currency)}{selected.status === 'cancelled' && selected.cancelledAt ? <small>Cancelled {formatDate(selected.cancelledAt)}</small> : null}</span>
              </div>
              <div className="otc-po-facts">
                <span><b>Subtotal</b>{formatMoney(selected.subtotal, selected.currency)}</span>
                <span><b>Tax ({formatPercent(selected.taxRate)})</b>{formatMoney(selected.tax, selected.currency)}</span>
                <span><b>Pieces</b>{formatQuantity(selected.pieces)}</span>
                <span><b>Purchase orders</b>{selected.purchaseOrders.join(', ') || '—'}</span>
              </div>
              <div className="otc-po-linked-orders">
                <b>Remissions billed</b>
                <span className="otc-tool-chips">{selected.remissions.map((folio) => <em key={folio}>{folio}</em>)}</span>
              </div>
              <div className="otc-po-linked-orders">
                <b>Production orders</b>
                {selected.productionOrders.length
                  ? <span className="otc-tool-chips">{selected.productionOrders.map((orderNumber) => <em key={orderNumber}>{orderNumber}</em>)}</span>
                  : <small>Not linked to any production order yet. Link it from step 4 of Order-to-Cash.</small>}
              </div>
              {selected.notes ? <p className="otc-po-notes">{selected.notes}</p> : null}

              <div className="otc-po-body">
                <section className="otc-po-items" aria-label="Invoice lines">
                  <header><strong>Lines</strong><span>{selected.lines.length}</span></header>
                  <div className="otc-po-table-wrap">
                    <table>
                      <thead>
                        <tr><th>#</th><th>Remission</th><th>Item</th><th className="numeric">Qty</th><th className="numeric">Unit price</th><th className="numeric">Subtotal</th></tr>
                      </thead>
                      <tbody>
                        {selected.lines.map((line) => (
                          <tr key={line.id}>
                            <td>{line.lineNumber}</td>
                            <td>{line.source ? <><strong>{line.source.remissionFolio}</strong><small className="otc-cell-note">PO {line.source.poReference} · L{line.source.poLineNumber}</small></> : '—'}</td>
                            <td>
                              {line.source?.description ? <strong>{line.source.description}</strong> : null}
                              {line.source?.toolIds.length ? <span className="otc-tool-chips">{line.source.toolIds.map((toolId) => <em key={toolId}>{toolId}</em>)}</span> : null}
                            </td>
                            <td className="numeric">{formatQuantity(line.quantity)}</td>
                            <td className="numeric">{formatMoney(line.unitPrice, selected.currency)}</td>
                            <td className="numeric"><strong>{formatMoney(line.subtotal, selected.currency)}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="otc-tfoot-minor"><td colSpan={3}>Subtotal</td><td className="numeric">{formatQuantity(selected.pieces)}</td><td /><td className="numeric">{formatMoney(selected.subtotal, selected.currency)}</td></tr>
                        <tr className="otc-tfoot-minor"><td colSpan={5}>Tax {formatPercent(selected.taxRate)}</td><td className="numeric">{formatMoney(selected.tax, selected.currency)}</td></tr>
                        <tr><td colSpan={5}>Total</td><td className="numeric">{formatMoney(selected.total, selected.currency)}</td></tr>
                      </tfoot>
                    </table>
                  </div>
                </section>

                <section className="otc-po-viewer" aria-label="Invoice document">
                  <header>
                    <FileText size={16} />
                    <span><strong title={selected.fileName}>{selected.fileName}</strong><small>{selected.xmlFileName ? `Invoice PDF · XML ${selected.xmlFileName}` : 'Invoice PDF · no XML attached'}</small></span>
                    {selected.xmlFilePath ? <button type="button" onClick={() => void downloadXml(selected)} aria-label="Open CFDI XML" title={`Open ${selected.xmlFileName}`}><FileCode2 size={15} /></button> : null}
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
              <Receipt size={30} />
              <h2>{loading ? 'Loading invoices' : tab === 'active' ? 'No active invoice selected' : 'No cancelled invoice selected'}</h2>
              <p>{remissionLines.length ? 'Register each invoice with the remission lines it bills, its PDF and its XML.' : 'Register the remissions first; every invoice line bills a remission line.'}</p>
              {remissionLines.length
                ? <button type="button" onClick={openCreate}><Plus size={15} /> New Invoice</button>
                : <button type="button" onClick={() => onNavigate(`${otcPath}/remissions`)}><Truck size={15} /> Go to Remissions</button>}
            </div>
          )}
        </section>
      </div>

      {formOpen ? createPortal((
        <div className="mes-modal-backdrop otc-modal-backdrop otc-po-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
          <section className="mes-order-modal otc-link-modal otc-po-modal" role="dialog" aria-modal="true" aria-labelledby="otc-invoice-form-title">
            <button className="supplier-modal-close" type="button" onClick={closeForm} disabled={formSaving} aria-label="Close"><X size={18} /></button>
            <form onSubmit={saveInvoice}>
              <div className="otc-po-form-head">
                <span className="otc-link-icon"><Receipt size={24} /></span>
                <div>
                  <p className="eyebrow">OTC / Invoices</p>
                  <h3 id="otc-invoice-form-title">{editing ? `Edit invoice ${editing.folio}` : 'New Invoice'}</h3>
                </div>
              </div>
              <div className="otc-po-form-layout">
                <div className="otc-po-form-fields">
                  <fieldset>
                    <legend>Identification</legend>
                    <div className="otc-po-form-grid">
                      <div className="otc-link-field wide">
                        <span>Client <b>*</b></span>
                        <SearchSelect<Customer>
                          groups={customerGroups}
                          currentId={form.customerId}
                          placeholder="Search a client"
                          emptyText="No clients registered."
                          disabled={formSaving}
                          selectedLabel={(customer) => customer.name}
                          searchValues={(customer) => [customer.name]}
                          renderItem={(customer) => <span className="otc-po-picker-main"><strong>{customer.name}</strong></span>}
                          onPick={selectCustomer}
                        />
                      </div>
                      <label className="otc-link-field">
                        <span>Invoice folio <b>*</b></span>
                        <input value={form.folio} onChange={(event) => updateForm('folio', event.target.value)} placeholder="A-2231" disabled={formSaving} />
                      </label>
                      <label className="otc-link-field wide-2">
                        <span>Fiscal UUID (CFDI)</span>
                        <input value={form.fiscalUuid} onChange={(event) => updateForm('fiscalUuid', event.target.value)} placeholder="6F9619FF-8B86-D011-B42D-00C04FC964FF" disabled={formSaving} />
                      </label>
                      <div className="otc-link-field">
                        <span>Invoice date <b>*</b></span>
                        <MesOrderDatePicker id="otc-invoice-date" value={form.date} onChange={(value) => updateForm('date', value)} />
                      </div>
                      <div className="otc-link-field">
                        <span className="otc-date-label">
                          Due date
                          {/* The due date is optional; the yvimo picker has no way to empty it. */}
                          {form.dueDate ? <button type="button" className="otc-date-clear" onClick={() => updateForm('dueDate', '')} disabled={formSaving}>Clear</button> : null}
                        </span>
                        <MesOrderDatePicker id="otc-invoice-due-date" value={form.dueDate} placeholder="No due date" onChange={(value) => updateForm('dueDate', value)} />
                      </div>
                      <label className="otc-link-field">
                        <span>Payment terms</span>
                        <input value={form.paymentTerms} onChange={(event) => updateForm('paymentTerms', event.target.value)} disabled={formSaving} />
                      </label>
                      <label className="otc-link-field">
                        <span>Currency <b>*</b></span>
                        <select value={form.currency} onChange={(event) => updateForm('currency', event.target.value as Currency)} disabled={formSaving}>
                          {currencies.map((currency) => <option value={currency} key={currency}>{currency}</option>)}
                        </select>
                      </label>
                      <label className="otc-link-field">
                        <span>Tax rate (IVA %) <b>*</b></span>
                        <input inputMode="decimal" value={form.taxPercent} onChange={(event) => updateForm('taxPercent', event.target.value)} disabled={formSaving} />
                      </label>
                      <label className="otc-link-field wide">
                        <span>Notes</span>
                        <textarea rows={2} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} disabled={formSaving} />
                      </label>
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend>Lines billed</legend>
                    {!form.customerId ? <p className="otc-form-hint">Select the client to see the lines of its active remissions.</p> : null}
                    {form.customerId && !clientRemissions.length ? <p className="otc-form-hint">This client has no active remissions. Register one in Remissions first.</p> : null}
                    {clientRemissions.length ? (
                      <div className="otc-reg-form-lines">
                        {form.lines.map((line, index) => {
                          const source = remissionLineById.get(line.remissionItemId);
                          const available = source ? availableFor(source) : 0;
                          const quantity = parseNumber(line.quantity);
                          return (
                            <div className="otc-reg-form-line priced" key={line.key}>
                              <span className="otc-po-line">{index + 1}</span>
                              <div className="otc-link-field source">
                                <span>Remission line <b>*</b></span>
                                <SearchSelect<RemissionLine>
                                  groups={clientRemissions.map((group) => ({
                                    id: group.id,
                                    label: `Remission ${group.folio}`,
                                    // Lines already on another line of the form are left out.
                                    items: group.lines.filter((entry) => entry.id === line.remissionItemId || !takenRemissionItemIds.has(entry.id)),
                                  }))}
                                  currentId={line.remissionItemId}
                                  placeholder="Search remission, PO, line or tool ID"
                                  emptyText="No remission lines left to add."
                                  disabled={formSaving}
                                  selectedLabel={(entry) => `${entry.remissionFolio} · L${entry.lineNumber} · ${entry.toolIds.length ? entry.toolIds.join(', ') : lineLabel(entry)}`}
                                  searchValues={(entry, group) => [group.label ?? '', `L${entry.lineNumber}`, `PO ${entry.poReference}`, `L${entry.poLineNumber}`, entry.description, ...entry.toolIds]}
                                  renderItem={(entry) => (
                                    <>
                                      <span className="otc-po-picker-main">
                                        <strong>L{entry.lineNumber} · {entry.description || `PO line ${entry.poLineNumber}`}</strong>
                                        <small className="otc-po-picker-tools">{entry.toolIds.length ? entry.toolIds.join(', ') : 'No tool ID'}</small>
                                        <small>PO {entry.poReference} · Line {entry.poLineNumber}</small>
                                      </span>
                                      <em>{formatQuantity(Math.max(availableFor(entry), 0))} left</em>
                                    </>
                                  )}
                                  onPick={(remissionItemId) => pickRemissionLine(line.key, remissionItemId)}
                                />
                              </div>
                              <label className="otc-link-field quantity">
                                <span>Qty <b>*</b></span>
                                <input inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} disabled={formSaving || !line.remissionItemId} />
                              </label>
                              <label className="otc-link-field price">
                                <span>Unit price <b>*</b></span>
                                <input inputMode="decimal" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} placeholder="0.00" disabled={formSaving || !line.remissionItemId} />
                              </label>
                              <span className="otc-po-subtotal"><small>Subtotal</small>{formatMoney(lineSubtotal(line), form.currency)}</span>
                              <button type="button" className="otc-po-remove" onClick={() => removeLine(line.key)} disabled={formSaving || form.lines.length === 1} aria-label={`Remove line ${index + 1}`}><Trash2 size={15} /></button>
                              {source ? (
                                <div className={`otc-reg-form-line-info${quantity > available ? ' over' : ''}`}>
                                  <span>Delivered <b>{formatQuantity(source.quantity)}</b></span>
                                  <span>Other invoices <b>{formatQuantity(source.invoiced - (ownQuantities.get(source.id) ?? 0))}</b></span>
                                  <span>Left <b>{formatQuantity(Math.max(available, 0))}</b></span>
                                  <span>PO price <b>{formatMoney(source.poUnitPrice, source.poCurrency)}</b></span>
                                  {source.poCurrency !== form.currency ? <span className="warn">PO in {source.poCurrency}</span> : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className="otc-po-form-total">
                      <div className="otc-reg-form-add">
                        <button type="button" onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, newFormLine()] }))} disabled={formSaving || !clientRemissions.length}><Plus size={15} /> Add line</button>
                        {clientRemissions.length ? (
                          <label className="otc-search otc-select">
                            <Truck size={15} />
                            <select value="" onChange={(event) => addRemissionLines(event.target.value)} disabled={formSaving} aria-label="Add the pending lines of a remission">
                              <option value="">Add pending lines of a remission…</option>
                              {clientRemissions.map((group) => <option value={group.id} key={group.id}>{group.folio}</option>)}
                            </select>
                          </label>
                        ) : null}
                      </div>
                      <span className="otc-reg-form-totals">
                        <small>Subtotal <b>{formatMoney(formTotals.subtotal, form.currency)}</b></small>
                        <small>Tax <b>{formatMoney(formTotals.tax, form.currency)}</b></small>
                        <span><small>Total</small>{formatMoney(formTotals.total, form.currency)}</span>
                      </span>
                    </div>
                  </fieldset>

                  <div className="otc-reg-form-files">
                    <label className={`otc-link-file${formFile ? ' selected' : ''}`}>
                      <span>Invoice PDF {editing ? null : <b>*</b>}</span>
                      <span className="otc-link-file-drop">
                        {formFile ? <Check size={16} /> : <Upload size={16} />}
                        <span>{formFile?.name || (editing ? `Keep ${editing.fileName} or choose a new PDF` : 'Choose the invoice PDF')}</span>
                      </span>
                      <input type="file" accept={documentAccept} disabled={formSaving} onChange={(event) => { setFormFile(event.target.files?.[0] ?? null); setFormError(''); }} />
                    </label>
                    <label className={`otc-link-file${formXml ? ' selected' : ''}`}>
                      <span>CFDI XML</span>
                      <span className="otc-link-file-drop">
                        {formXml ? <Check size={16} /> : <FileCode2 size={16} />}
                        <span>{formXml?.name || (editing?.xmlFileName ? `Keep ${editing.xmlFileName} or choose a new XML` : 'Choose the XML (optional)')}</span>
                      </span>
                      <input type="file" accept={xmlAccept} disabled={formSaving} onChange={(event) => { setFormXml(event.target.files?.[0] ?? null); setFormError(''); }} />
                    </label>
                  </div>
                </div>

                <aside className="otc-po-form-preview" aria-label="Invoice file preview">
                  {formPreviewUrl
                    ? <DocumentFrame url={formPreviewUrl} title="Invoice file preview" isPdf={formPreviewIsPdf} />
                    : <p><FileText size={26} />Attach the invoice PDF to see it here while you capture the data.</p>}
                </aside>
              </div>
              {formError ? <div className="otc-feedback error" role="alert">{formError}</div> : null}
              <div className="otc-link-actions">
                <button type="button" className="secondary" onClick={closeForm} disabled={formSaving}>Cancel</button>
                <button type="submit" disabled={formSaving}>{formSaving ? 'Saving...' : editing ? 'Save changes' : 'Register Invoice'}</button>
              </div>
            </form>
          </section>
        </div>
      ), document.body) : null}

      {expanded && selected && viewer.url
        ? <DocumentPreviewModal subtitle={`Invoice · ${selected.folio} · ${selected.customerName}`} title={selected.fileName} url={viewer.url} isPdf={isPdfFile(selected)} onClose={() => setExpanded(false)} />
        : null}
    </section>
  );
}
