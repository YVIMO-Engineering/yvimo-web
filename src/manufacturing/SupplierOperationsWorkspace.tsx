import React from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  ClipboardCheck,
  Eye,
  FileText,
  PackageCheck,
  Plus,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { resolveGooglePlacesAddressMatch, searchGooglePlacesAddressMatches, type GooglePlacesAddressMatch } from '../lib/maps/googlePlacesAddressLookup';
import { mockProductionOrders, mockSupplierTransfers, mockSuppliers } from './mesMockData';
import type {
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

type SupplierModalMode = 'create' | 'supplier' | 'checkout' | 'checkin' | 'document' | 'document-preview' | 'voucher' | null;
export type SupplierContextTab = 'dashboard' | 'transfers' | 'suppliers' | 'vouchers-docs' | 'check-in-out';

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
};

type CheckinFormState = {
  quantityReceived: string;
  quantityAccepted: string;
  quantityRejected: string;
  receivedDocuments: SupplierDocumentType[];
  notes: string;
};

type DocumentFormState = {
  documentType: SupplierDocumentType;
  fileName: string;
  approvalStatus: SupplierDocument['approvalStatus'];
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
  notes: string;
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
  notes: '',
};

const formatSupplierLabel = (value: string) => value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const getSupplierInitials = (name: string) => name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();

const getDefaultSupplierCapabilityColor = (capability: string) => {
  if (supplierCapabilityColors[capability]) return supplierCapabilityColors[capability];
  const colorIndex = Array.from(capability).reduce((total, character) => total + character.charCodeAt(0), 0) % supplierCapabilityFallbackColors.length;
  return supplierCapabilityFallbackColors[colorIndex];
};

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
  if (quantityReceived !== current.quantitySent || quantityRejected > 0 || quantityAccepted + quantityRejected !== quantityReceived) {
    return 'discrepancy';
  }

  const hasMissingDocuments = current.requiredDocuments.some((documentType) => !receivedDocuments.includes(documentType));
  return hasMissingDocuments ? 'documents-pending' : 'closed';
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

  return (
    <div className="supplier-voucher-sheet">
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
      <p>{voucher.notes || 'No notes entered.'}</p>
    </div>
  );
}

