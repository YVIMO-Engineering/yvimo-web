import React from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Pencil,
  Eye,
  FileText,
  PackageCheck,
  Plus,
  Trash2,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { resolveGooglePlacesAddressMatch, searchGooglePlacesAddressMatches, type GooglePlacesAddressMatch } from '../lib/maps/googlePlacesAddressLookup';
import { supabase } from '../lib/supabaseClient';
import { mockProductionOrders, mockSupplierTransfers, mockSuppliers } from './mesMockData';
import type {
  ProductionOrder,
  Supplier,
  SupplierDocument,
  SupplierDocumentType,
  SupplierTransfer,
  SupplierTransferStatus,
  SupplierVoucher,
} from './mesTypes';

type SupplierOperationsWorkspaceProps = {
  onNavigate: (path: string) => void;
  organizationId: string;
  activeTab: SupplierContextTab;
  onActiveTabChange: (tab: SupplierContextTab) => void;
};

type SupplierModalMode = 'create' | 'edit-transfer' | 'supplier' | 'checkout' | 'checkin' | 'document' | 'document-preview' | 'supplier-pdf-preview' | 'voucher' | null;
export type SupplierContextTab = 'dashboard' | 'transfers' | 'suppliers' | 'vouchers-docs' | 'check-in-out';

type SupplierPdfDocument = {
  label: string;
  fileName: string;
  fileUrl: string;
};

type SupplierRecord = Supplier & {
  fiscalDocument?: SupplierPdfDocument;
  bankingDocument?: SupplierPdfDocument;
};

type SupplierTransferFormState = {
  productionOrder: string;
  supplierId: string;
  externalProcess: string;
  partNumber: string;
  lotSerial: string;
  quantityToSend: string;
  expectedReturnDate: string;
  requiredDocuments: SupplierDocumentType[];
  notes: string;
};

type CheckoutFormState = {
  quantitySent: string;
  notes: string;
  confirmed: boolean;
  attachmentFile: File | null;
};

type CheckinFormState = {
  quantityReceived: string;
  quantityAccepted: string;
  quantityRejected: string;
  receivedDocuments: SupplierDocumentType[];
  attachmentFile: File | null;
  notes: string;
};

type DocumentFormState = {
  documentType: SupplierDocumentType;
  fileName: string;
  approvalStatus: SupplierDocument['approvalStatus'];
  file: File | null;
};

type SupplierFormState = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  approvedStatus: Supplier['approvedStatus'];
  processCapabilities: string[];
  capability: string;
  newCapabilityName: string;
  newCapabilityColor: string;
  fiscalDocumentFile: File | null;
  bankingDocumentFile: File | null;
  notes: string;
};

type SupplierDocsFilters = {
  transferSearch: string;
  supplierSearch: string;
  capability: string;
  workCenter: string;
  dateFrom: string;
  dateTo: string;
  shift: string;
  showCompletedOrders: boolean;
  onlyShowCompletedOrders: boolean;
};

type AddressLookupState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

type AddressLookupMatch = GooglePlacesAddressMatch;

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight?: number;
};

const supplierDocumentOptions: Array<{ value: SupplierDocumentType; label: string }> = [
  { value: 'certificate', label: 'Certificate' },
  { value: 'inspection-report', label: 'Inspection Report' },
  { value: 'process-report', label: 'Process Report' },
  { value: 'packing-slip', label: 'Packing Slip' },
  { value: 'other', label: 'Other' },
];

const supplierCapabilityColors: Record<string, string> = {
  'Heat treatment': '#f97316',
  'Hardness testing': '#0ea5e9',
  Certification: '#16a34a',
  'Powder coating': '#8b5cf6',
  'E-coat': '#0891b2',
  'Packing slips': '#ca8a04',
  'Lab testing': '#db2777',
  'Material reports': '#2563eb',
  'Dimensional inspection': '#7c3aed',
  'Zinc plating': '#64748b',
  'Black oxide': '#334155',
  Passivation: '#059669',
};

const supplierCapabilityFallbackColors = ['#f97316', '#0ea5e9', '#16a34a', '#8b5cf6', '#db2777', '#0891b2', '#ca8a04', '#64748b'];
const registerNewSupplierCapabilityValue = '__register_new_supplier_capability__';
const supplierCapabilityColorOptions = ['#ff8a1f', '#1d4ed8', '#00a676', '#dc2626', '#8b5cf6', '#f59e0b', '#14b8a6', '#ec4899'];

const defaultTransferForm: SupplierTransferFormState = {
  productionOrder: mockProductionOrders[0]?.orderNumber ?? '',
  supplierId: mockSuppliers.find((supplier) => supplier.approvedStatus === 'approved')?.id ?? mockSuppliers[0]?.id ?? '',
  externalProcess: 'Heat treatment',
  partNumber: mockProductionOrders[0]?.partNumber ?? '',
  lotSerial: '',
  quantityToSend: '',
  expectedReturnDate: '',
  requiredDocuments: ['certificate'],
  notes: '',
};

const defaultSupplierForm: SupplierFormState = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  approvedStatus: 'pending-approval',
  processCapabilities: [],
  capability: '',
  newCapabilityName: '',
  newCapabilityColor: supplierCapabilityColorOptions[0],
  fiscalDocumentFile: null,
  bankingDocumentFile: null,
  notes: '',
};

const defaultSupplierDocsFilters: SupplierDocsFilters = {
  transferSearch: '',
  supplierSearch: '',
  capability: '',
  workCenter: '',
  dateFrom: '',
  dateTo: '',
  shift: '',
  showCompletedOrders: true,
  onlyShowCompletedOrders: false,
};

const supplierOperationsDemoMode = import.meta.env.VITE_SUPPLIERS_DEMO_MODE === 'true';
const supplierFilesBucket = 'mes-supplier-files';
const supplierFileInputType = 'file';
const supplierDocumentAccept = 'application/pdf,image/*';
const supplierBackendStatusClass = 'supplier-backend-status';
const supplierAlertRole = 'alert';
const supplierButtonType = 'button';
const supplierFileUploadClass = 'supplier-file-upload-control';
const supplierNoFileText = 'No file selected';
const formatSupplierLabel = (value: string) => value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const getSupplierInitials = (name: string) => name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();

const getDefaultSupplierCapabilityColor = (capability: string) => {
  if (supplierCapabilityColors[capability]) return supplierCapabilityColors[capability];
  const colorIndex = Array.from(capability).reduce((total, character) => total + character.charCodeAt(0), 0) % supplierCapabilityFallbackColors.length;
  return supplierCapabilityFallbackColors[colorIndex];
};

const getSupplierTransferShift = (transfer: SupplierTransfer) => {
  const voucherTimestamp = transfer.vouchers.find((voucher) => voucher.checkoutDate || voucher.receivedDate)?.checkoutDate
    ?? transfer.vouchers.find((voucher) => voucher.receivedDate)?.receivedDate
    ?? transfer.updatedAt
    ?? transfer.createdAt;
  const hour = new Date(voucherTimestamp).getHours();
  if (hour >= 6 && hour < 14) return '1st';
  if (hour >= 14 && hour < 22) return '2nd';
  return '3rd';
};

const getSupplierTransferWorkCenter = (transfer: SupplierTransfer, productionOrders: ProductionOrder[]) => (
  productionOrders.find((order) => order.orderNumber === transfer.productionOrder)?.assignedWorkCenter || 'Unassigned'
);

function normalizeSupplierHexColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : supplierCapabilityColorOptions[0];
}

function supplierHexToRgb(color: string) {
  const normalizedColor = normalizeSupplierHexColor(color).replace('#', '');
  return {
    red: parseInt(normalizedColor.slice(0, 2), 16),
    green: parseInt(normalizedColor.slice(2, 4), 16),
    blue: parseInt(normalizedColor.slice(4, 6), 16),
  };
}

function supplierRgbToHex(red: number, green: number, blue: number) {
  const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[clampChannel(red), clampChannel(green), clampChannel(blue)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function supplierRgbToHsv(red: number, green: number, blue: number) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    if (max === g) hue = 60 * ((b - r) / delta + 2);
    if (max === b) hue = 60 * ((r - g) / delta + 4);
  }
  return {
    hue: Math.round((hue + 360) % 360),
    saturation: max ? Math.round((delta / max) * 100) : 0,
    value: Math.round(max * 100),
  };
}

function supplierHsvToHex(hue: number, saturation: number, value: number) {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const v = Math.max(0, Math.min(100, value)) / 100;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const match = v - chroma;
  const [r1, g1, b1] = h < 60 ? [chroma, x, 0]
    : h < 120 ? [x, chroma, 0]
      : h < 180 ? [0, chroma, x]
        : h < 240 ? [0, x, chroma]
          : h < 300 ? [x, 0, chroma]
            : [chroma, 0, x];
  return supplierRgbToHex((r1 + match) * 255, (g1 + match) * 255, (b1 + match) * 255);
}

function supplierHexToHsv(color: string) {
  const rgb = supplierHexToRgb(color);
  return supplierRgbToHsv(rgb.red, rgb.green, rgb.blue);
}

async function searchSupplierAddressMatches(query: string, limit = 5, signal?: AbortSignal): Promise<AddressLookupMatch[]> {
  return searchGooglePlacesAddressMatches(query, limit, signal);
}

async function resolveSupplierAddressMatch(match: AddressLookupMatch, signal?: AbortSignal): Promise<AddressLookupMatch | null> {
  return resolveGooglePlacesAddressMatch(match, signal);
}

const formatSupplierDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00`));

const formatSupplierTimestamp = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

const getSupplierDocumentPreviewUrl = (fileUrl: string) => `${fileUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`;

const createMockSupplierPdf = (supplier: Supplier, label: string): SupplierPdfDocument => ({
  label,
  fileName: `${supplier.name.replace(/\s+/g, '-')}-${label.toLowerCase().replace(/\s+/g, '-')}.pdf`,
  fileUrl: '/assets/supplier-documents/sample-supplier-document.pdf',
});

const createInitialSupplierRecords = (): SupplierRecord[] => mockSuppliers.map((supplier) => ({
  ...supplier,
  fiscalDocument: createMockSupplierPdf(supplier, 'Fiscal Data'),
  bankingDocument: createMockSupplierPdf(supplier, 'Banking Data'),
}));

const createUploadedSupplierPdf = (file: File | null, label: string): SupplierPdfDocument | undefined => (
  file ? {
    label,
    fileName: file.name,
    fileUrl: URL.createObjectURL(file),
  } : undefined
);

const createUploadedVoucherAttachment = (file: File | null): SupplierVoucher['attachment'] => (
  file ? {
    fileName: file.name,
    fileUrl: URL.createObjectURL(file),
    fileType: file.type,
  } : undefined
);

type SupplierBackendRow = Record<string, any>;

const sanitizeSupplierFileName = (value: string) => (
  value.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'file'
);

async function uploadSupplierStorageFile(organizationId: string, category: string, ownerId: string, file: File) {
  const filePath = [
    organizationId,
    category,
    ownerId,
    crypto.randomUUID() + '-' + sanitizeSupplierFileName(file.name),
  ].join('/');
  const { error } = await supabase.storage.from(supplierFilesBucket).upload(filePath, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return filePath;
}

async function getSupplierStorageUrl(filePath: string | null) {
  if (!filePath) return '';
  const { data, error } = await supabase.storage.from(supplierFilesBucket).createSignedUrl(filePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

async function getSupplierFileHash(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return 'sha256:' + hash;
}

const getTodayIsoDate = () => {
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
};

function getMissingDocuments(transfer: SupplierTransfer) {
  return transfer.requiredDocuments.filter((documentType) => !transfer.receivedDocuments.includes(documentType));
}

function getTransferStatusAfterCheckin(
  current: SupplierTransfer,
  quantityReceived: number,
  quantityAccepted: number,
  quantityRejected: number,
  receivedDocuments: SupplierDocumentType[],
): SupplierTransferStatus {
  if (quantityAccepted !== current.quantitySent || quantityAccepted + quantityRejected !== quantityReceived) {
    return 'discrepancy';
  }

  const hasMissingDocuments = current.requiredDocuments.some((documentType) => !receivedDocuments.includes(documentType));
  return hasMissingDocuments ? 'documents-pending' : 'completed';
}

function getCheckinDefaults(transfer: SupplierTransfer) {
  const pendingQuantity = Math.max(transfer.quantitySent - transfer.quantityAccepted, 0);
  const suggestedQuantity = pendingQuantity || transfer.quantitySent;
  return {
    quantityReceived: String(suggestedQuantity),
    quantityAccepted: String(suggestedQuantity),
    quantityRejected: '0',
    receivedDocuments: transfer.receivedDocuments,
    attachmentFile: null,
    notes: transfer.receivedNotes,
  };
}

function SupplierStatusBadge({ status }: { status: SupplierTransferStatus | Supplier['approvedStatus'] | SupplierDocument['approvalStatus'] }) {
  return <span className={`supplier-status-badge supplier-status-${status}`}>{formatSupplierLabel(status)}</span>;
}

function SupplierDocumentChecklist({
  value,
  onChange,
}: {
  value: SupplierDocumentType[];
  onChange: (value: SupplierDocumentType[]) => void;
}) {
  const toggleDocument = (documentType: SupplierDocumentType) => {
    onChange(value.includes(documentType)
      ? value.filter((item) => item !== documentType)
      : [...value, documentType]);
  };

  return (
    <div className="supplier-document-checklist">
      {supplierDocumentOptions.map((option) => (
        <label key={option.value}>
          <input
            type="checkbox"
            checked={value.includes(option.value)}
            onChange={() => toggleDocument(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

function SupplierVoucherView({ voucher }: { voucher: SupplierVoucher }) {
  const inbound = voucher.direction === 'inbound';
  const attachment = voucher.attachment;
  const attachmentIsImage = attachment?.fileType.startsWith('image/');
  const attachmentIsPdf = attachment?.fileType === 'application/pdf' || attachment?.fileName.toLowerCase().endsWith('.pdf');

  return (
    <div className="supplier-voucher-sheet">
      <div className="supplier-voucher-content">
        <div>
          <span>{inbound ? 'Inbound Voucher' : 'Outbound Voucher'}</span>
          <strong>{voucher.id}</strong>
        </div>
        <dl>
          <span><dt>Transfer ID</dt><dd>{voucher.transferId}</dd></span>
          <span><dt>Supplier</dt><dd>{voucher.supplier}</dd></span>
          <span><dt>Production Order</dt><dd>{voucher.productionOrder}</dd></span>
          <span><dt>Part Number</dt><dd>{voucher.partNumber}</dd></span>
          <span><dt>Lot / Serial</dt><dd>{voucher.lotSerial}</dd></span>
          <span><dt>Quantity Sent</dt><dd>{voucher.quantitySent.toLocaleString()}</dd></span>
          {inbound ? <span><dt>Quantity Received</dt><dd>{voucher.quantityReceived?.toLocaleString() ?? 'N/A'}</dd></span> : null}
          {inbound ? <span><dt>Quantity Accepted</dt><dd>{voucher.quantityAccepted?.toLocaleString() ?? 'N/A'}</dd></span> : null}
          {inbound ? <span><dt>Quantity Rejected</dt><dd>{voucher.quantityRejected?.toLocaleString() ?? 'N/A'}</dd></span> : null}
          <span><dt>External Process</dt><dd>{voucher.externalProcess}</dd></span>
          <span><dt>{inbound ? 'Received Date' : 'Checkout Date'}</dt><dd>{formatSupplierTimestamp(inbound ? voucher.receivedDate ?? '' : voucher.checkoutDate ?? '')}</dd></span>
          <span><dt>{inbound ? 'Received By' : 'Checked Out By'}</dt><dd>{inbound ? voucher.receivedBy : voucher.checkedOutBy}</dd></span>
          <span><dt>Expected Return</dt><dd>{formatSupplierDate(voucher.expectedReturnDate)}</dd></span>
          {inbound ? <span><dt>Documents Received</dt><dd>{voucher.documentsReceived?.map(formatSupplierLabel).join(', ') || 'None'}</dd></span> : null}
        </dl>
        <div className="supplier-voucher-note">
          <span>Comment</span>
          <p>{voucher.notes || 'No notes entered.'}</p>
        </div>
      </div>
      <aside className="supplier-voucher-attachment-panel">
        <span>Attached File</span>
        <strong>{attachment?.fileName ?? 'No file attached'}</strong>
        <div>
          {attachment && attachmentIsImage ? <img src={attachment.fileUrl} alt={attachment.fileName} /> : null}
          {attachment && !attachmentIsImage && attachmentIsPdf ? <iframe src={getSupplierDocumentPreviewUrl(attachment.fileUrl)} title={`Preview ${attachment.fileName}`} /> : null}
          {attachment && !attachmentIsImage && !attachmentIsPdf ? (
            <a href={attachment.fileUrl} target="_blank" rel="noreferrer">{attachment.fileName}</a>
          ) : null}
          {attachment ? null : <em>No file attached to this voucher.</em>}
        </div>
      </aside>
    </div>
  );
}

export function SupplierOperationsWorkspace({ onNavigate, organizationId, activeTab, onActiveTabChange }: SupplierOperationsWorkspaceProps) {
  const [suppliers, setSuppliers] = React.useState<SupplierRecord[]>(() => supplierOperationsDemoMode ? createInitialSupplierRecords() : []);
  const [transfers, setTransfers] = React.useState<SupplierTransfer[]>(supplierOperationsDemoMode ? mockSupplierTransfers : []);
  const [productionOrders, setProductionOrders] = React.useState<ProductionOrder[]>(supplierOperationsDemoMode ? mockProductionOrders : []);
  const [selectedTransferId, setSelectedTransferId] = React.useState(supplierOperationsDemoMode ? mockSupplierTransfers[0]?.id ?? '' : '');
  const [backendLoading, setBackendLoading] = React.useState(!supplierOperationsDemoMode);
  const [backendSaving, setBackendSaving] = React.useState(false);
  const [backendError, setBackendError] = React.useState('');
  const [modalMode, setModalMode] = React.useState<SupplierModalMode>(null);
  const [activeVoucher, setActiveVoucher] = React.useState<SupplierVoucher | null>(null);
  const [transferForm, setTransferForm] = React.useState<SupplierTransferFormState>(defaultTransferForm);
  const [supplierForm, setSupplierForm] = React.useState<SupplierFormState>(defaultSupplierForm);
  const [supplierDocsFilters, setSupplierDocsFilters] = React.useState<SupplierDocsFilters>(defaultSupplierDocsFilters);
  const [customSupplierCapabilityColors, setCustomSupplierCapabilityColors] = React.useState<Record<string, string>>({});
  const [addressLookup, setAddressLookup] = React.useState<AddressLookupState>({ status: 'idle', message: '' });
  const [addressSuggestions, setAddressSuggestions] = React.useState<AddressLookupMatch[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = React.useState(false);
  const [addressSuggestionsLoading, setAddressSuggestionsLoading] = React.useState(false);
  const [addressSuggestionPosition, setAddressSuggestionPosition] = React.useState<MenuPosition | null>(null);
  const [showCapabilityDropdown, setShowCapabilityDropdown] = React.useState(false);
  const [capabilityDropdownPosition, setCapabilityDropdownPosition] = React.useState<MenuPosition | null>(null);
  const [showCapabilityColorPicker, setShowCapabilityColorPicker] = React.useState(false);
  const [capabilityColorPickerPosition, setCapabilityColorPickerPosition] = React.useState<Omit<MenuPosition, 'maxHeight'> | null>(null);
  const [checkoutForm, setCheckoutForm] = React.useState<CheckoutFormState>({ quantitySent: '', notes: '', confirmed: false, attachmentFile: null });
  const [checkinForm, setCheckinForm] = React.useState<CheckinFormState>({ quantityReceived: '', quantityAccepted: '', quantityRejected: '0', receivedDocuments: [], attachmentFile: null, notes: '' });
  const [documentForm, setDocumentForm] = React.useState<DocumentFormState>({ documentType: 'certificate', fileName: '', approvalStatus: 'pending-review', file: null });
  const [previewDocument, setPreviewDocument] = React.useState<SupplierDocument | null>(null);
  const [previewSupplierPdf, setPreviewSupplierPdf] = React.useState<SupplierPdfDocument | null>(null);
  const addressLookupControlRef = React.useRef<HTMLDivElement | null>(null);
  const addressSuggestionMenuRef = React.useRef<HTMLDivElement | null>(null);
  const capabilityDropdownControlRef = React.useRef<HTMLDivElement | null>(null);
  const capabilityDropdownMenuRef = React.useRef<HTMLDivElement | null>(null);
  const capabilityColorTriggerRef = React.useRef<HTMLSpanElement | null>(null);
  const capabilityColorPickerRef = React.useRef<HTMLDivElement | null>(null);

  const refreshSupplierOperations = React.useCallback(async () => {
    if (supplierOperationsDemoMode) return;
    setBackendLoading(true);
    setBackendError('');
    try {
      const [supplierResult, transferResult, orderResult] = await Promise.all([
        supabase.from('mes_suppliers').select(
          '*, capability_links:mes_supplier_capability_links(capability:mes_supplier_capabilities(id,name,color))',
        ).eq('organization_id', organizationId).order('name'),
        supabase.from('mes_supplier_transfers').select(
          '*, supplier:mes_suppliers(name), documents:mes_supplier_documents(*), vouchers:mes_supplier_vouchers(*)',
        ).eq('organization_id', organizationId).order('created_at', { ascending: false }),
        supabase.from('mes_production_orders').select('*').eq('organization_id', organizationId).order('order_number'),
      ]);
      const firstError = supplierResult.error ?? transferResult.error ?? orderResult.error;
      if (firstError) throw firstError;

      const supplierRows = (supplierResult.data ?? []) as SupplierBackendRow[];
      const transferRows = (transferResult.data ?? []) as SupplierBackendRow[];
      const filePaths = Array.from(new Set([
        ...supplierRows.flatMap((supplier) => [supplier.fiscal_document_path, supplier.banking_document_path]),
        ...transferRows.flatMap((transfer) => [
          ...(transfer.documents ?? []).map((document: SupplierBackendRow) => document.file_path),
          ...(transfer.vouchers ?? []).map((voucher: SupplierBackendRow) => voucher.attachment_path),
        ]),
      ].filter((filePath): filePath is string => Boolean(filePath))));
      const signedFileUrls = new Map(await Promise.all(
        filePaths.map(async (filePath) => [filePath, await getSupplierStorageUrl(filePath)] as const),
      ));

      const nextSuppliers: SupplierRecord[] = supplierRows.map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        contactName: supplier.contact_name,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.address,
        approvedStatus: supplier.approved_status,
        processCapabilities: (supplier.capability_links ?? [])
          .map((link: SupplierBackendRow) => link.capability?.name)
          .filter(Boolean),
        fiscalDocument: supplier.fiscal_document_path ? {
          label: 'Fiscal Data',
          fileName: supplier.fiscal_document_name,
          fileUrl: signedFileUrls.get(supplier.fiscal_document_path) ?? '',
        } : undefined,
        bankingDocument: supplier.banking_document_path ? {
          label: 'Banking Data',
          fileName: supplier.banking_document_name,
          fileUrl: signedFileUrls.get(supplier.banking_document_path) ?? '',
        } : undefined,
        notes: supplier.notes,
      }));
      const nextTransfers: SupplierTransfer[] = transferRows.map((transfer) => {
        const supplierName = transfer.supplier?.name ?? 'Unknown Supplier';
        return {
          id: transfer.transfer_number,
          databaseId: transfer.id,
          productionOrder: transfer.production_order_number,
          supplierId: transfer.supplier_id,
          supplierName,
          externalProcess: transfer.external_process,
          partNumber: transfer.part_number,
          lotSerial: transfer.lot_serial,
          quantitySent: transfer.quantity_sent,
          quantityReceived: transfer.quantity_received,
          quantityAccepted: transfer.quantity_accepted,
          quantityRejected: transfer.quantity_rejected,
          status: transfer.status,
          expectedReturnDate: transfer.expected_return_date,
          requiredDocuments: transfer.required_documents ?? [],
          receivedDocuments: transfer.received_documents ?? [],
          documents: (transfer.documents ?? []).map((document: SupplierBackendRow) => ({
            id: document.id,
            transferId: transfer.transfer_number,
            supplier: supplierName,
            documentType: document.document_type,
            fileName: document.file_name,
            fileUrl: signedFileUrls.get(document.file_path) ?? '',
            uploadedBy: document.uploaded_by_label,
            uploadedAt: document.created_at,
            approvalStatus: document.approval_status,
            hash: document.file_hash ?? undefined,
          })),
          vouchers: (transfer.vouchers ?? []).map((voucher: SupplierBackendRow) => ({
            id: voucher.voucher_number,
            transferId: transfer.transfer_number,
            direction: voucher.direction,
            supplier: supplierName,
            productionOrder: transfer.production_order_number,
            partNumber: transfer.part_number,
            lotSerial: transfer.lot_serial,
            quantitySent: voucher.quantity_sent,
            quantityReceived: voucher.quantity_received ?? undefined,
            quantityAccepted: voucher.quantity_accepted ?? undefined,
            quantityRejected: voucher.quantity_rejected ?? undefined,
            externalProcess: transfer.external_process,
            checkoutDate: voucher.direction === 'outbound' ? voucher.processed_at : undefined,
            checkedOutBy: voucher.direction === 'outbound' ? voucher.processed_by_label : undefined,
            receivedDate: voucher.direction === 'inbound' ? voucher.processed_at : undefined,
            receivedBy: voucher.direction === 'inbound' ? voucher.processed_by_label : undefined,
            expectedReturnDate: transfer.expected_return_date,
            documentsReceived: voucher.documents_received ?? [],
            attachment: voucher.attachment_path ? {
              fileName: voucher.attachment_name,
              fileUrl: signedFileUrls.get(voucher.attachment_path) ?? '',
              fileType: voucher.attachment_type ?? 'application/octet-stream',
            } : undefined,
            notes: voucher.notes,
          })),
          notes: transfer.notes,
          checkoutNotes: transfer.checkout_notes,
          receivedNotes: transfer.received_notes,
          createdAt: transfer.created_at,
          updatedAt: transfer.updated_at,
        };
      });
      setSuppliers(nextSuppliers);
      setTransfers(nextTransfers);
      setProductionOrders((orderResult.data ?? []).map((order: SupplierBackendRow) => ({
        id: order.id, orderNumber: order.order_number, partNumber: order.part_number, partName: order.part_name,
        plannedQuantity: order.planned_quantity, completedQuantity: order.completed_quantity, scrapQuantity: order.scrap_quantity,
        status: order.status, priority: order.priority, dueDate: order.due_date, assignedWorkCenter: order.assigned_work_center,
        plannedShifts: order.planned_shifts ?? [], manufacturingType: order.manufacturing_type ?? 'multi-step',
        productionFlow: order.production_flow ?? '', assignedStation: order.assigned_station ?? '',
      })));
      setCustomSupplierCapabilityColors(Object.fromEntries(supplierRows.flatMap((supplier) => (
        (supplier.capability_links ?? []).map((link: SupplierBackendRow) => [link.capability?.name, link.capability?.color])
      )).filter(([name, color]) => Boolean(name && color))));
      setSelectedTransferId((current) => nextTransfers.some((transfer) => transfer.id === current) ? current : nextTransfers[0]?.id ?? '');
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : 'Unable to load Supplier Operations.');
    } finally {
      setBackendLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    void refreshSupplierOperations();
  }, [refreshSupplierOperations]);

  const selectedTransfer = transfers.find((transfer) => transfer.id === selectedTransferId) ?? transfers[0] ?? null;
  const todayIsoDate = getTodayIsoDate();
  const isOverdueTransfer = React.useCallback((transfer: SupplierTransfer) => transfer.expectedReturnDate < todayIsoDate && transfer.status !== 'completed', [todayIsoDate]);
  const sentTransfers = transfers.filter((transfer) => transfer.status === 'sent-to-supplier').length;
  const pendingReturn = transfers.filter((transfer) => ['sent-to-supplier', 'ready-for-checkout'].includes(transfer.status)).length;
  const missingDocuments = transfers.filter((transfer) => getMissingDocuments(transfer).length > 0 && ['documents-pending', 'discrepancy'].includes(transfer.status)).length;
  const overdueTransfers = transfers.filter(isOverdueTransfer).length;
  const activeSupplierTransfers = transfers.filter((transfer) => transfer.status !== 'completed');
  const sentToSupplierTransfers = transfers.filter((transfer) => transfer.status === 'sent-to-supplier');
  const pendingReturnTransfers = transfers.filter((transfer) => ['sent-to-supplier', 'ready-for-checkout'].includes(transfer.status));
  const missingDocumentTransfers = transfers.filter((transfer) => getMissingDocuments(transfer).length > 0 && ['documents-pending', 'discrepancy'].includes(transfer.status));
  const selectedCheckTransfer = activeSupplierTransfers.find((transfer) => transfer.id === selectedTransferId) ?? activeSupplierTransfers[0] ?? null;
  const canCheckOutSelectedTransfer = selectedCheckTransfer ? selectedCheckTransfer.status === 'ready-for-checkout' : false;
  const canCheckInSelectedTransfer = selectedCheckTransfer ? ['sent-to-supplier', 'discrepancy'].includes(selectedCheckTransfer.status) : false;
  const allSupplierCapabilityTags = React.useMemo(() => Array.from(new Set([
    ...Object.keys(supplierCapabilityColors),
    ...suppliers.flatMap((supplier) => supplier.processCapabilities),
    ...Object.keys(customSupplierCapabilityColors),
  ])), [customSupplierCapabilityColors, suppliers]);
  const supplierCapabilityPickerOptions = React.useMemo(() => allSupplierCapabilityTags.filter((capability) => !supplierForm.processCapabilities.includes(capability)), [allSupplierCapabilityTags, supplierForm.processCapabilities]);
  const newCapabilityHsv = React.useMemo(() => supplierHexToHsv(supplierForm.newCapabilityColor), [supplierForm.newCapabilityColor]);
  const presetSupplierCapabilityColorOptions = supplierCapabilityColorOptions.slice(0, 6);
  const usesCustomSupplierCapabilityColor = !presetSupplierCapabilityColorOptions.includes(supplierForm.newCapabilityColor);
  const supplierDocsCapabilityOptions = React.useMemo(() => Array.from(new Set(transfers.map((transfer) => transfer.externalProcess))).sort(), [transfers]);
  const supplierDocsWorkCenterOptions = React.useMemo(() => Array.from(new Set(transfers.map((transfer) => getSupplierTransferWorkCenter(transfer, productionOrders)))).sort(), [productionOrders, transfers]);
  const filteredSupplierDocTransfers = React.useMemo(() => transfers.filter((transfer) => {
    const transferQuery = supplierDocsFilters.transferSearch.trim().toLowerCase();
    const supplierQuery = supplierDocsFilters.supplierSearch.trim().toLowerCase();
    const transferHaystack = [
      transfer.id,
      transfer.productionOrder,
      transfer.partNumber,
      transfer.lotSerial,
    ].join(' ').toLowerCase();
    const supplierHaystack = [
      transfer.supplierName,
    ].join(' ').toLowerCase();
    const expectedReturnDate = transfer.expectedReturnDate || '';
    const transferShift = getSupplierTransferShift(transfer);
    const transferWorkCenter = getSupplierTransferWorkCenter(transfer, productionOrders);

    return (!transferQuery || transferHaystack.includes(transferQuery))
      && (!supplierQuery || supplierHaystack.includes(supplierQuery))
      && (!supplierDocsFilters.capability || transfer.externalProcess === supplierDocsFilters.capability)
      && (!supplierDocsFilters.workCenter || transferWorkCenter === supplierDocsFilters.workCenter)
      && (!supplierDocsFilters.dateFrom || expectedReturnDate >= supplierDocsFilters.dateFrom)
      && (!supplierDocsFilters.dateTo || expectedReturnDate <= supplierDocsFilters.dateTo)
      && (!supplierDocsFilters.shift || transferShift === supplierDocsFilters.shift)
      && (!supplierDocsFilters.onlyShowCompletedOrders || transfer.status === 'completed')
      && (supplierDocsFilters.showCompletedOrders || transfer.status !== 'completed');
  }), [productionOrders, supplierDocsFilters, transfers]);
  const selectedDocsTransfer = filteredSupplierDocTransfers.find((transfer) => transfer.id === selectedTransferId) ?? filteredSupplierDocTransfers[0] ?? null;
  const hasSupplierDocsFilters = Object.entries(supplierDocsFilters).some(([key, value]) => value !== defaultSupplierDocsFilters[key as keyof SupplierDocsFilters]);

  const updateTransfer = (transferId: string, updater: (transfer: SupplierTransfer) => SupplierTransfer) => {
    setTransfers((currentTransfers) => currentTransfers.map((transfer) => transfer.id === transferId ? updater(transfer) : transfer));
  };

  const persistSupplierOperation = async (operation: () => Promise<void>) => {
    setBackendSaving(true);
    setBackendError('');
    try {
      await operation();
      await refreshSupplierOperations();
      return true;
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : 'Unable to save Supplier Operations changes.');
      return false;
    } finally {
      setBackendSaving(false);
    }
  };

  const openCreateTransfer = () => {
    setTransferForm({
      ...defaultTransferForm,
      productionOrder: productionOrders[0]?.orderNumber ?? '',
      partNumber: productionOrders[0]?.partNumber ?? '',
      supplierId: suppliers.find((supplier) => supplier.approvedStatus === 'approved')?.id ?? suppliers[0]?.id ?? '',
    });
    setModalMode('create');
  };

  const openCreateSupplier = () => {
    setSupplierForm(defaultSupplierForm);
    setAddressLookup({ status: 'idle', message: '' });
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    setShowCapabilityDropdown(false);
    setShowCapabilityColorPicker(false);
    setModalMode('supplier');
  };

  const selectCheckTransfer = (transfer: SupplierTransfer) => {
    setSelectedTransferId(transfer.id);
    setCheckoutForm({
      quantitySent: String(transfer.quantitySent || ''),
      notes: transfer.checkoutNotes,
      confirmed: false,
      attachmentFile: null,
    });
    setCheckinForm(getCheckinDefaults(transfer));
  };

  React.useEffect(() => {
    if (activeTab === 'check-in-out' && selectedCheckTransfer && (selectedTransferId !== selectedCheckTransfer.id || (!checkoutForm.quantitySent && !checkinForm.quantityReceived))) {
      selectCheckTransfer(selectedCheckTransfer);
    }
  }, [activeTab, checkoutForm.quantitySent, checkinForm.quantityReceived, selectedCheckTransfer?.id, selectedTransferId]);

  const getSupplierCapabilityColor = React.useCallback((capability: string) => (
    customSupplierCapabilityColors[capability] ?? getDefaultSupplierCapabilityColor(capability)
  ), [customSupplierCapabilityColors]);

  const updateNewSupplierCapabilityColor = (color: string) => {
    setSupplierForm((current) => ({ ...current, newCapabilityColor: normalizeSupplierHexColor(color) }));
  };

  const updateNewSupplierCapabilityHue = (value: string) => {
    updateNewSupplierCapabilityColor(supplierHsvToHex(Number(value) || 0, newCapabilityHsv.saturation, newCapabilityHsv.value));
  };

  const updateNewSupplierCapabilityColorField = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    updateNewSupplierCapabilityColor(supplierHsvToHex(newCapabilityHsv.hue, (x / rect.width) * 100, 100 - ((y / rect.height) * 100)));
  };

  const startNewSupplierCapabilityColorFieldDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateNewSupplierCapabilityColorField(event);
  };

  const moveNewSupplierCapabilityColorField = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const colorStep = event.shiftKey ? 10 : 2;
    const nextHsv = { ...newCapabilityHsv };
    if (event.key === 'ArrowLeft') nextHsv.saturation -= colorStep;
    else if (event.key === 'ArrowRight') nextHsv.saturation += colorStep;
    else if (event.key === 'ArrowUp') nextHsv.value += colorStep;
    else if (event.key === 'ArrowDown') nextHsv.value -= colorStep;
    else return;
    event.preventDefault();
    updateNewSupplierCapabilityColor(supplierHsvToHex(nextHsv.hue, nextHsv.saturation, nextHsv.value));
  };

  const addSupplierCapability = (capability: string) => {
    if (!capability || capability === registerNewSupplierCapabilityValue) return;
    setSupplierForm((current) => ({
      ...current,
      capability: '',
      processCapabilities: current.processCapabilities.includes(capability) ? current.processCapabilities : [...current.processCapabilities, capability],
    }));
    setShowCapabilityDropdown(false);
  };

  const removeSupplierCapability = (capability: string) => {
    setSupplierForm((current) => ({
      ...current,
      processCapabilities: current.processCapabilities.filter((item) => item !== capability),
    }));
  };

  const updateAddressSuggestionPosition = React.useCallback(() => {
    const control = addressLookupControlRef.current;
    if (!control) return;
    const rect = control.getBoundingClientRect();
    const viewportPadding = 16;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const maxHeight = Math.max(132, Math.min(246, availableBelow >= 150 ? availableBelow - 8 : availableAbove - 8));
    const openUp = availableBelow < 150 && availableAbove > availableBelow;
    const width = Math.min(rect.width, window.innerWidth - (viewportPadding * 2));
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));
    setAddressSuggestionPosition({
      top: openUp ? Math.max(viewportPadding, rect.top - maxHeight - 7) : rect.bottom + 7,
      left,
      width,
      maxHeight,
    });
  }, []);

  const updateCapabilityDropdownPosition = React.useCallback(() => {
    const control = capabilityDropdownControlRef.current;
    if (!control) return;
    const rect = control.getBoundingClientRect();
    const viewportPadding = 16;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const maxHeight = Math.max(152, Math.min(260, availableBelow >= 170 ? availableBelow - 8 : availableAbove - 8));
    const openUp = availableBelow < 170 && availableAbove > availableBelow;
    const width = Math.min(rect.width, window.innerWidth - (viewportPadding * 2));
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));
    setCapabilityDropdownPosition({
      top: openUp ? Math.max(viewportPadding, rect.top - maxHeight - 7) : rect.bottom + 7,
      left,
      width,
      maxHeight,
    });
  }, []);

  const updateCapabilityColorPickerPosition = React.useCallback(() => {
    const trigger = capabilityColorTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const width = Math.min(246, window.innerWidth - (viewportPadding * 2));
    const left = Math.max(viewportPadding, Math.min(rect.right - width, window.innerWidth - width - viewportPadding));
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const pickerHeight = 286;
    const openUp = availableBelow < pickerHeight && rect.top > availableBelow;
    setCapabilityColorPickerPosition({
      top: openUp ? Math.max(viewportPadding, rect.top - pickerHeight - 8) : rect.bottom + 8,
      left,
      width,
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!(showAddressSuggestions || addressSuggestionsLoading)) return;
    if (addressSuggestions.length === 0 && !addressSuggestionsLoading) return;
    updateAddressSuggestionPosition();
  }, [addressSuggestions.length, addressSuggestionsLoading, showAddressSuggestions, updateAddressSuggestionPosition]);

  React.useLayoutEffect(() => {
    if (!showCapabilityDropdown) return;
    updateCapabilityDropdownPosition();
  }, [showCapabilityDropdown, updateCapabilityDropdownPosition]);

  React.useLayoutEffect(() => {
    if (!showCapabilityColorPicker) return;
    updateCapabilityColorPickerPosition();
  }, [showCapabilityColorPicker, updateCapabilityColorPickerPosition]);

  React.useEffect(() => {
    if (modalMode !== 'supplier' || supplierForm.address.trim().length < 3) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressSuggestionsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setAddressSuggestionsLoading(true);
      searchSupplierAddressMatches(supplierForm.address.trim(), 5, controller.signal)
        .then((matches) => {
          if (controller.signal.aborted) return;
          setAddressSuggestions(matches);
          setShowAddressSuggestions(matches.length > 0);
        })
        .catch((error) => {
          if ((error as Error).name !== 'AbortError') {
            setAddressSuggestions([]);
            setShowAddressSuggestions(false);
            setAddressLookup({ status: 'error', message: 'Unable to load Google address suggestions.' });
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setAddressSuggestionsLoading(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [modalMode, supplierForm.address]);

  React.useEffect(() => {
    const addressMenuOpen = (showAddressSuggestions || addressSuggestionsLoading) && (addressSuggestions.length > 0 || addressSuggestionsLoading);
    const capabilityMenuOpen = showCapabilityDropdown;
    const colorPickerOpen = showCapabilityColorPicker;
    if (!addressMenuOpen && !capabilityMenuOpen && !colorPickerOpen) return undefined;

    const closeIfOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (addressMenuOpen && (addressLookupControlRef.current?.contains(target) || addressSuggestionMenuRef.current?.contains(target))) return;
      if (capabilityMenuOpen && (capabilityDropdownControlRef.current?.contains(target) || capabilityDropdownMenuRef.current?.contains(target))) return;
      if (colorPickerOpen && (capabilityColorTriggerRef.current?.contains(target) || capabilityColorPickerRef.current?.contains(target))) return;
      setShowAddressSuggestions(false);
      setShowCapabilityDropdown(false);
      setShowCapabilityColorPicker(false);
    };
    const reposition = () => {
      if (addressMenuOpen) updateAddressSuggestionPosition();
      if (capabilityMenuOpen) updateCapabilityDropdownPosition();
      if (colorPickerOpen) updateCapabilityColorPickerPosition();
    };

    document.addEventListener('mousedown', closeIfOutside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', closeIfOutside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [
    addressSuggestions.length,
    addressSuggestionsLoading,
    showAddressSuggestions,
    showCapabilityDropdown,
    showCapabilityColorPicker,
    updateAddressSuggestionPosition,
    updateCapabilityDropdownPosition,
    updateCapabilityColorPickerPosition,
  ]);

  const lookupSupplierAddress = async (): Promise<AddressLookupMatch | null> => {
    const address = supplierForm.address.trim();
    if (!address) {
      setAddressLookup({ status: 'error', message: 'Enter an address before searching.' });
      return null;
    }
    setAddressLookup({ status: 'loading', message: 'Searching address...' });
    try {
      const match = (await searchSupplierAddressMatches(address, 1))[0];
      const resolvedMatch = match ? await resolveSupplierAddressMatch(match) : null;
      if (!resolvedMatch) {
        setAddressLookup({ status: 'error', message: 'No match found. Try street, city, state, and country.' });
        return null;
      }
      setSupplierForm((current) => ({ ...current, address: resolvedMatch.address }));
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressLookup({ status: 'success', message: `Location found: ${Number(resolvedMatch.latitude).toFixed(5)}, ${Number(resolvedMatch.longitude).toFixed(5)}` });
      return resolvedMatch;
    } catch {
      setAddressLookup({ status: 'error', message: 'Could not reach the address lookup service. Try again in a moment.' });
      return null;
    }
  };

  const selectAddressSuggestion = async (match: AddressLookupMatch) => {
    setAddressLookup({ status: 'loading', message: 'Loading selected address...' });
    try {
      const resolvedMatch = await resolveSupplierAddressMatch(match);
      if (!resolvedMatch) {
        setAddressLookup({ status: 'error', message: 'Could not load the selected address details.' });
        return;
      }
      setSupplierForm((current) => ({ ...current, address: resolvedMatch.address }));
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressLookup({ status: 'success', message: `Location found: ${Number(resolvedMatch.latitude).toFixed(5)}, ${Number(resolvedMatch.longitude).toFixed(5)}` });
    } catch {
      setAddressLookup({ status: 'error', message: 'Could not load the selected address details.' });
    }
  };

  const openCheckout = (transfer: SupplierTransfer) => {
    setSelectedTransferId(transfer.id);
    setCheckoutForm({ quantitySent: String(transfer.quantitySent || ''), notes: transfer.checkoutNotes, confirmed: false, attachmentFile: null });
    setModalMode('checkout');
  };

  const openCheckin = (transfer: SupplierTransfer) => {
    setSelectedTransferId(transfer.id);
    setCheckinForm(getCheckinDefaults(transfer));
    setModalMode('checkin');
  };

  const openDocumentUpload = (transfer: SupplierTransfer) => {
    setSelectedTransferId(transfer.id);
    setDocumentForm({
      documentType: getMissingDocuments(transfer)[0] ?? transfer.requiredDocuments[0] ?? 'certificate',
      fileName: '',
      approvalStatus: 'pending-review',
      file: null,
    });
    setModalMode('document');
  };

  const goToCheckTerminal = (transfer: SupplierTransfer) => {
    selectCheckTransfer(transfer);
    onActiveTabChange('check-in-out');
  };

  const goToUploadDocument = (transfer: SupplierTransfer) => {
    setSupplierDocsFilters(defaultSupplierDocsFilters);
    openDocumentUpload(transfer);
    onActiveTabChange('vouchers-docs');
  };

  const openEditTransfer = (transfer: SupplierTransfer) => {
    if (transfer.status !== 'ready-for-checkout') return;
    setSelectedTransferId(transfer.id);
    setTransferForm({
      productionOrder: transfer.productionOrder,
      supplierId: transfer.supplierId,
      externalProcess: transfer.externalProcess,
      partNumber: transfer.partNumber,
      lotSerial: transfer.lotSerial,
      quantityToSend: String(transfer.quantitySent || ''),
      expectedReturnDate: transfer.expectedReturnDate,
      requiredDocuments: transfer.requiredDocuments,
      notes: transfer.notes,
    });
    setModalMode('edit-transfer');
  };

  const deleteTransfer = async (transfer: SupplierTransfer) => {
    if (transfer.status !== 'ready-for-checkout') return;
    if (!supplierOperationsDemoMode) {
      if (!transfer.databaseId) return;
      const saved = await persistSupplierOperation(async () => {
        const { error } = await supabase.from('mes_supplier_transfers').delete()
          .eq('id', transfer.databaseId).eq('organization_id', organizationId).eq('status', 'ready-for-checkout');
        if (error) throw error;
      });
      if (saved && selectedTransferId === transfer.id) setSelectedTransferId('');
      return;
    }
    setTransfers((currentTransfers) => {
      const remainingTransfers = currentTransfers.filter((item) => item.id !== transfer.id);
      if (selectedTransferId === transfer.id) {
        setSelectedTransferId(remainingTransfers[0]?.id ?? '');
      }
      return remainingTransfers;
    });
  };

  const createTransfer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supplier = suppliers.find((item) => item.id === transferForm.supplierId) ?? suppliers[0];
    const order = productionOrders.find((item) => item.orderNumber === transferForm.productionOrder);
    if (!supplier) return;
    if (!supplierOperationsDemoMode) {
      const saved = await persistSupplierOperation(async () => {
        const { error } = await supabase.from('mes_supplier_transfers').insert({
          organization_id: organizationId,
          transfer_number: '',
          production_order_id: order?.id ?? null,
          production_order_number: transferForm.productionOrder,
          supplier_id: supplier.id,
          external_process: transferForm.externalProcess.trim(),
          part_number: transferForm.partNumber.trim() || order?.partNumber || '',
          lot_serial: transferForm.lotSerial.trim(),
          quantity_sent: Number(transferForm.quantityToSend) || 0,
          expected_return_date: transferForm.expectedReturnDate,
          required_documents: transferForm.requiredDocuments,
          notes: transferForm.notes.trim(),
        });
        if (error) throw error;
      });
      if (saved) {
        onActiveTabChange('transfers');
        setModalMode(null);
      }
      return;
    }
    const transfer: SupplierTransfer = {
      id: `ST-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(transfers.length + 1).padStart(3, '0')}`,
      productionOrder: transferForm.productionOrder,
      supplierId: supplier.id,
      supplierName: supplier.name,
      externalProcess: transferForm.externalProcess.trim(),
      partNumber: transferForm.partNumber.trim() || order?.partNumber || '',
      lotSerial: transferForm.lotSerial.trim(),
      quantitySent: Number(transferForm.quantityToSend) || 0,
      quantityReceived: 0,
      quantityAccepted: 0,
      quantityRejected: 0,
      status: 'ready-for-checkout',
      expectedReturnDate: transferForm.expectedReturnDate,
      requiredDocuments: transferForm.requiredDocuments,
      receivedDocuments: [],
      documents: [],
      vouchers: [],
      notes: transferForm.notes.trim(),
      checkoutNotes: '',
      receivedNotes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setTransfers((currentTransfers) => [transfer, ...currentTransfers]);
    setSelectedTransferId(transfer.id);
    onActiveTabChange('transfers');
    setModalMode(null);
  };

  const editTransfer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTransfer || selectedTransfer.status !== 'ready-for-checkout') return;
    const supplier = suppliers.find((item) => item.id === transferForm.supplierId) ?? suppliers[0];
    const order = productionOrders.find((item) => item.orderNumber === transferForm.productionOrder);
    if (!supplier) return;
    if (!supplierOperationsDemoMode) {
      if (!selectedTransfer.databaseId) return;
      const saved = await persistSupplierOperation(async () => {
        const { error } = await supabase.from('mes_supplier_transfers').update({
          production_order_id: order?.id ?? null,
          production_order_number: transferForm.productionOrder,
          supplier_id: supplier.id,
          external_process: transferForm.externalProcess.trim(),
          part_number: transferForm.partNumber.trim() || order?.partNumber || '',
          lot_serial: transferForm.lotSerial.trim(),
          quantity_sent: Number(transferForm.quantityToSend) || 0,
          expected_return_date: transferForm.expectedReturnDate,
          required_documents: transferForm.requiredDocuments,
          notes: transferForm.notes.trim(),
        }).eq('id', selectedTransfer.databaseId)
          .eq('organization_id', organizationId)
          .eq('status', 'ready-for-checkout');
        if (error) throw error;
      });
      if (saved) setModalMode(null);
      return;
    }
    updateTransfer(selectedTransfer.id, (transfer) => ({
      ...transfer,
      productionOrder: transferForm.productionOrder,
      supplierId: supplier.id,
      supplierName: supplier.name,
      externalProcess: transferForm.externalProcess.trim(),
      partNumber: transferForm.partNumber.trim() || order?.partNumber || '',
      lotSerial: transferForm.lotSerial.trim(),
      quantitySent: Number(transferForm.quantityToSend) || 0,
      expectedReturnDate: transferForm.expectedReturnDate,
      requiredDocuments: transferForm.requiredDocuments,
      notes: transferForm.notes.trim(),
      updatedAt: new Date().toISOString(),
    }));
    setModalMode(null);
  };

  const createSupplier = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = supplierForm.name.trim();
    const newCapability = supplierForm.capability === registerNewSupplierCapabilityValue ? supplierForm.newCapabilityName.trim() : '';
    const capabilities = Array.from(new Set([
      ...supplierForm.processCapabilities,
      ...(newCapability ? [newCapability] : []),
    ].map((capability) => capability.trim()).filter(Boolean)));
    if (supplierForm.capability === registerNewSupplierCapabilityValue && !newCapability) return;
    const processCapabilities = capabilities.length ? capabilities : ['General supplier'];
    if (!supplierOperationsDemoMode) {
      const supplierId = crypto.randomUUID();
      const saved = await persistSupplierOperation(async () => {
        const uploadedPaths: string[] = [];
        try {
          const fiscalPath = supplierForm.fiscalDocumentFile
            ? await uploadSupplierStorageFile(organizationId, 'suppliers', supplierId, supplierForm.fiscalDocumentFile)
            : null;
          if (fiscalPath) uploadedPaths.push(fiscalPath);
          const bankingPath = supplierForm.bankingDocumentFile
            ? await uploadSupplierStorageFile(organizationId, 'suppliers', supplierId, supplierForm.bankingDocumentFile)
            : null;
          if (bankingPath) uploadedPaths.push(bankingPath);
          const supplierResult = await supabase.from('mes_suppliers').insert({
            id: supplierId,
            organization_id: organizationId,
            name: normalizedName,
            contact_name: supplierForm.contactName.trim(),
            email: supplierForm.email.trim(),
            phone: supplierForm.phone.trim(),
            address: supplierForm.address.trim(),
            approved_status: supplierForm.approvedStatus,
            fiscal_document_name: supplierForm.fiscalDocumentFile?.name ?? null,
            fiscal_document_path: fiscalPath,
            banking_document_name: supplierForm.bankingDocumentFile?.name ?? null,
            banking_document_path: bankingPath,
            notes: supplierForm.notes.trim(),
          });
          if (supplierResult.error) throw supplierResult.error;
          const capabilityResult = await supabase.from('mes_supplier_capabilities').upsert(
            processCapabilities.map((name) => ({
              organization_id: organizationId,
              name,
              color: name === newCapability
                ? supplierForm.newCapabilityColor
                : customSupplierCapabilityColors[name] ?? getDefaultSupplierCapabilityColor(name),
            })),
            { onConflict: 'organization_id,name' },
          ).select('id');
          if (capabilityResult.error) throw capabilityResult.error;
          const linkResult = await supabase.from('mes_supplier_capability_links').insert(
            (capabilityResult.data ?? []).map((capability) => ({
              supplier_id: supplierId,
              capability_id: capability.id,
              organization_id: organizationId,
            })),
          );
          if (linkResult.error) throw linkResult.error;
        } catch (error) {
          if (uploadedPaths.length) await supabase.storage.from(supplierFilesBucket).remove(uploadedPaths);
          throw error;
        }
      });
      if (saved) {
        onActiveTabChange('suppliers');
        setModalMode(null);
      }
      return;
    }
    const supplier: SupplierRecord = {
      id: `sup-${normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'supplier'}-${String(suppliers.length + 1).padStart(2, '0')}`,
      name: normalizedName,
      contactName: supplierForm.contactName.trim(),
      email: supplierForm.email.trim(),
      phone: supplierForm.phone.trim(),
      address: supplierForm.address.trim(),
      approvedStatus: supplierForm.approvedStatus,
      processCapabilities,
      fiscalDocument: createUploadedSupplierPdf(supplierForm.fiscalDocumentFile, 'Fiscal Data'),
      bankingDocument: createUploadedSupplierPdf(supplierForm.bankingDocumentFile, 'Banking Data'),
      notes: supplierForm.notes.trim(),
    };
    if (newCapability) {
      setCustomSupplierCapabilityColors((currentColors) => ({
        ...currentColors,
        [newCapability]: supplierForm.newCapabilityColor,
      }));
    }
    setSuppliers((currentSuppliers) => [supplier, ...currentSuppliers]);
    onActiveTabChange('suppliers');
    setModalMode(null);
  };

  const checkoutTransfer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTransfer) return;

    const quantitySent = Number(checkoutForm.quantitySent) || selectedTransfer.quantitySent;
    const voucher: SupplierVoucher = {
      id: `OV-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(selectedTransfer.vouchers.length + 1).padStart(3, '0')}`,
      transferId: selectedTransfer.id,
      direction: 'outbound',
      supplier: selectedTransfer.supplierName,
      productionOrder: selectedTransfer.productionOrder,
      partNumber: selectedTransfer.partNumber,
      lotSerial: selectedTransfer.lotSerial,
      quantitySent,
      externalProcess: selectedTransfer.externalProcess,
      checkoutDate: new Date().toISOString(),
      checkedOutBy: 'MES Supervisor',
      expectedReturnDate: selectedTransfer.expectedReturnDate,
      attachment: createUploadedVoucherAttachment(checkoutForm.attachmentFile),
      notes: checkoutForm.notes.trim(),
    };

    if (!supplierOperationsDemoMode) {
      if (!selectedTransfer.databaseId) return;
      const saved = await persistSupplierOperation(async () => {
        let attachmentPath: string | null = null;
        try {
          attachmentPath = checkoutForm.attachmentFile
            ? await uploadSupplierStorageFile(organizationId, 'vouchers', selectedTransfer.databaseId!, checkoutForm.attachmentFile)
            : null;
          const { error } = await supabase.rpc('mes_supplier_checkout', {
            p_organization_id: organizationId,
            p_transfer_id: selectedTransfer.databaseId,
            p_quantity_sent: quantitySent,
            p_notes: checkoutForm.notes.trim(),
            p_processed_by_label: 'MES Supervisor',
            p_attachment_name: checkoutForm.attachmentFile?.name ?? null,
            p_attachment_path: attachmentPath,
            p_attachment_type: checkoutForm.attachmentFile?.type ?? null,
          });
          if (error) throw error;
        } catch (error) {
          if (attachmentPath) await supabase.storage.from(supplierFilesBucket).remove([attachmentPath]);
          throw error;
        }
      });
      if (saved) {
        setActiveVoucher(voucher);
        setCheckoutForm((current) => ({ ...current, confirmed: false, attachmentFile: null }));
        setModalMode('voucher');
      }
      return;
    }

    updateTransfer(selectedTransfer.id, (transfer) => ({
      ...transfer,
      quantitySent,
      status: 'sent-to-supplier',
      checkoutNotes: checkoutForm.notes.trim(),
      vouchers: [...transfer.vouchers, voucher],
      updatedAt: new Date().toISOString(),
    }));
    setActiveVoucher(voucher);
    setCheckoutForm((current) => ({ ...current, confirmed: false, attachmentFile: null }));
    setModalMode('voucher');
  };

  const checkinTransfer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTransfer) return;

    const quantityReceived = Number(checkinForm.quantityReceived) || 0;
    const quantityAccepted = Number(checkinForm.quantityAccepted) || 0;
    const quantityRejected = Number(checkinForm.quantityRejected) || 0;
    const accumulatedQuantityReceived = selectedTransfer.quantityReceived + quantityReceived;
    const accumulatedQuantityAccepted = selectedTransfer.quantityAccepted + quantityAccepted;
    const accumulatedQuantityRejected = selectedTransfer.quantityRejected + quantityRejected;
    const nextStatus = getTransferStatusAfterCheckin(
      selectedTransfer,
      accumulatedQuantityReceived,
      accumulatedQuantityAccepted,
      accumulatedQuantityRejected,
      checkinForm.receivedDocuments,
    );
    const voucher: SupplierVoucher = {
      id: `IV-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(selectedTransfer.vouchers.length + 1).padStart(3, '0')}`,
      transferId: selectedTransfer.id,
      direction: 'inbound',
      supplier: selectedTransfer.supplierName,
      productionOrder: selectedTransfer.productionOrder,
      partNumber: selectedTransfer.partNumber,
      lotSerial: selectedTransfer.lotSerial,
      quantitySent: selectedTransfer.quantitySent,
      quantityReceived,
      quantityAccepted,
      quantityRejected,
      externalProcess: selectedTransfer.externalProcess,
      receivedDate: new Date().toISOString(),
      receivedBy: 'Receiving',
      expectedReturnDate: selectedTransfer.expectedReturnDate,
      documentsReceived: checkinForm.receivedDocuments,
      attachment: createUploadedVoucherAttachment(checkinForm.attachmentFile),
      notes: checkinForm.notes.trim(),
    };

    if (!supplierOperationsDemoMode) {
      if (!selectedTransfer.databaseId) return;
      const saved = await persistSupplierOperation(async () => {
        let attachmentPath: string | null = null;
        try {
          attachmentPath = checkinForm.attachmentFile
            ? await uploadSupplierStorageFile(organizationId, 'vouchers', selectedTransfer.databaseId!, checkinForm.attachmentFile)
            : null;
          const { error } = await supabase.rpc('mes_supplier_checkin', {
            p_organization_id: organizationId,
            p_transfer_id: selectedTransfer.databaseId,
            p_quantity_received: quantityReceived,
            p_quantity_accepted: quantityAccepted,
            p_quantity_rejected: quantityRejected,
            p_documents_received: checkinForm.receivedDocuments,
            p_notes: checkinForm.notes.trim(),
            p_processed_by_label: 'Receiving',
            p_attachment_name: checkinForm.attachmentFile?.name ?? null,
            p_attachment_path: attachmentPath,
            p_attachment_type: checkinForm.attachmentFile?.type ?? null,
          });
          if (error) throw error;
        } catch (error) {
          if (attachmentPath) await supabase.storage.from(supplierFilesBucket).remove([attachmentPath]);
          throw error;
        }
      });
      if (saved) {
        setActiveVoucher(voucher);
        setCheckinForm((current) => ({
          ...current, quantityReceived: '', quantityAccepted: '', quantityRejected: '0', attachmentFile: null,
        }));
        setModalMode('voucher');
      }
      return;
    }

    updateTransfer(selectedTransfer.id, (transfer) => ({
      ...transfer,
      quantityReceived: transfer.quantityReceived + quantityReceived,
      quantityAccepted: transfer.quantityAccepted + quantityAccepted,
      quantityRejected: transfer.quantityRejected + quantityRejected,
      status: nextStatus,
      receivedDocuments: checkinForm.receivedDocuments,
      receivedNotes: checkinForm.notes.trim(),
      vouchers: [...transfer.vouchers, voucher],
      updatedAt: new Date().toISOString(),
    }));
    setActiveVoucher(voucher);
    setCheckinForm((current) => ({
      ...current,
      quantityReceived: '',
      quantityAccepted: '',
      quantityRejected: '0',
      attachmentFile: null,
    }));
    setModalMode('voucher');
  };

  const uploadDocument = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTransfer) return;

    if (!supplierOperationsDemoMode) {
      if (!selectedTransfer.databaseId || !documentForm.file) {
        setBackendError('Select the supplier document file before saving.');
        return;
      }
      const saved = await persistSupplierOperation(async () => {
        const filePath = await uploadSupplierStorageFile(
          organizationId, 'documents', selectedTransfer.databaseId!, documentForm.file!,
        );
        try {
          const { error } = await supabase.from('mes_supplier_documents').insert({
            organization_id: organizationId,
            transfer_id: selectedTransfer.databaseId,
            document_type: documentForm.documentType,
            file_name: documentForm.file!.name,
            file_path: filePath,
            file_type: documentForm.file!.type || 'application/octet-stream',
            uploaded_by_label: 'Quality',
            approval_status: documentForm.approvalStatus,
            file_hash: await getSupplierFileHash(documentForm.file!),
          });
          if (error) throw error;
        } catch (error) {
          await supabase.storage.from(supplierFilesBucket).remove([filePath]);
          throw error;
        }
      });
      if (saved) setModalMode(null);
      return;
    }

    const document: SupplierDocument = {
      id: `SD-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(selectedTransfer.documents.length + 1).padStart(3, '0')}`,
      transferId: selectedTransfer.id,
      supplier: selectedTransfer.supplierName,
      documentType: documentForm.documentType,
      fileName: documentForm.fileName.trim() || `${selectedTransfer.id}-${documentForm.documentType}.pdf`,
      fileUrl: '/assets/supplier-documents/sample-supplier-document.pdf',
      uploadedBy: 'Quality',
      uploadedAt: new Date().toISOString(),
      approvalStatus: documentForm.approvalStatus,
      hash: `sha256:demo-${Math.random().toString(16).slice(2, 8)}`,
    };

    updateTransfer(selectedTransfer.id, (transfer) => {
      const receivedDocuments = Array.from(new Set([...transfer.receivedDocuments, document.documentType]));
      const hasMissingDocuments = transfer.requiredDocuments.some((documentType) => !receivedDocuments.includes(documentType));
      return {
        ...transfer,
        documents: [...transfer.documents, document],
        receivedDocuments,
        status: transfer.status === 'documents-pending' && !hasMissingDocuments ? 'completed' : transfer.status,
        updatedAt: new Date().toISOString(),
      };
    });
    setModalMode(null);
  };

  const renderKpiTransferTray = (items: SupplierTransfer[]) => (
    <div className="supplier-kpi-transfer-tray">
      {items.length > 0 ? items.map((transfer) => (
        <button
          key={transfer.id}
          type="button"
          className={isOverdueTransfer(transfer) ? 'overdue' : ''}
          onClick={() => {
            setSelectedTransferId(transfer.id);
            onActiveTabChange('transfers');
          }}
        >
          {isOverdueTransfer(transfer) ? <Clock className="supplier-overdue-card-icon" size={15} aria-hidden="true" /> : null}
          <span>{transfer.id}</span>
          <strong>{transfer.supplierName}</strong>
          <em>{formatSupplierDate(transfer.expectedReturnDate)}</em>
        </button>
      )) : (
        <p>No transfers</p>
      )}
    </div>
  );

  const supplierKpiGrid = (
    <div className="supplier-kpi-grid">
      <div className="supplier-kpi-group supplier-kpi-group-primary">
        <article><span><ClipboardCheck size={16} /> Active Transfers</span><strong>{activeSupplierTransfers.length}</strong><em>open supplier records</em></article>
        <article className={`supplier-overdue-kpi ${overdueTransfers > 0 ? 'risk' : 'clear'}`}>
          <span><Clock size={16} /> Overdue Transfers</span>
          <strong>{overdueTransfers}</strong>
          <em>past expected return</em>
        </article>
      </div>
      <div className="supplier-kpi-group supplier-kpi-group-secondary">
        <div className="supplier-kpi-stack">
          <article><span><Truck size={16} /> Sent to Supplier</span><strong>{sentTransfers}</strong><em>physically checked out</em></article>
          {renderKpiTransferTray(sentToSupplierTransfers)}
        </div>
        <div className="supplier-kpi-stack">
          <article><span><PackageCheck size={16} /> Pending Return</span><strong>{pendingReturn}</strong><em>ready or in transit</em></article>
          {renderKpiTransferTray(pendingReturnTransfers)}
        </div>
        <div className="supplier-kpi-stack">
          <article><span><FileText size={16} /> Missing Documents</span><strong>{missingDocuments}</strong><em>requires supplier docs</em></article>
          {renderKpiTransferTray(missingDocumentTransfers)}
        </div>
      </div>
    </div>
  );

  const supplierTransfersTable = (
    <>
      <div className="production-orders-panel-title supplier-panel-title">
        <strong>Supplier Transfers</strong>
        <span>{transfers.length} tracked transfers</span>
        <button type="button" onClick={openCreateTransfer}><Plus size={16} /> New Supplier Transfer</button>
      </div>
      <div className="mes-table-wrap supplier-table-wrap">
        <table className="mes-table supplier-transfers-table">
          <thead>
            <tr>
              <th>Transfer ID</th>
              <th>Production Order</th>
              <th>Supplier</th>
              <th>Process</th>
              <th>Part Number</th>
              <th>Lot / Serial</th>
              <th>Qty Sent</th>
              <th>Qty Received</th>
              <th>Status</th>
              <th>Expected Return</th>
              <th>Documents</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((transfer) => (
              <tr key={transfer.id} className={selectedTransfer?.id === transfer.id ? 'selected' : ''}>
                <td><strong>{transfer.id}</strong></td>
                <td>{transfer.productionOrder}</td>
                <td><strong>{transfer.supplierName}</strong></td>
                <td>{transfer.externalProcess}</td>
                <td>{transfer.partNumber}</td>
                <td>{transfer.lotSerial}</td>
                <td>{transfer.quantitySent.toLocaleString()}</td>
                <td>{transfer.quantityReceived.toLocaleString()}</td>
                <td><SupplierStatusBadge status={transfer.status} /></td>
                <td>{formatSupplierDate(transfer.expectedReturnDate)}</td>
                <td>{transfer.receivedDocuments.length}/{transfer.requiredDocuments.length}<span>{getMissingDocuments(transfer).map(formatSupplierLabel).join(', ') || 'Complete'}</span></td>
                <td>
                  <div className="supplier-table-actions">
                    <button type="button" onClick={() => setSelectedTransferId(transfer.id)} aria-label={`View ${transfer.id}`}><Eye size={15} /></button>
                    <button type="button" onClick={() => goToCheckTerminal(transfer)} disabled={transfer.status !== 'ready-for-checkout'} aria-label={`Check out ${transfer.id}`}><Truck size={15} /></button>
                    <button type="button" onClick={() => goToCheckTerminal(transfer)} disabled={!['sent-to-supplier', 'discrepancy'].includes(transfer.status)} aria-label={`Check in ${transfer.id}`}><PackageCheck size={15} /></button>
                    <button type="button" onClick={() => goToUploadDocument(transfer)} aria-label={`Upload document for ${transfer.id}`}><Upload size={15} /></button>
                    <button type="button" onClick={() => openEditTransfer(transfer)} disabled={transfer.status !== 'ready-for-checkout'} aria-label={`Edit ${transfer.id}`}><Pencil size={15} /></button>
                    <button type="button" onClick={() => deleteTransfer(transfer)} disabled={transfer.status !== 'ready-for-checkout'} aria-label={`Delete ${transfer.id}`}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  const activeTransfersBar = (
    <section className="supplier-active-transfers" aria-label="Active supplier transfers">
      <div>
        <span>Active Transfers</span>
        <strong>{activeSupplierTransfers.length} active supplier transfers</strong>
      </div>
      <div className="supplier-active-transfer-list">
        {activeSupplierTransfers.map((transfer) => (
          <article
            key={transfer.id}
            className={selectedTransfer?.id === transfer.id ? 'active' : ''}
          >
            <button type="button" className="supplier-active-transfer-select" onClick={() => setSelectedTransferId(transfer.id)}>
              <strong>{transfer.id}</strong>
              <em>{transfer.externalProcess}</em>
            </button>
            <button
              type="button"
              className="supplier-active-transfer-supplier"
              onClick={() => onActiveTabChange('suppliers')}
            >
              {transfer.supplierName}
            </button>
            <SupplierStatusBadge status={transfer.status} />
          </article>
        ))}
      </div>
    </section>
  );

  const selectedTransferSummary = selectedTransfer ? (
    <section className="supplier-selected-transfer-summary">
      <div className="supplier-section-heading">
        <span><PackageCheck size={16} /> Transfer Detail</span>
        <strong>{selectedTransfer.id}</strong>
      </div>
      <div className="supplier-selected-transfer-grid">
        <span><b>Transfer ID</b>{selectedTransfer.id}</span>
        <span><b>Production Order</b>{selectedTransfer.productionOrder}</span>
        <span><b>Supplier</b>{selectedTransfer.supplierName}</span>
        <span><b>Process</b>{selectedTransfer.externalProcess}</span>
        <span><b>Part Number</b>{selectedTransfer.partNumber}</span>
        <span><b>Lot / Serial</b>{selectedTransfer.lotSerial}</span>
        <span><b>Date of Issuance</b>{formatSupplierDate(selectedTransfer.createdAt.slice(0, 10))}</span>
        <span className={isOverdueTransfer(selectedTransfer) ? 'supplier-selected-transfer-overdue-date' : ''}>
          {isOverdueTransfer(selectedTransfer) ? <Clock className="supplier-selected-transfer-overdue-icon" size={15} aria-hidden="true" /> : null}
          <b>Expected Return</b>
          {formatSupplierDate(selectedTransfer.expectedReturnDate)}
        </span>
        <span className={`supplier-selected-transfer-status supplier-selected-transfer-status-${selectedTransfer.status}`}>
          <b>Status</b>
          <strong>{formatSupplierLabel(selectedTransfer.status)}</strong>
        </span>
      </div>
      <div className="supplier-selected-transfer-actions">
        <button type="button" onClick={() => goToCheckTerminal(selectedTransfer)} disabled={selectedTransfer.status !== 'ready-for-checkout'}><Truck size={16} /> Check Out</button>
        <button type="button" onClick={() => goToCheckTerminal(selectedTransfer)} disabled={!['sent-to-supplier', 'discrepancy'].includes(selectedTransfer.status)}><PackageCheck size={16} /> Check In</button>
        <button type="button" onClick={() => goToUploadDocument(selectedTransfer)}><Upload size={16} /> Upload Document</button>
        <button className="supplier-transfer-edit-action" type="button" onClick={() => openEditTransfer(selectedTransfer)} disabled={selectedTransfer.status !== 'ready-for-checkout'}><Pencil size={16} /> Edit</button>
        <button className="supplier-transfer-delete-action" type="button" onClick={() => deleteTransfer(selectedTransfer)} disabled={selectedTransfer.status !== 'ready-for-checkout'}><Trash2 size={16} /> Delete</button>
      </div>
      <div className="supplier-transfer-artifacts">
        <div className="supplier-detail-block">
          <strong>Documents</strong>
          {selectedTransfer.documents.length ? selectedTransfer.documents.map((document) => (
            <article className="supplier-document-row" key={document.id}>
              <FileText size={16} />
              <span><b>{document.fileName}</b>{formatSupplierLabel(document.documentType)} / {formatSupplierTimestamp(document.uploadedAt)}</span>
              <SupplierStatusBadge status={document.approvalStatus} />
            </article>
          )) : <span className="supplier-empty-note">No supplier documents attached yet.</span>}
        </div>
        <div className="supplier-detail-block">
          <strong>Vouchers</strong>
          {selectedTransfer.vouchers.length ? selectedTransfer.vouchers.map((voucher) => (
            <button
              className="supplier-voucher-link"
              type="button"
              key={voucher.id}
              onClick={() => {
                setActiveVoucher(voucher);
                setModalMode('voucher');
              }}
            >
              <FileText size={16} />
              <span>{voucher.id}<em>{voucher.direction === 'inbound' ? 'Inbound' : 'Outbound'}</em></span>
            </button>
          )) : <span className="supplier-empty-note">No vouchers generated yet.</span>}
        </div>
      </div>
    </section>
  ) : null;

  const supplierManagementSection = (
    <section className="supplier-section">
      <div className="supplier-section-heading">
        <span><Building2 size={16} /> Supplier Management</span>
        <strong>{suppliers.length} external suppliers</strong>
      </div>
      <div className="supplier-card-grid">
        {suppliers.map((supplier) => (
          <article key={supplier.id}>
            <div className="supplier-card-main">
              <div className="supplier-card-copy">
                <div className="supplier-card-topline">
                  <strong>{supplier.name}</strong>
                  <SupplierStatusBadge status={supplier.approvedStatus} />
                </div>
                <span><b>Contact:</b> {supplier.contactName}</span>
                <span><b>Email:</b> {supplier.email}</span>
                <span><b>Phone:</b> {supplier.phone}</span>
                <div className="supplier-capability-pills">
                  {supplier.processCapabilities.map((capability) => (
                    <em
                      key={capability}
                      style={{ '--supplier-pill-color': getSupplierCapabilityColor(capability) } as React.CSSProperties}
                    >
                      {capability}
                    </em>
                  ))}
                </div>
                <p className="supplier-card-notes">
                  <span>Comment:</span>
                  {supplier.notes || 'No supplier notes yet.'}
                </p>
              </div>
              <div className="supplier-card-media">
                <div className="supplier-logo-frame" aria-label={`${supplier.name} logo`}>
                  <span>{getSupplierInitials(supplier.name)}</span>
                </div>
                <div className="supplier-card-document-actions">
                  <button
                    type="button"
                    disabled={!supplier.fiscalDocument}
                    onClick={() => {
                      if (!supplier.fiscalDocument) return;
                      setPreviewSupplierPdf(supplier.fiscalDocument);
                      setModalMode('supplier-pdf-preview');
                    }}
                  >
                    Fiscal Data
                  </button>
                  <button
                    type="button"
                    disabled={!supplier.bankingDocument}
                    onClick={() => {
                      if (!supplier.bankingDocument) return;
                      setPreviewSupplierPdf(supplier.bankingDocument);
                      setModalMode('supplier-pdf-preview');
                    }}
                  >
                    Bank Data
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  const selectedTransferDetail = selectedTransfer ? (
    <aside className="supplier-detail-panel">
      <div className="supplier-detail-header">
        <span>Selected Transfer</span>
        <strong>{selectedTransfer.id}</strong>
        <div className="supplier-parts-metric-grid">
          <article>
            <span>Sent Parts</span>
            <strong>{selectedTransfer.quantitySent.toLocaleString()}</strong>
          </article>
          <article>
            <span>Pending Parts</span>
            <strong>{Math.max(0, selectedTransfer.quantitySent - selectedTransfer.quantityReceived).toLocaleString()}</strong>
          </article>
        </div>
      </div>
      <div className="supplier-detail-block">
        <strong>Required Documents</strong>
        <div className="supplier-document-status-sections">
          <section>
            <span>Pending from Supplier</span>
            <div className="supplier-document-tags supplier-document-tags-pending">
              {selectedTransfer.requiredDocuments
                .filter((documentType) => !selectedTransfer.documents.some((document) => document.documentType === documentType))
                .map((documentType) => (
                  <span key={documentType}>{formatSupplierLabel(documentType)}</span>
                ))}
              {selectedTransfer.requiredDocuments.every((documentType) => selectedTransfer.documents.some((document) => document.documentType === documentType)) ? (
                <em>No pending documents</em>
              ) : null}
            </div>
          </section>
          <section>
            <span>Delivered by Supplier</span>
            <div className="supplier-document-tags supplier-document-tags-delivered">
              {selectedTransfer.documents.filter((document) => selectedTransfer.requiredDocuments.includes(document.documentType)).map((document) => (
                <button
                  type="button"
                  key={document.id}
                  onClick={() => {
                    setPreviewDocument(document);
                    setModalMode('document-preview');
                  }}
                >
                  {formatSupplierLabel(document.documentType)}
                </button>
              ))}
              {selectedTransfer.documents.some((document) => selectedTransfer.requiredDocuments.includes(document.documentType)) ? null : (
                <em>No delivered documents</em>
              )}
            </div>
          </section>
        </div>
      </div>
    </aside>
  ) : null;

  const vouchersAndDocsSection = (
    <section className="supplier-section">
      <div className="supplier-section-heading">
        <span><FileText size={16} /> Vouchers and Docs</span>
        <strong>{filteredSupplierDocTransfers.length} matching transfer orders</strong>
      </div>
      <div className="supplier-docs-filter-panel">
        <label>
          Transfer / Order
          <input
            type="search"
            placeholder="Search ST-260615-001 or MO-24018"
            value={supplierDocsFilters.transferSearch}
            onChange={(event) => setSupplierDocsFilters((current) => ({ ...current, transferSearch: event.target.value }))}
          />
        </label>
        <label>
          Supplier Name
          <input
            type="search"
            placeholder="Supplier name"
            value={supplierDocsFilters.supplierSearch}
            onChange={(event) => setSupplierDocsFilters((current) => ({ ...current, supplierSearch: event.target.value }))}
          />
        </label>
        <label>
          Capability
          <select value={supplierDocsFilters.capability} onChange={(event) => setSupplierDocsFilters((current) => ({ ...current, capability: event.target.value }))}>
            <option value="">All capabilities</option>
            {supplierDocsCapabilityOptions.map((capability) => <option key={capability} value={capability}>{capability}</option>)}
          </select>
        </label>
      </div>
      <div className="supplier-docs-filter-panel supplier-docs-filter-panel-secondary">
        <label>
          Work Center
          <select value={supplierDocsFilters.workCenter} onChange={(event) => setSupplierDocsFilters((current) => ({ ...current, workCenter: event.target.value }))}>
            <option value="">All Work Centers</option>
            {supplierDocsWorkCenterOptions.map((workCenter) => <option key={workCenter} value={workCenter}>{workCenter}</option>)}
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={supplierDocsFilters.dateFrom}
            onChange={(event) => setSupplierDocsFilters((current) => ({ ...current, dateFrom: event.target.value }))}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={supplierDocsFilters.dateTo}
            onChange={(event) => setSupplierDocsFilters((current) => ({ ...current, dateTo: event.target.value }))}
          />
        </label>
        <fieldset className="supplier-docs-shift-filter">
          <legend>Shift</legend>
          {[
            { value: '', label: 'All' },
            { value: '1st', label: '1st' },
            { value: '2nd', label: '2nd' },
            { value: '3rd', label: '3rd' },
          ].map((shift) => (
            <button
              type="button"
              key={shift.label}
              className={supplierDocsFilters.shift === shift.value ? 'active' : ''}
              onClick={() => setSupplierDocsFilters((current) => ({ ...current, shift: shift.value }))}
            >
              {shift.label}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="supplier-docs-toolbar">
        <span><Eye size={16} /> {filteredSupplierDocTransfers.length} matching records {hasSupplierDocsFilters ? '/ filtered context on' : '/ all context'}</span>
        <div className="supplier-docs-toolbar-actions">
          <label className="supplier-docs-completed-toggle">
            <input
              type="checkbox"
              checked={supplierDocsFilters.showCompletedOrders}
              onChange={(event) => setSupplierDocsFilters((current) => ({
                ...current,
                showCompletedOrders: event.target.checked,
                onlyShowCompletedOrders: event.target.checked ? current.onlyShowCompletedOrders : false,
              }))}
            />
            <span>Show Completed Orders</span>
          </label>
          <label className="supplier-docs-completed-toggle">
            <input
              type="checkbox"
              checked={supplierDocsFilters.onlyShowCompletedOrders}
              onChange={(event) => setSupplierDocsFilters((current) => ({
                ...current,
                showCompletedOrders: event.target.checked ? true : current.showCompletedOrders,
                onlyShowCompletedOrders: event.target.checked,
              }))}
            />
            <span>Only Show Completed Orders</span>
          </label>
          <button type="button" onClick={() => setSupplierDocsFilters(defaultSupplierDocsFilters)}>Clear Filters</button>
        </div>
      </div>
      {filteredSupplierDocTransfers.length ? (
        <section className="supplier-context-transfers" aria-label="Transfer orders matching vouchers and docs context">
          <div>
            <span>Context Transfer Orders</span>
            <strong>{filteredSupplierDocTransfers.length} matching transfer orders</strong>
          </div>
          <div className="supplier-context-transfer-list">
            {filteredSupplierDocTransfers.map((transfer) => (
              <button
                type="button"
                key={transfer.id}
                className={selectedDocsTransfer?.id === transfer.id ? 'active' : ''}
                onClick={() => setSelectedTransferId(transfer.id)}
              >
                <strong>{transfer.id}</strong>
                <span>{transfer.productionOrder} / {transfer.partNumber}</span>
                <em className="supplier-context-transfer-supplier">{transfer.supplierName}</em>
                <span
                  className="supplier-capability-pill supplier-context-transfer-capability"
                  style={{
                    '--supplier-capability-color': getSupplierCapabilityColor(transfer.externalProcess),
                  } as React.CSSProperties}
                >
                  {transfer.externalProcess}
                </span>
                <SupplierStatusBadge status={transfer.status} />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="supplier-empty-note">No transfer orders match the current filters.</div>
      )}
      {selectedDocsTransfer ? (
        <div className="supplier-documents-workspace">
          <section>
            <div className="supplier-section-heading">
              <span><FileText size={16} /> Outbound Vouchers</span>
              <strong>{selectedDocsTransfer.vouchers.filter((voucher) => voucher.direction === 'outbound').length} records</strong>
            </div>
            <div className="supplier-document-card-list">
              {selectedDocsTransfer.vouchers.filter((voucher) => voucher.direction === 'outbound').map((voucher) => (
                <button type="button" key={voucher.id} onClick={() => { setActiveVoucher(voucher); setModalMode('voucher'); }}>
                  <FileText size={16} />
                  <span><b>{voucher.id}</b>{formatSupplierTimestamp(voucher.checkoutDate ?? selectedDocsTransfer.updatedAt)}</span>
                </button>
              ))}
              {selectedDocsTransfer.vouchers.some((voucher) => voucher.direction === 'outbound') ? null : <em>No outbound vouchers generated.</em>}
            </div>
          </section>
          <section>
            <div className="supplier-section-heading">
              <span><FileText size={16} /> Inbound Vouchers</span>
              <strong>{selectedDocsTransfer.vouchers.filter((voucher) => voucher.direction === 'inbound').length} records</strong>
            </div>
            <div className="supplier-document-card-list">
              {selectedDocsTransfer.vouchers.filter((voucher) => voucher.direction === 'inbound').map((voucher) => (
                <button type="button" key={voucher.id} onClick={() => { setActiveVoucher(voucher); setModalMode('voucher'); }}>
                  <FileText size={16} />
                  <span><b>{voucher.id}</b>{formatSupplierTimestamp(voucher.receivedDate ?? selectedDocsTransfer.updatedAt)}</span>
                </button>
              ))}
              {selectedDocsTransfer.vouchers.some((voucher) => voucher.direction === 'inbound') ? null : <em>No inbound vouchers generated.</em>}
            </div>
          </section>
          <section>
            <div className="supplier-section-heading">
              <span><ClipboardCheck size={16} /> Expected Documents from the Supplier</span>
              <strong>{selectedDocsTransfer.requiredDocuments.length} required</strong>
            </div>
            <div className="supplier-document-card-list supplier-order-document-list">
              {selectedDocsTransfer.requiredDocuments.map((documentType) => (
                <span className={selectedDocsTransfer.receivedDocuments.includes(documentType) ? 'received' : ''} key={documentType}>
                  <b>{formatSupplierLabel(documentType)}</b>
                  {selectedDocsTransfer.receivedDocuments.includes(documentType) ? 'Received' : 'Pending from supplier'}
                </span>
              ))}
            </div>
          </section>
          <section>
            <div className="supplier-section-heading">
              <span><Upload size={16} /> Documents for the Supplier</span>
              <strong>{selectedDocsTransfer.documents.length} uploaded</strong>
            </div>
            <div className="supplier-document-card-list">
              {selectedDocsTransfer.documents.map((document) => (
                <button
                  type="button"
                  key={document.id}
                  onClick={() => {
                    setPreviewDocument(document);
                    setModalMode('document-preview');
                  }}
                >
                  <FileText size={16} />
                  <span><b>{document.fileName}</b>{formatSupplierLabel(document.documentType)} / {formatSupplierTimestamp(document.uploadedAt)}</span>
                </button>
              ))}
              {selectedDocsTransfer.documents.length ? null : <em>No supplier documents uploaded.</em>}
              <button type="button" onClick={() => openDocumentUpload(selectedDocsTransfer)}><Upload size={16} /> Upload Supplier Document</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );

  const checkInOutSection = (
    <div className="supplier-checkinout-workspace">
      <section className="supplier-section supplier-active-transfer-selector">
        <div className="supplier-section-heading">
          <span>Active Transfers</span>
          <strong>{activeSupplierTransfers.length} active supplier transfers</strong>
        </div>
        {activeSupplierTransfers.length ? (
          <div className="supplier-active-transfer-strip">
            {activeSupplierTransfers.map((transfer) => (
              <button
                type="button"
                key={transfer.id}
                className={selectedCheckTransfer?.id === transfer.id ? 'active' : ''}
                onClick={() => selectCheckTransfer(transfer)}
              >
                <strong>{transfer.id}</strong>
                <span>{transfer.externalProcess}</span>
                <em>{transfer.supplierName}</em>
                <SupplierStatusBadge status={transfer.status} />
              </button>
            ))}
          </div>
        ) : <span className="supplier-empty-note">No active transfers available for check in/out.</span>}
      </section>

      {selectedCheckTransfer ? (
        <section className="supplier-section supplier-terminal-panel">
          <div className="supplier-terminal-heading">
            <span><Truck size={16} /> Transfer Terminal</span>
            <SupplierStatusBadge status={selectedCheckTransfer.status} />
          </div>

          <div className="supplier-terminal-selected-layout">
            <div className="supplier-terminal-selected-main">
              <div className="supplier-terminal-now">
                <article>
                  <span>Transfer ID</span>
                  <strong>{selectedCheckTransfer.id}</strong>
                </article>
                <article>
                  <span>Supplier</span>
                  <strong>{selectedCheckTransfer.supplierName}</strong>
                </article>
                <article className="supplier-terminal-capability-card">
                  <span>Capability</span>
                  <strong>
                    <em
                      className="supplier-capability-pill supplier-terminal-capability-pill"
                      style={{
                        '--supplier-capability-color': getSupplierCapabilityColor(selectedCheckTransfer.externalProcess),
                      } as React.CSSProperties}
                    >
                      {selectedCheckTransfer.externalProcess}
                    </em>
                  </strong>
                </article>
                <article>
                  <span>Expected Return</span>
                  <strong>{formatSupplierDate(selectedCheckTransfer.expectedReturnDate)}</strong>
                </article>
              </div>

              <div className="supplier-terminal-detail-grid">
                <article>
                  <span>Production Order</span>
                  <strong>{selectedCheckTransfer.productionOrder}</strong>
                </article>
                <article>
                  <span>Part Number</span>
                  <strong>{selectedCheckTransfer.partNumber}</strong>
                </article>
                <article>
                  <span>Lot / Serial</span>
                  <strong>{selectedCheckTransfer.lotSerial || 'N/A'}</strong>
                </article>
              </div>
            </div>

            <aside className="supplier-terminal-selected-summary">
              <span>Selected Transfer</span>
              <strong>{selectedCheckTransfer.id}</strong>
              <div>
                <article>
                  <span>Sent Parts</span>
                  <strong>{selectedCheckTransfer.quantitySent.toLocaleString()}</strong>
                </article>
                <article>
                  <span>Pending Parts</span>
                  <strong>{Math.max(selectedCheckTransfer.quantitySent - selectedCheckTransfer.quantityReceived, 0).toLocaleString()}</strong>
                </article>
              </div>
            </aside>
          </div>

          <div className="supplier-terminal-actions">
            <form onSubmit={checkoutTransfer}>
              <button className="supplier-terminal-action supplier-terminal-action-out" type="submit" disabled={!canCheckOutSelectedTransfer}>
                <Truck size={28} />
                <strong>Check-Out</strong>
                <span>{canCheckOutSelectedTransfer ? 'Send parts to supplier' : 'Unavailable for current status'}</span>
              </button>
              <div className="supplier-terminal-form-grid">
                <label>
                  Qty Out
                  <input min="1" type="number" value={checkoutForm.quantitySent} onChange={(event) => setCheckoutForm((current) => ({ ...current, quantitySent: event.target.value }))} disabled={!canCheckOutSelectedTransfer} />
                </label>
                <label>
                  Carrier / Seal
                  <input type="text" placeholder="Dock, carrier, seal" disabled={!canCheckOutSelectedTransfer} />
                </label>
                <label className="supplier-terminal-wide-field">
                  Checkout Notes
                  <textarea value={checkoutForm.notes} onChange={(event) => setCheckoutForm((current) => ({ ...current, notes: event.target.value }))} disabled={!canCheckOutSelectedTransfer} />
                </label>
                <label className="supplier-terminal-wide-field">
                  Attach Physical Document
                  <span className="supplier-file-upload-control">
                    <span><Upload size={15} /> Select File</span>
                    <em>{checkoutForm.attachmentFile?.name ?? 'No file selected'}</em>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      disabled={!canCheckOutSelectedTransfer}
                      onChange={(event) => setCheckoutForm((current) => ({ ...current, attachmentFile: event.target.files?.[0] ?? null }))}
                    />
                  </span>
                </label>
                <label className="supplier-terminal-confirm-field">
                  <input type="checkbox" checked={checkoutForm.confirmed} onChange={(event) => setCheckoutForm((current) => ({ ...current, confirmed: event.target.checked }))} disabled={!canCheckOutSelectedTransfer} />
                  <span>Parts verified before leaving the facility</span>
                </label>
              </div>
            </form>

            <form onSubmit={checkinTransfer}>
              <button className="supplier-terminal-action supplier-terminal-action-in" type="submit" disabled={!canCheckInSelectedTransfer}>
                <PackageCheck size={28} />
                <strong>Check-In</strong>
                <span>{canCheckInSelectedTransfer ? 'Receive supplier return' : 'Unavailable for current status'}</span>
              </button>
              <div className="supplier-terminal-form-grid">
                <label>
                  Qty In
                  <input min="0" type="number" value={checkinForm.quantityReceived} onChange={(event) => setCheckinForm((current) => ({ ...current, quantityReceived: event.target.value }))} disabled={!canCheckInSelectedTransfer} />
                </label>
                <label>
                  Accepted
                  <input min="0" type="number" value={checkinForm.quantityAccepted} onChange={(event) => setCheckinForm((current) => ({ ...current, quantityAccepted: event.target.value }))} disabled={!canCheckInSelectedTransfer} />
                </label>
                <label>
                  Rejected
                  <input min="0" type="number" value={checkinForm.quantityRejected} onChange={(event) => setCheckinForm((current) => ({ ...current, quantityRejected: event.target.value }))} disabled={!canCheckInSelectedTransfer} />
                </label>
                <label>
                  Receiver / Dock
                  <input type="text" placeholder="Receiver, dock" disabled={!canCheckInSelectedTransfer} />
                </label>
                <div className="supplier-terminal-wide-field supplier-terminal-documents">
                  <span>Documents Received</span>
                  <SupplierDocumentChecklist value={checkinForm.receivedDocuments} onChange={(receivedDocuments) => setCheckinForm((current) => ({ ...current, receivedDocuments }))} />
                </div>
                <label className="supplier-terminal-wide-field">
                  Receiving Notes
                  <textarea value={checkinForm.notes} onChange={(event) => setCheckinForm((current) => ({ ...current, notes: event.target.value }))} disabled={!canCheckInSelectedTransfer} />
                </label>
                <label className="supplier-terminal-wide-field">
                  Attach Physical Document
                  <span className="supplier-file-upload-control">
                    <span><Upload size={15} /> Select File</span>
                    <em>{checkinForm.attachmentFile?.name ?? 'No file selected'}</em>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      disabled={!canCheckInSelectedTransfer}
                      onChange={(event) => setCheckinForm((current) => ({ ...current, attachmentFile: event.target.files?.[0] ?? null }))}
                    />
                  </span>
                </label>
              </div>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );

  const addressSuggestionMenu = (showAddressSuggestions || addressSuggestionsLoading) && (addressSuggestions.length > 0 || addressSuggestionsLoading) && addressSuggestionPosition
    ? createPortal(
      <div
        className="address-suggestion-menu supplier-modal-floating-menu"
        role="listbox"
        aria-label="Address suggestions"
        ref={addressSuggestionMenuRef}
        style={{
          top: addressSuggestionPosition.top,
          left: addressSuggestionPosition.left,
          width: addressSuggestionPosition.width,
          maxHeight: addressSuggestionPosition.maxHeight,
        }}
      >
        {addressSuggestionsLoading ? <span className="address-suggestion-loading">Searching locations...</span> : null}
        {addressSuggestions.map((suggestion) => (
          <button type="button" role="option" key={suggestion.placeId ?? suggestion.address} onClick={() => { void selectAddressSuggestion(suggestion); }}>
            <strong>{suggestion.address.split(',')[0]}</strong>
            <span>{suggestion.address.split(',').slice(1).join(',').trim()}</span>
          </button>
        ))}
      </div>,
      document.body,
    )
    : null;

  const supplierHeaderContent: Record<SupplierContextTab, { eyebrow: string; title: string; description: string }> = {
    dashboard: {
      eyebrow: 'MES / Suppliers Dashboard',
      title: 'Supplier Dashboard',
      description: 'Monitor supplier transfer KPIs, overdue activity, and document risk at a glance.',
    },
    transfers: {
      eyebrow: 'MES / Supplier Transfers',
      title: 'Transfer Orders',
      description: 'Review active supplier transfers, shipment status, vouchers, quantities, and return expectations.',
    },
    suppliers: {
      eyebrow: 'MES / Supplier Directory',
      title: 'Supplier Management',
      description: 'Manage external suppliers, capabilities, contacts, fiscal files, and banking documents.',
    },
    'vouchers-docs': {
      eyebrow: 'MES / Supplier Documents',
      title: 'Vouchers and Docs',
      description: 'Find transfer orders and inspect outbound vouchers, inbound vouchers, order documents, and supplier files.',
    },
    'check-in-out': {
      eyebrow: 'MES / Supplier Terminal',
      title: 'Check In / Out',
      description: 'Process supplier check-outs and returns with focused transfer details and operational controls.',
    },
  };
  const activeHeaderContent = supplierHeaderContent[activeTab];

  const capabilityDropdownMenu = showCapabilityDropdown && capabilityDropdownPosition
    ? createPortal(
      <div
        className="address-suggestion-menu supplier-modal-floating-menu supplier-capability-dropdown-menu"
        role="listbox"
        aria-label="Supplier capabilities"
        ref={capabilityDropdownMenuRef}
        style={{
          top: capabilityDropdownPosition.top,
          left: capabilityDropdownPosition.left,
          width: capabilityDropdownPosition.width,
          maxHeight: capabilityDropdownPosition.maxHeight,
        }}
      >
        {supplierCapabilityPickerOptions.map((capability) => (
          <button type="button" role="option" key={capability} onClick={() => addSupplierCapability(capability)}>
            <strong>{capability}</strong>
          </button>
        ))}
        <button
          type="button"
          role="option"
          className="supplier-register-capability-option"
          onClick={() => {
            setSupplierForm((current) => ({ ...current, capability: registerNewSupplierCapabilityValue }));
            setShowCapabilityDropdown(false);
          }}
        >
          <strong>+ Register new capability</strong>
        </button>
      </div>,
      document.body,
    )
    : null;

  const capabilityColorPicker = showCapabilityColorPicker && capabilityColorPickerPosition
    ? createPortal(
      <div
        className="capability-color-popover supplier-modal-color-popover"
        ref={capabilityColorPickerRef}
        role="dialog"
        aria-label="Custom capability color"
        style={{
          top: capabilityColorPickerPosition.top,
          left: capabilityColorPickerPosition.left,
          width: capabilityColorPickerPosition.width,
        }}
      >
        <div className="capability-color-preview" aria-live="polite">
          <span style={{ backgroundColor: supplierForm.newCapabilityColor }} />
          <strong>{supplierForm.newCapabilityColor.toUpperCase()}</strong>
        </div>
        <div className="capability-visual-picker">
          <div
            className="capability-color-field"
            role="slider"
            tabIndex={0}
            aria-label="Capability color saturation and brightness"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(newCapabilityHsv.value)}
            aria-valuetext={`${Math.round(newCapabilityHsv.saturation)} percent saturation, ${Math.round(newCapabilityHsv.value)} percent brightness`}
            style={{ backgroundColor: supplierHsvToHex(newCapabilityHsv.hue, 100, 100) }}
            onPointerDown={startNewSupplierCapabilityColorFieldDrag}
            onPointerMove={(event) => { if (event.buttons || event.pointerType !== 'mouse') updateNewSupplierCapabilityColorField(event); }}
            onKeyDown={moveNewSupplierCapabilityColorField}
          >
            <span
              style={{
                left: `${newCapabilityHsv.saturation}%`,
                top: `${100 - newCapabilityHsv.value}%`,
              }}
            />
          </div>
          <label className="capability-hue-slider">
            <span aria-hidden="true">#</span>
            <input type="range" min="0" max="359" value={newCapabilityHsv.hue} onChange={(event) => updateNewSupplierCapabilityHue(event.target.value)} aria-label="Capability color hue" />
          </label>
        </div>
        <button className="capability-color-apply" type="button" onClick={() => setShowCapabilityColorPicker(false)}>
          <Check size={15} />
          Use color
        </button>
      </div>,
      document.body,
    )
    : null;

  const renderModal = () => {
    if (!modalMode) return null;

    return (
      <div className="supplier-modal-backdrop" role="presentation">
        <div className={`supplier-modal ${modalMode === 'voucher' ? 'supplier-voucher-modal' : ''}`} role="dialog" aria-modal="true">
          <button className="supplier-modal-close" type="button" onClick={() => setModalMode(null)} aria-label="Close dialog">
            <X size={18} />
          </button>

          {modalMode === 'create' || modalMode === 'edit-transfer' ? (
            <form onSubmit={modalMode === 'edit-transfer' ? editTransfer : createTransfer}>
              <div className="supplier-modal-header">
                <span>Supplier Transfer</span>
                <strong>{modalMode === 'edit-transfer' ? 'Edit Supplier Transfer' : 'New Supplier Transfer'}</strong>
              </div>
              <div className="supplier-form-grid">
                <label>
                  Production Order
                  <select value={transferForm.productionOrder} onChange={(event) => {
                    const order = productionOrders.find((item) => item.orderNumber === event.target.value);
                    setTransferForm((current) => ({ ...current, productionOrder: event.target.value, partNumber: order?.partNumber ?? current.partNumber }));
                  }}>
                    {productionOrders.map((order) => <option key={order.id} value={order.orderNumber}>{order.orderNumber} / {order.partNumber}</option>)}
                  </select>
                </label>
                <label>
                  Supplier
                  <select value={transferForm.supplierId} onChange={(event) => setTransferForm((current) => ({ ...current, supplierId: event.target.value }))}>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </label>
                <label>
                  External Process
                  <input required value={transferForm.externalProcess} onChange={(event) => setTransferForm((current) => ({ ...current, externalProcess: event.target.value }))} />
                </label>
                <label>
                  Part Number
                  <input required value={transferForm.partNumber} onChange={(event) => setTransferForm((current) => ({ ...current, partNumber: event.target.value }))} />
                </label>
                <label>
                  Lot Number / Serial Number
                  <input required value={transferForm.lotSerial} onChange={(event) => setTransferForm((current) => ({ ...current, lotSerial: event.target.value }))} />
                </label>
                <label>
                  Quantity to Send
                  <input required min="1" type="number" value={transferForm.quantityToSend} onChange={(event) => setTransferForm((current) => ({ ...current, quantityToSend: event.target.value }))} />
                </label>
                <label>
                  Expected Return Date
                  <input required type="date" value={transferForm.expectedReturnDate} onChange={(event) => setTransferForm((current) => ({ ...current, expectedReturnDate: event.target.value }))} />
                </label>
              </div>
              <fieldset>
                <legend>Required Documents</legend>
                <SupplierDocumentChecklist value={transferForm.requiredDocuments} onChange={(requiredDocuments) => setTransferForm((current) => ({ ...current, requiredDocuments }))} />
              </fieldset>
              <label>
                Notes
                <textarea value={transferForm.notes} onChange={(event) => setTransferForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Cancel</button>
                <button type="submit">{modalMode === 'edit-transfer' ? <Pencil size={16} /> : <Plus size={16} />} {modalMode === 'edit-transfer' ? 'Save Transfer' : 'Create Transfer'}</button>
              </div>
            </form>
          ) : null}

          {modalMode === 'supplier' ? (
            <form onSubmit={createSupplier}>
              <div className="supplier-modal-header">
                <span>Supplier</span>
                <strong>Add New Supplier</strong>
              </div>
              <div className="supplier-form-grid">
                <label>
                  Company Name
                  <input required value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label>
                  Status
                  <select value={supplierForm.approvedStatus} onChange={(event) => setSupplierForm((current) => ({ ...current, approvedStatus: event.target.value as Supplier['approvedStatus'] }))}>
                    <option value="approved">Approved</option>
                    <option value="pending-approval">Pending Approval</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <label>
                  Contact Name
                  <input required value={supplierForm.contactName} onChange={(event) => setSupplierForm((current) => ({ ...current, contactName: event.target.value }))} />
                </label>
                <label>
                  Email
                  <input required type="email" value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} />
                </label>
                <label>
                  Phone
                  <input required value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} />
                </label>
                <label className="supplier-form-wide work-center-address-field">
                  Address
                  <div className="address-lookup-control" ref={addressLookupControlRef}>
                    <input
                      value={supplierForm.address}
                      onChange={(event) => {
                        setSupplierForm((current) => ({ ...current, address: event.target.value }));
                        setAddressLookup({ status: 'idle', message: '' });
                        setShowAddressSuggestions(true);
                      }}
                      onFocus={() => setShowAddressSuggestions(addressSuggestions.length > 0)}
                      placeholder="Street, city, state, country"
                    />
                    <button type="button" onClick={() => { void lookupSupplierAddress(); }} disabled={addressLookup.status === 'loading'}>
                      {addressLookup.status === 'loading' ? 'Searching...' : 'Find address'}
                    </button>
                  </div>
                  {addressLookup.message ? <small className={`address-lookup-message ${addressLookup.status}`}>{addressLookup.message}</small> : null}
                </label>
              </div>
              <div className="supplier-form-wide supplier-capability-field">
                <span>Services / Capabilities</span>
                <div className="supplier-selected-capabilities">
                  {supplierForm.processCapabilities.map((capability) => (
                    <button
                      type="button"
                      key={capability}
                      style={{ '--supplier-pill-color': getSupplierCapabilityColor(capability) } as React.CSSProperties}
                      onClick={() => removeSupplierCapability(capability)}
                    >
                      {capability}
                      <X size={13} />
                    </button>
                  ))}
                  {supplierForm.processCapabilities.length ? null : <em>No capabilities selected</em>}
                </div>
                <div className="supplier-capability-select" ref={capabilityDropdownControlRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCapabilityDropdown((current) => !current);
                      setShowCapabilityColorPicker(false);
                    }}
                  >
                    <span>{supplierForm.capability === registerNewSupplierCapabilityValue ? 'Registering new capability' : 'Select capability'}</span>
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>
              {supplierForm.capability === registerNewSupplierCapabilityValue ? (
                <div className="station-new-capability supplier-form-wide">
                  <label>Capability Name<input value={supplierForm.newCapabilityName} onChange={(event) => setSupplierForm((current) => ({ ...current, newCapabilityName: event.target.value }))} required /></label>
                  <div className="station-new-capability-color" role="group" aria-labelledby="supplier-new-capability-color-label">
                    <span id="supplier-new-capability-color-label">Capability Color</span>
                    <div className="capability-color-picker">
                      {presetSupplierCapabilityColorOptions.map((color) => (
                        <button
                          className={supplierForm.newCapabilityColor === color ? 'selected' : ''}
                          type="button"
                          key={color}
                          aria-label={`Select capability color ${color}`}
                          style={{ backgroundColor: color }}
                          onClick={() => {
                            updateNewSupplierCapabilityColor(color);
                            setShowCapabilityColorPicker(false);
                          }}
                        />
                      ))}
                      <span className="capability-custom-color-wrap" ref={capabilityColorTriggerRef}>
                        <button
                          className={showCapabilityColorPicker || usesCustomSupplierCapabilityColor ? 'selected custom' : 'custom'}
                          type="button"
                          aria-label="Pick custom capability color"
                          style={usesCustomSupplierCapabilityColor ? {
                            backgroundColor: supplierForm.newCapabilityColor,
                            color: newCapabilityHsv.value > 72 ? '#07111c' : '#ffffff',
                          } : undefined}
                          onClick={() => setShowCapabilityColorPicker((current) => !current)}
                        >
                          {usesCustomSupplierCapabilityColor ? <Check size={16} /> : <Plus size={16} />}
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="supplier-form-grid supplier-form-wide">
                <label>
                  Fiscal Data PDF
                  <span className="supplier-file-upload-control">
                    <span><Upload size={15} /> Select PDF</span>
                    <em>{supplierForm.fiscalDocumentFile?.name ?? 'No file selected'}</em>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(event) => setSupplierForm((current) => ({ ...current, fiscalDocumentFile: event.target.files?.[0] ?? null }))}
                    />
                  </span>
                </label>
                <label>
                  Banking Data PDF
                  <span className="supplier-file-upload-control">
                    <span><Upload size={15} /> Select PDF</span>
                    <em>{supplierForm.bankingDocumentFile?.name ?? 'No file selected'}</em>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(event) => setSupplierForm((current) => ({ ...current, bankingDocumentFile: event.target.files?.[0] ?? null }))}
                    />
                  </span>
                </label>
              </div>
              <label>
                Notes
                <textarea value={supplierForm.notes} onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Cancel</button>
                <button type="submit"><Plus size={16} /> Create Supplier</button>
              </div>
            </form>
          ) : null}

          {modalMode === 'checkout' && selectedTransfer ? (
            <form onSubmit={checkoutTransfer}>
              <div className="supplier-modal-header">
                <span>{selectedTransfer.id}</span>
                <strong>Check Out Parts</strong>
              </div>
              <div className="supplier-form-grid">
                <label>
                  Quantity Sent
                  <input required min="1" type="number" value={checkoutForm.quantitySent} onChange={(event) => setCheckoutForm((current) => ({ ...current, quantitySent: event.target.value }))} />
                </label>
                <label>
                  Expected Return
                  <input value={selectedTransfer.expectedReturnDate} readOnly />
                </label>
              </div>
              <label>
                Checkout Notes
                <textarea value={checkoutForm.notes} onChange={(event) => setCheckoutForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <label>
                Attach Physical Document
                <span className="supplier-file-upload-control">
                  <span><Upload size={15} /> Select File</span>
                  <em>{checkoutForm.attachmentFile?.name ?? 'No file selected'}</em>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(event) => setCheckoutForm((current) => ({ ...current, attachmentFile: event.target.files?.[0] ?? null }))}
                  />
                </span>
              </label>
              <label className="supplier-confirmation-check">
                <input type="checkbox" checked={checkoutForm.confirmed} onChange={(event) => setCheckoutForm((current) => ({ ...current, confirmed: event.target.checked }))} />
                <span>Parts physically left the plant and outbound voucher will be created.</span>
              </label>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Cancel</button>
                <button type="submit"><Truck size={16} /> Check Out</button>
              </div>
            </form>
          ) : null}

          {modalMode === 'checkin' && selectedTransfer ? (
            <form onSubmit={checkinTransfer}>
              <div className="supplier-modal-header">
                <span>{selectedTransfer.id}</span>
                <strong>Check In Return</strong>
              </div>
              <div className="supplier-form-grid">
                <label>
                  Quantity Received
                  <input required min="0" type="number" value={checkinForm.quantityReceived} onChange={(event) => setCheckinForm((current) => ({ ...current, quantityReceived: event.target.value }))} />
                </label>
                <label>
                  Quantity Accepted
                  <input required min="0" type="number" value={checkinForm.quantityAccepted} onChange={(event) => setCheckinForm((current) => ({ ...current, quantityAccepted: event.target.value }))} />
                </label>
                <label>
                  Quantity Rejected
                  <input required min="0" type="number" value={checkinForm.quantityRejected} onChange={(event) => setCheckinForm((current) => ({ ...current, quantityRejected: event.target.value }))} />
                </label>
              </div>
              <fieldset>
                <legend>Documents Received</legend>
                <SupplierDocumentChecklist value={checkinForm.receivedDocuments} onChange={(receivedDocuments) => setCheckinForm((current) => ({ ...current, receivedDocuments }))} />
              </fieldset>
              <label>
                Received Notes
                <textarea value={checkinForm.notes} onChange={(event) => setCheckinForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <label>
                Attach Physical Document
                <span className="supplier-file-upload-control">
                  <span><Upload size={15} /> Select File</span>
                  <em>{checkinForm.attachmentFile?.name ?? 'No file selected'}</em>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(event) => setCheckinForm((current) => ({ ...current, attachmentFile: event.target.files?.[0] ?? null }))}
                  />
                </span>
              </label>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Cancel</button>
                <button type="submit"><PackageCheck size={16} /> Check In</button>
              </div>
            </form>
          ) : null}

          {modalMode === 'document' && selectedTransfer ? (
            <form onSubmit={uploadDocument}>
              <div className="supplier-modal-header">
                <span>{selectedTransfer.id}</span>
                <strong>Upload Supplier Document</strong>
              </div>
              <div className="supplier-form-grid">
                <label>
                  Document Type
                  <select value={documentForm.documentType} onChange={(event) => setDocumentForm((current) => ({ ...current, documentType: event.target.value as SupplierDocumentType }))}>
                    {supplierDocumentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  Approval Status
                  <select value={documentForm.approvalStatus} onChange={(event) => setDocumentForm((current) => ({ ...current, approvalStatus: event.target.value as SupplierDocument['approvalStatus'] }))}>
                    <option value="pending-review">Pending Review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
                <label className="supplier-form-wide">
                  Supplier Document
                  <span className={supplierFileUploadClass}>
                    <span><Upload size={15} /> Select File</span>
                    <em>{documentForm.file?.name ?? supplierNoFileText}</em>
                    <input type={supplierFileInputType} accept={supplierDocumentAccept} required={!supplierOperationsDemoMode} onChange={(event) => setDocumentForm((current) => ({ ...current, file: event.target.files?.[0] ?? null, fileName: event.target.files?.[0]?.name ?? String() }))} />
                  </span>
                </label>
              </div>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Cancel</button>
                <button type="submit"><Upload size={16} /> Save Document</button>
              </div>
            </form>
          ) : null}

          {modalMode === 'document-preview' && previewDocument ? (
            <div>
              <div className="supplier-modal-header">
                <span>{formatSupplierLabel(previewDocument.documentType)}</span>
                <strong>{previewDocument.fileName}</strong>
              </div>
              <div className="supplier-document-preview">
                <iframe src={getSupplierDocumentPreviewUrl(previewDocument.fileUrl)} title={`Preview ${previewDocument.fileName}`} />
              </div>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Close</button>
              </div>
            </div>
          ) : null}

          {modalMode === 'supplier-pdf-preview' && previewSupplierPdf ? (
            <div>
              <div className="supplier-modal-header">
                <span>{previewSupplierPdf.label}</span>
                <strong>{previewSupplierPdf.fileName}</strong>
              </div>
              <div className="supplier-document-preview">
                <iframe src={getSupplierDocumentPreviewUrl(previewSupplierPdf.fileUrl)} title={`Preview ${previewSupplierPdf.fileName}`} />
              </div>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Close</button>
              </div>
            </div>
          ) : null}

          {modalMode === 'voucher' && activeVoucher ? (
            <div>
              <div className="supplier-modal-header">
                <span>Generated Voucher</span>
                <strong>{activeVoucher.direction === 'inbound' ? 'Inbound Voucher' : 'Outbound Voucher'}</strong>
              </div>
              <SupplierVoucherView voucher={activeVoucher} />
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Done</button>
                <button type="button" onClick={() => window.print()}><FileText size={16} /> Print</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section className="mes-workspace-panel supplier-operations-workspace">
      {addressSuggestionMenu}
      {capabilityDropdownMenu}
      {capabilityColorPicker}
      <div className="mes-screen-header">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes')}>
          <ArrowLeft size={16} />
          MES Applications
        </button>
        <div className="mes-workspace-heading">
          <p className="eyebrow">{activeHeaderContent.eyebrow}</p>
          <h2>{activeHeaderContent.title}</h2>
          <p>{activeHeaderContent.description}</p>
        </div>
        <div className="supplier-header-actions">
          {activeTab === 'suppliers' ? (
            <button type="button" className="supplier-header-secondary-action" onClick={openCreateSupplier}>
              <Plus size={16} /> Add New Supplier
            </button>
          ) : null}
          <button type="button" onClick={openCreateTransfer}>
            <Plus size={16} /> Add New Transfer
          </button>
        </div>
      </div>

      {backendLoading ? <div className={supplierBackendStatusClass}>Loading Supplier Operations...</div> : null}
      {backendSaving ? <div className={supplierBackendStatusClass}>Saving Supplier Operations...</div> : null}
      {backendError ? <div className={supplierBackendStatusClass} role={supplierAlertRole}>{backendError}<button type={supplierButtonType} onClick={() => void refreshSupplierOperations()}>Retry</button></div> : null}
      <div className="supplier-app-shell">
        <div className="supplier-app-content">
          {activeTab === 'dashboard' ? (
            supplierKpiGrid
          ) : null}

          {activeTab === 'transfers' ? (
            <>
              {activeTransfersBar}
              <div className="supplier-transfer-combined-panel">
                <div className="supplier-transfer-combined-main">
                  {selectedTransferSummary}
                </div>
                {selectedTransferDetail}
              </div>
            </>
          ) : null}

          {activeTab === 'suppliers' ? supplierManagementSection : null}

          {activeTab === 'vouchers-docs' ? vouchersAndDocsSection : null}

          {activeTab === 'check-in-out' ? (
            checkInOutSection
          ) : null}
        </div>

      </div>

      {renderModal()}
    </section>
  );
}
