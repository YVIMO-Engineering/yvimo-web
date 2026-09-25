import { supabase } from '../lib/supabaseClient';
import { fetchAllRows, single } from './otcShared';

// The production orders in Order-to-Cash and the documents linked to each stage. Shared by the
// Order-to-Cash workspace and the Reconciliation view.

export type DocumentStage = 'purchase-order' | 'remission' | 'invoice';
export type OtcStatus = DocumentStage | 'completed';

export type OtcDocument = {
  id: string;
  productionOrderId: string;
  stage: DocumentStage;
  folio: string;
  fileName: string;
  filePath: string;
  fileType: string;
  uploadedAt: string;
  // The PO, remission or invoice of the registry this document comes from; empty for a file
  // uploaded directly in Order-to-Cash before the registries existed.
  registryId: string;
};

export type OtcOrder = {
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
  remission_id: string | null;
  invoice_id: string | null;
};

// OTC went live in September 2026. Orders created before then were already billed outside
// the system, so they count as completed instead of showing up as pending paperwork.
export const otcStartDate = new Date(2026, 8, 1);
export const legacyNotice = 'This order was processed before the OTC system was implemented (September 2026). Its administrative steps are considered complete.';

export function getStatus(documents: OtcOrder['documents']): OtcStatus {
  if (!documents['purchase-order']) return 'purchase-order';
  if (!documents.remission) return 'remission';
  if (!documents.invoice) return 'invoice';
  return 'completed';
}

export async function fetchOtcOrders(organizationId: string): Promise<OtcOrder[]> {
  const [itemRows, documentRows] = await Promise.all([
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
      .select('id, production_order_id, stage, folio, file_name, file_path, file_type, uploaded_at, purchase_order_id, remission_id, invoice_id')
      .eq('organization_id', organizationId)
      .order('id')
      .range(from, to)),
  ]);

  const documentsByOrder = new Map<string, OtcOrder['documents']>();
  documentRows.forEach((row) => {
    const documents = documentsByOrder.get(row.production_order_id) ?? {};
    documents[row.stage] = {
      id: row.id,
      productionOrderId: row.production_order_id,
      stage: row.stage,
      folio: row.folio,
      fileName: row.file_name,
      filePath: row.file_path,
      fileType: row.file_type,
      uploadedAt: row.uploaded_at,
      registryId: row.purchase_order_id ?? row.remission_id ?? row.invoice_id ?? '',
    };
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
  return Array.from(ordersById.values()).sort((left, right) => right.receivedAt.localeCompare(left.receivedAt) || right.orderNumber.localeCompare(left.orderNumber));
}