export function SupplierOperationsWorkspace({ onNavigate, activeTab, onActiveTabChange }: SupplierOperationsWorkspaceProps) {
  const [suppliers, setSuppliers] = React.useState<Supplier[]>(mockSuppliers);
  const [transfers, setTransfers] = React.useState<SupplierTransfer[]>(mockSupplierTransfers);
  const [selectedTransferId, setSelectedTransferId] = React.useState(mockSupplierTransfers[0]?.id ?? '');
  const [modalMode, setModalMode] = React.useState<SupplierModalMode>(null);
  const [activeVoucher, setActiveVoucher] = React.useState<SupplierVoucher | null>(null);
  const [transferForm, setTransferForm] = React.useState<SupplierTransferFormState>(defaultTransferForm);
  const [supplierForm, setSupplierForm] = React.useState<SupplierFormState>(defaultSupplierForm);
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
  const [checkoutForm, setCheckoutForm] = React.useState<CheckoutFormState>({ quantitySent: '', notes: '', confirmed: false });
  const [checkinForm, setCheckinForm] = React.useState<CheckinFormState>({ quantityReceived: '', quantityAccepted: '', quantityRejected: '0', receivedDocuments: [], notes: '' });
  const [documentForm, setDocumentForm] = React.useState<DocumentFormState>({ documentType: 'certificate', fileName: '', approvalStatus: 'pending-review' });
  const [previewDocument, setPreviewDocument] = React.useState<SupplierDocument | null>(null);
  const addressLookupControlRef = React.useRef<HTMLDivElement | null>(null);
  const addressSuggestionMenuRef = React.useRef<HTMLDivElement | null>(null);
  const capabilityDropdownControlRef = React.useRef<HTMLDivElement | null>(null);
  const capabilityDropdownMenuRef = React.useRef<HTMLDivElement | null>(null);
  const capabilityColorTriggerRef = React.useRef<HTMLSpanElement | null>(null);
  const capabilityColorPickerRef = React.useRef<HTMLDivElement | null>(null);

  const selectedTransfer = transfers.find((transfer) => transfer.id === selectedTransferId) ?? transfers[0] ?? null;
  const todayIsoDate = getTodayIsoDate();
  const sentTransfers = transfers.filter((transfer) => transfer.status === 'sent-to-supplier').length;
  const pendingReturn = transfers.filter((transfer) => ['sent-to-supplier', 'ready-for-checkout'].includes(transfer.status)).length;
  const missingDocuments = transfers.filter((transfer) => getMissingDocuments(transfer).length > 0 && ['received-back', 'documents-pending', 'discrepancy'].includes(transfer.status)).length;
  const overdueTransfers = transfers.filter((transfer) => transfer.expectedReturnDate < todayIsoDate && !['closed'].includes(transfer.status)).length;
  const activeSupplierTransfers = transfers.filter((transfer) => transfer.status !== 'closed');
  const sentToSupplierTransfers = transfers.filter((transfer) => transfer.status === 'sent-to-supplier');
  const pendingReturnTransfers = transfers.filter((transfer) => ['sent-to-supplier', 'ready-for-checkout'].includes(transfer.status));
  const missingDocumentTransfers = transfers.filter((transfer) => getMissingDocuments(transfer).length > 0 && ['received-back', 'documents-pending', 'discrepancy'].includes(transfer.status));
  const allSupplierCapabilityTags = React.useMemo(() => Array.from(new Set([
    ...Object.keys(supplierCapabilityColors),
    ...suppliers.flatMap((supplier) => supplier.processCapabilities),
    ...Object.keys(customSupplierCapabilityColors),
  ])), [customSupplierCapabilityColors, suppliers]);
  const supplierCapabilityPickerOptions = React.useMemo(() => allSupplierCapabilityTags.filter((capability) => !supplierForm.processCapabilities.includes(capability)), [allSupplierCapabilityTags, supplierForm.processCapabilities]);
  const newCapabilityHsv = React.useMemo(() => supplierHexToHsv(supplierForm.newCapabilityColor), [supplierForm.newCapabilityColor]);
  const presetSupplierCapabilityColorOptions = supplierCapabilityColorOptions.slice(0, 6);
  const usesCustomSupplierCapabilityColor = !presetSupplierCapabilityColorOptions.includes(supplierForm.newCapabilityColor);

  const updateTransfer = (transferId: string, updater: (transfer: SupplierTransfer) => SupplierTransfer) => {
    setTransfers((currentTransfers) => currentTransfers.map((transfer) => transfer.id === transferId ? updater(transfer) : transfer));
  };

  const openCreateTransfer = () => {
    setTransferForm(defaultTransferForm);
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
    setCheckoutForm({ quantitySent: String(transfer.quantitySent || ''), notes: transfer.checkoutNotes, confirmed: false });
    setModalMode('checkout');
  };

  const openCheckin = (transfer: SupplierTransfer) => {
    setSelectedTransferId(transfer.id);
    setCheckinForm({
      quantityReceived: String(transfer.quantityReceived || transfer.quantitySent || ''),
      quantityAccepted: String(transfer.quantityAccepted || transfer.quantitySent || ''),
      quantityRejected: String(transfer.quantityRejected || 0),
      receivedDocuments: transfer.receivedDocuments,
      notes: transfer.receivedNotes,
    });
    setModalMode('checkin');
  };

  const openDocumentUpload = (transfer: SupplierTransfer) => {
    setSelectedTransferId(transfer.id);
    setDocumentForm({
      documentType: getMissingDocuments(transfer)[0] ?? transfer.requiredDocuments[0] ?? 'certificate',
      fileName: '',
      approvalStatus: 'pending-review',
    });
    setModalMode('document');
  };

  const closeTransfer = (transfer: SupplierTransfer) => {
    updateTransfer(transfer.id, (currentTransfer) => ({
      ...currentTransfer,
      status: getMissingDocuments(currentTransfer).length > 0 ? 'documents-pending' : 'closed',
      updatedAt: new Date().toISOString(),
    }));
  };

  const createTransfer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supplier = suppliers.find((item) => item.id === transferForm.supplierId) ?? suppliers[0];
    const order = mockProductionOrders.find((item) => item.orderNumber === transferForm.productionOrder);
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

  const createSupplier = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = supplierForm.name.trim();
    const newCapability = supplierForm.capability === registerNewSupplierCapabilityValue ? supplierForm.newCapabilityName.trim() : '';
    const capabilities = Array.from(new Set([
      ...supplierForm.processCapabilities,
      ...(newCapability ? [newCapability] : []),
    ].map((capability) => capability.trim()).filter(Boolean)));
    if (supplierForm.capability === registerNewSupplierCapabilityValue && !newCapability) return;
    const supplier: Supplier = {
      id: `sup-${normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'supplier'}-${String(suppliers.length + 1).padStart(2, '0')}`,
      name: normalizedName,
      contactName: supplierForm.contactName.trim(),
      email: supplierForm.email.trim(),
      phone: supplierForm.phone.trim(),
      address: supplierForm.address.trim(),
      approvedStatus: supplierForm.approvedStatus,
      processCapabilities: capabilities.length ? capabilities : ['General supplier'],
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

  const checkoutTransfer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTransfer || !checkoutForm.confirmed) return;

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
      notes: checkoutForm.notes.trim(),
    };

    updateTransfer(selectedTransfer.id, (transfer) => ({
      ...transfer,
      quantitySent,
      status: 'sent-to-supplier',
      checkoutNotes: checkoutForm.notes.trim(),
      vouchers: [...transfer.vouchers, voucher],
      updatedAt: new Date().toISOString(),
    }));
    setActiveVoucher(voucher);
    setModalMode('voucher');
  };

  const checkinTransfer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTransfer) return;

    const quantityReceived = Number(checkinForm.quantityReceived) || 0;
    const quantityAccepted = Number(checkinForm.quantityAccepted) || 0;
    const quantityRejected = Number(checkinForm.quantityRejected) || 0;
    const nextStatus = getTransferStatusAfterCheckin(selectedTransfer, quantityReceived, quantityAccepted, quantityRejected, checkinForm.receivedDocuments);
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
      notes: checkinForm.notes.trim(),
    };

    updateTransfer(selectedTransfer.id, (transfer) => ({
      ...transfer,
      quantityReceived,
      quantityAccepted,
      quantityRejected,
      status: nextStatus,
      receivedDocuments: checkinForm.receivedDocuments,
      receivedNotes: checkinForm.notes.trim(),
      vouchers: [...transfer.vouchers, voucher],
      updatedAt: new Date().toISOString(),
    }));
    setActiveVoucher(voucher);
    setModalMode('voucher');
  };

  const uploadDocument = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTransfer) return;

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
        status: transfer.status === 'documents-pending' && !hasMissingDocuments ? 'closed' : transfer.status,
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
          onClick={() => {
            setSelectedTransferId(transfer.id);
            onActiveTabChange('transfers');
          }}
        >
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
          <span><Check size={16} /> Overdue Transfers</span>
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
                    <button type="button" onClick={() => openCheckout(transfer)} disabled={transfer.status === 'sent-to-supplier' || transfer.status === 'closed'} aria-label={`Check out ${transfer.id}`}><Truck size={15} /></button>
                    <button type="button" onClick={() => openCheckin(transfer)} disabled={transfer.status === 'draft' || transfer.status === 'ready-for-checkout' || transfer.status === 'closed'} aria-label={`Check in ${transfer.id}`}><PackageCheck size={15} /></button>
                    <button type="button" onClick={() => openDocumentUpload(transfer)} aria-label={`Upload document for ${transfer.id}`}><Upload size={15} /></button>
                    <button type="button" onClick={() => closeTransfer(transfer)} disabled={transfer.status === 'closed'} aria-label={`Close ${transfer.id}`}><Check size={15} /></button>
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
        <span><b>Expected Return</b>{formatSupplierDate(selectedTransfer.expectedReturnDate)}</span>
        <span className={`supplier-selected-transfer-status supplier-selected-transfer-status-${selectedTransfer.status}`}>
          <b>Status</b>
          <strong>{formatSupplierLabel(selectedTransfer.status)}</strong>
        </span>
      </div>
      <div className="supplier-selected-transfer-actions">
        <button type="button" onClick={() => openCheckout(selectedTransfer)} disabled={selectedTransfer.status === 'sent-to-supplier' || selectedTransfer.status === 'closed'}><Truck size={16} /> Check Out</button>
        <button type="button" onClick={() => openCheckin(selectedTransfer)} disabled={selectedTransfer.status === 'draft' || selectedTransfer.status === 'ready-for-checkout' || selectedTransfer.status === 'closed'}><PackageCheck size={16} /> Check In</button>
        <button type="button" onClick={() => openDocumentUpload(selectedTransfer)}><Upload size={16} /> Upload Document</button>
        <button type="button" onClick={() => closeTransfer(selectedTransfer)} disabled={selectedTransfer.status === 'closed'}><Check size={16} /> Close Transfer</button>
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
                <span>{supplier.contactName}</span>
                <span>{supplier.email}</span>
                <span>{supplier.phone}</span>
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
                <p>{supplier.notes}</p>
              </div>
              <div className="supplier-logo-frame" aria-label={`${supplier.name} logo`}>
                <span>{getSupplierInitials(supplier.name)}</span>
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
        <strong>{transfers.reduce((total, transfer) => total + transfer.vouchers.length + transfer.documents.length, 0)} records</strong>
      </div>
      <div className="supplier-docs-grid">
        {transfers.map((transfer) => (
          <article key={transfer.id}>
            <div>
              <strong>{transfer.id}</strong>
              <SupplierStatusBadge status={transfer.status} />
            </div>
            <span>{transfer.supplierName} / {transfer.externalProcess}</span>
            <div className="supplier-document-tags">
              {transfer.requiredDocuments.map((documentType) => (
                <span className={transfer.receivedDocuments.includes(documentType) ? 'received' : ''} key={documentType}>{formatSupplierLabel(documentType)}</span>
              ))}
            </div>
            <div className="supplier-docs-actions">
              <button type="button" onClick={() => openDocumentUpload(transfer)}><Upload size={15} /> Upload Document</button>
              {transfer.vouchers.map((voucher) => (
                <button
                  type="button"
                  key={voucher.id}
                  onClick={() => {
                    setSelectedTransferId(transfer.id);
                    setActiveVoucher(voucher);
                    setModalMode('voucher');
                  }}
                >
                  <FileText size={15} /> {voucher.id}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  const checkInOutSection = (
    <section className="supplier-section supplier-checkinout-section">
      <div className="supplier-section-heading">
        <span><Truck size={16} /> Check in/out</span>
        <strong>{selectedTransfer?.id ?? 'No transfer selected'}</strong>
      </div>
      {selectedTransfer ? (
        <>
          <div className="supplier-checkinout-summary">
            <strong>{selectedTransfer.supplierName}</strong>
            <span>{selectedTransfer.productionOrder} / {selectedTransfer.partNumber} / {selectedTransfer.lotSerial}</span>
            <SupplierStatusBadge status={selectedTransfer.status} />
          </div>
          <div className="supplier-checkinout-actions">
            <button type="button" onClick={() => openCheckout(selectedTransfer)} disabled={selectedTransfer.status === 'sent-to-supplier' || selectedTransfer.status === 'closed'}><Truck size={16} /> Check Out</button>
            <button type="button" onClick={() => openCheckin(selectedTransfer)} disabled={selectedTransfer.status === 'draft' || selectedTransfer.status === 'ready-for-checkout' || selectedTransfer.status === 'closed'}><PackageCheck size={16} /> Check In</button>
            <button type="button" onClick={() => openDocumentUpload(selectedTransfer)}><Upload size={16} /> Upload Document</button>
            <button type="button" onClick={() => closeTransfer(selectedTransfer)} disabled={selectedTransfer.status === 'closed'}><Check size={16} /> Close Transfer</button>
          </div>
        </>
      ) : <span className="supplier-empty-note">Select a supplier transfer first.</span>}
    </section>
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
        <div className="supplier-modal" role="dialog" aria-modal="true">
          <button className="supplier-modal-close" type="button" onClick={() => setModalMode(null)} aria-label="Close dialog">
            <X size={18} />
          </button>

          {modalMode === 'create' ? (
            <form onSubmit={createTransfer}>
              <div className="supplier-modal-header">
                <span>Supplier Transfer</span>
                <strong>New Supplier Transfer</strong>
              </div>
              <div className="supplier-form-grid">
                <label>
                  Production Order
                  <select value={transferForm.productionOrder} onChange={(event) => {
                    const order = mockProductionOrders.find((item) => item.orderNumber === event.target.value);
                    setTransferForm((current) => ({ ...current, productionOrder: event.target.value, partNumber: order?.partNumber ?? current.partNumber }));
                  }}>
                    {mockProductionOrders.map((order) => <option key={order.id} value={order.orderNumber}>{order.orderNumber} / {order.partNumber}</option>)}
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
                <button type="submit"><Plus size={16} /> Create Transfer</button>
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
              <label className="supplier-confirmation-check">
                <input type="checkbox" checked={checkoutForm.confirmed} onChange={(event) => setCheckoutForm((current) => ({ ...current, confirmed: event.target.checked }))} />
                <span>Confirm parts physically left the plant and create outbound voucher.</span>
              </label>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Cancel</button>
                <button type="submit" disabled={!checkoutForm.confirmed}><Truck size={16} /> Check Out</button>
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
                  File Name
                  <input value={documentForm.fileName} placeholder={`${selectedTransfer.id}-certificate.pdf`} onChange={(event) => setDocumentForm((current) => ({ ...current, fileName: event.target.value }))} />
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
          <p className="eyebrow">MES / Suppliers</p>
          <h2>Supplier Operations</h2>
          <p>Track external processing, supplier check-outs, returns, vouchers, and supplier documents.</p>
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
            <div className="supplier-workspace-layout supplier-dashboard-layout">
              <div className="supplier-main-panel">
                {checkInOutSection}
                {supplierTransfersTable}
              </div>
              {selectedTransferDetail}
            </div>
          ) : null}
        </div>

      </div>

      {renderModal()}
    </section>
  );
}
