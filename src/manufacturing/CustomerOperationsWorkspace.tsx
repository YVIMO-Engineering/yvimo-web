import React from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Building2,
  Camera,
  Check,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  ExternalLink,
  FileText,
  History,
  Mail,
  MapPin,
  Move,
  Package,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  WalletCards,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  resolveGooglePlacesAddressMatch,
  searchGooglePlacesAddressMatches,
  type GooglePlacesAddressMatch,
} from '../lib/maps/googlePlacesAddressLookup';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../lib/exchangeRates';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import { ClientBalancesWorkspace } from './ClientBalancesWorkspace';
import { ClientReceptionsWorkspace } from './ClientReceptionsWorkspace';
import { ProductionOrderDetailsModal, type ProductionOrderDetailsState, type ProductionOrderDetailPiece, type ProductionOrderDetailTraceabilityRow } from './MesWorkspaces';
import { localizeClientsTree, translateClientsText, type ClientsLanguageCode } from './clientsI18n';
import type { ProductionOrder } from './mesTypes';

export type ClientsContextTab =
  | 'customers'
  | 'assets-equipment'
  | 'receptions'
  | 'deliveries-returns'
  | 'balances'
  | 'docs-vouchers';

type CustomerStatus = 'active' | 'inactive';
type AssetStatus = 'available' | 'in-custody' | 'in-service' | 'awaiting-return' | 'delivered' | 'maintenance' | 'inspection' | 'retired';
type PaymentTermsMode = 'Net 30' | 'Net 60' | '50/50' | 'Immediate' | 'Custom';
const SHAVER_MAX_SHARPENINGS = 16;

type CustomerDropdownOption<T extends string> = {
  value: T;
  label: string;
};

type FloatingMenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

type AssetRegistryViewState = {
  customerFilter: string;
  assetSearch: string;
  toolIdSearch: string;
  selectedAssetTypes: string[] | null;
  selectedAssetId: string | null;
};

const getAssetRegistryViewStateKey = (organizationId: string) => `yvimo:clients:assets:view:${organizationId}`;

function readAssetRegistryViewState(organizationId: string): AssetRegistryViewState {
  const fallback: AssetRegistryViewState = { customerFilter: 'all', assetSearch: '', toolIdSearch: '', selectedAssetTypes: null, selectedAssetId: null };
  try {
    const stored = window.sessionStorage.getItem(getAssetRegistryViewStateKey(organizationId));
    return stored ? { ...fallback, ...JSON.parse(stored) as Partial<AssetRegistryViewState> } : fallback;
  } catch {
    return fallback;
  }
}

type CustomerRecord = {
  id: string;
  organizationId: string;
  customerName: string;
  legalName: string;
  taxId: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  paymentTerms: string;
  leadTimeDays: number;
  baseCurrency: SupportedCurrency;
  notes: string;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
};

type CustomerRow = {
  id: string;
  organization_id: string;
  customer_name: string;
  legal_name: string;
  tax_id: string | null;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  payment_terms: string;
  lead_time_days: number;
  base_currency: SupportedCurrency;
  notes: string;
  status: CustomerStatus;
  created_at: string;
  updated_at: string;
};

type CustomerFormState = {
  customerName: string;
  legalName: string;
  taxId: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  paymentTerms: string;
  leadTimeDays: string;
  baseCurrency: SupportedCurrency;
  notes: string;
  status: CustomerStatus;
};

type CustomerAssetRecord = {
  id: string;
  customerId: string;
  sourceType: 'manual' | 'production-order';
  sourceProductionOrderId: string | null;
  lastProductionOrderId: string | null;
  assetType: string;
  toolId: string;
  internalToolId: string;
  toolDefinitionId: string | null;
  serialNumber: string;
  partNumber: string;
  description: string;
  manufacturer: string;
  familyCategory: string;
  currentLocation: string;
  custodianName: string;
  custodianRole: string;
  status: AssetStatus;
  estimatedLifePercent: number | null;
  maximumSharpenings: number | null;
  lastInspectionAt: string | null;
  lastServiceAt: string | null;
  serviceCount: number;
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
};

type CustomerAssetService = {
  id: string;
  assetId: string;
  productionOrderId: string | null;
  sourceType: 'manual' | 'production-order';
  serviceType: string;
  result: 'completed' | 'ok' | 'approach' | 'nok' | 'scrap' | 'skipped';
  serviceDate: string;
  remainingLifePercent: number | null;
  notes: string;
  orderNumber: string;
  performancePieces: number | null;
};

type CustomerAssetAttachment = {
  id: string;
  assetId: string;
  serviceEventId: string | null;
  attachmentType: 'photo' | 'document';
  storageBucket: string;
  fileName: string;
  filePath: string;
  fileType: string;
  createdAt: string;
};

type CustomerAssetFormState = {
  customerId: string;
  toolDefinitionId: string;
  assetType: string;
  serialNumber: string;
  partNumber: string;
  description: string;
  manufacturer: string;
  familyCategory: string;
  currentLocation: string;
  custodianName: string;
  custodianRole: string;
  status: AssetStatus;
  lastInspectionAt: string;
  internalNotes: string;
};

type CustomerOperationsWorkspaceProps = {
  onNavigate: (path: string) => void;
  activeTab: ClientsContextTab;
  organizationId: string;
  languageCode: ClientsLanguageCode;
  hostSection?: 'clients' | 'financial-status';
};

const emptyCustomerForm: CustomerFormState = {
  customerName: '',
  legalName: '',
  taxId: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  paymentTerms: 'Net 30',
  leadTimeDays: '15',
  baseCurrency: 'MXN',
  notes: '',
  status: 'active',
};

const emptyCustomerAssetForm: CustomerAssetFormState = {
  customerId: '',
  toolDefinitionId: '',
  assetType: '',
  serialNumber: '',
  partNumber: '',
  description: '',
  manufacturer: '',
  familyCategory: '',
  currentLocation: 'YVIMO',
  custodianName: '',
  custodianRole: '',
  status: 'in-custody',
  lastInspectionAt: '',
  internalNotes: '',
};

const customerStatusOptions: Array<CustomerDropdownOption<CustomerStatus>> = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const currencyOptions: Array<CustomerDropdownOption<SupportedCurrency>> = SUPPORTED_CURRENCIES.map((currency) => ({
  value: currency,
  label: currency,
}));

const assetStatusOptions: Array<CustomerDropdownOption<AssetStatus>> = [
  { value: 'available', label: 'Available' },
  { value: 'in-custody', label: 'In custody' },
  { value: 'in-service', label: 'In service' },
  { value: 'awaiting-return', label: 'Awaiting return' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'retired', label: 'Retired' },
];

const paymentTermsOptions: Array<CustomerDropdownOption<PaymentTermsMode>> = [
  { value: 'Net 30', label: 'Net 30' },
  { value: 'Net 60', label: 'Net 60' },
  { value: '50/50', label: '50/50' },
  { value: 'Immediate', label: 'Immediate' },
  { value: 'Custom', label: 'Custom' },
];

const standardPaymentTerms = new Set<PaymentTermsMode>(
  paymentTermsOptions.filter((option) => option.value !== 'Custom').map((option) => option.value),
);

const customerSelectColumns = [
  'id',
  'organization_id',
  'customer_name',
  'legal_name',
  'tax_id',
  'contact_name',
  'email',
  'phone',
  'address',
  'payment_terms',
  'lead_time_days',
  'base_currency',
  'notes',
  'status',
  'created_at',
  'updated_at',
].join(', ');

const clientsPageContent: Record<ClientsContextTab, { eyebrow: string; title: string; description: string }> = {
  customers: {
    eyebrow: 'MES / CUSTOMER DIRECTORY',
    title: 'Customer Management',
    description: 'Manage customer identities, billing details, contacts, payment terms, and operational records.',
  },
  'assets-equipment': {
    eyebrow: 'MES / CLIENTS',
    title: 'Assets & Equipment',
    description: 'Keep customer-owned assets and equipment organized with a clear operational record for every item.',
  },
  receptions: {
    eyebrow: 'MES / CLIENT RECEPTIONS',
    title: 'Reception Vouchers',
    description: 'Register and follow new customer parts from expected arrival through receiving and inspection.',
  },
  'deliveries-returns': {
    eyebrow: 'MES / CLIENTS',
    title: 'Deliveries & Returns',
    description: 'Follow equipment and material movements between your organization and each customer.',
  },
  balances: {
    eyebrow: 'MES / CLIENT ACCOUNTS',
    title: 'Client Balances',
    description: 'Track operational charges, payments, adjustments, and invoice references for every customer.',
  },
  'docs-vouchers': {
    eyebrow: 'MES / CLIENTS',
    title: 'Docs & Vouchers',
    description: 'Organize the documents and vouchers that support every customer transaction and movement.',
  },
};

function CustomerDropdown<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: T;
  options: Array<CustomerDropdownOption<T>>;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<FloatingMenuPosition | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  const updatePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const desiredHeight = Math.min(224, (options.length * 40) + 12);
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const openUp = availableBelow < desiredHeight && availableAbove > availableBelow;
    const maxHeight = Math.max(52, Math.min(desiredHeight, openUp ? availableAbove - 7 : availableBelow - 7));
    const width = Math.min(rect.width, window.innerWidth - (viewportPadding * 2));
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));
    setPosition({
      top: openUp ? Math.max(viewportPadding, rect.top - maxHeight - 7) : rect.bottom + 7,
      left,
      width,
      maxHeight,
    });
  }, [options.length]);

  React.useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return undefined;
    const closeIfOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const reposition = () => updatePosition();
    document.addEventListener('mousedown', closeIfOutside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', closeIfOutside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, updatePosition]);

  const menu = open && position ? createPortal(
    <div
      className="mes-order-dropdown-menu customer-dropdown-menu"
      id={`${id}-listbox`}
      role="listbox"
      ref={menuRef}
      style={position}
    >
      {options.map((option) => (
        <button
          className={option.value === value ? 'selected' : ''}
          type="button"
          role="option"
          aria-selected={option.value === value}
          key={option.value}
          onClick={() => {
            onChange(option.value);
            setOpen(false);
          }}
        >
          <span>{option.label}</span>
          {option.value === value ? <Check size={14} /> : null}
        </button>
      ))}
    </div>,
    document.body,
  ) : null;

  return (
    <div className={open ? 'mes-order-dropdown customer-dropdown open' : 'mes-order-dropdown customer-dropdown'} ref={triggerRef}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-listbox`} onClick={() => setOpen((current) => !current)}>
        <span>{selectedOption?.label}</span>
        <ChevronDown size={16} />
      </button>
      {menu}
    </div>
  );
}

function mapCustomerRow(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    customerName: row.customer_name,
    legalName: row.legal_name,
    taxId: row.tax_id ?? '',
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    paymentTerms: row.payment_terms,
    leadTimeDays: Number(row.lead_time_days) || 15,
    baseCurrency: row.base_currency,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function customerToForm(customer: CustomerRecord): CustomerFormState {
  return {
    customerName: customer.customerName,
    legalName: customer.legalName,
    taxId: customer.taxId,
    contactName: customer.contactName,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    paymentTerms: customer.paymentTerms,
    leadTimeDays: String(customer.leadTimeDays),
    baseCurrency: customer.baseCurrency,
    notes: customer.notes,
    status: customer.status,
  };
}

type CustomerAssetRow = {
  id: string;
  customer_id: string;
  source_type: 'manual' | 'production-order';
  source_production_order_id: string | null;
  last_production_order_id: string | null;
  asset_type: string;
  tool_definition_id?: string | null;
  serial_number: string;
  part_number: string | null;
  description: string;
  manufacturer: string | null;
  family_category: string | null;
  current_location: string | null;
  custodian_name: string | null;
  custodian_role: string | null;
  status: AssetStatus;
  estimated_life_percent: number | null;
  max_sharpenings?: number | null;
  last_inspection_at: string | null;
  last_service_at: string | null;
  service_count: number;
  internal_notes: string;
  created_at: string;
  updated_at: string;
};

type CustomerAssetServiceRow = {
  id: string;
  asset_id: string;
  production_order_id: string | null;
  source_type: 'manual' | 'production-order';
  service_type: string;
  result: CustomerAssetService['result'];
  service_date: string;
  remaining_life_percent: number | null;
  notes: string;
  production_order: { order_number: string } | Array<{ order_number: string }> | null;
};

type CustomerAssetAttachmentRow = {
  id: string;
  asset_id: string;
  service_event_id?: string | null;
  attachment_type: 'photo' | 'document';
  storage_bucket: string;
  file_name: string;
  file_path: string;
  file_type: string;
  created_at: string;
};

type ProductionSerialToolRow = {
  production_order_id: string;
  serial_number: string;
  tool_id: string | null;
};

type CustomerToolDefinition = {
  id: string;
  toolId: string;
  internalToolId: string;
  partType: string;
  minimumLife: number | null;
  measurementUnit: 'in' | 'mm';
};

type CustomerToolDefinitionRow = {
  id: string;
  tool_id: string;
  internal_tool_id: string;
  part_type: string;
  minimum_life: number | null;
  measurement_unit: 'in' | 'mm';
};

type CustomerToolDocument = {
  id: string;
  toolDefinitionId: string;
  storageBucket: string;
  fileName: string;
  filePath: string;
  fileType: string;
  createdAt: string;
};

type CustomerToolDocumentRow = {
  id: string;
  tool_definition_id: string;
  storage_bucket: string;
  file_name: string;
  file_path: string;
  file_type: string;
  created_at: string;
};

type AssetLifeTraceabilityRow = {
  production_order_id: string;
  tool_id: string | null;
  serial_number: string | null;
  dimensions_unit: string;
  before_notch: number | null;
  before_tooth_length: number | null;
  stock_to_remove: number | null;
  after_tooth_length: number | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

function normalizeAssetType(value: string) {
  return value.trim().toLocaleLowerCase();
}

function getAssetTypeColors(assetType: string): React.CSSProperties {
  const normalizedType = normalizeAssetType(assetType);
  const knownColors = [
    { pattern: /shaver/, color: '#6d28d9', background: '#f5f3ff', border: '#c4b5fd' },
    { pattern: /hob/, color: '#2563eb', background: '#eff6ff', border: '#93c5fd' },
    { pattern: /skiving|powerskiver/, color: '#047857', background: '#ecfdf5', border: '#6ee7b7' },
    { pattern: /tallador/, color: '#b45309', background: '#fffbeb', border: '#fcd34d' },
    { pattern: /shaper/, color: '#0f766e', background: '#f0fdfa', border: '#5eead4' },
  ];
  const knownColor = knownColors.find(({ pattern }) => pattern.test(normalizedType));
  const hash = Array.from(normalizedType).reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 0);
  const hue = hash % 360;
  const colors = knownColor ?? {
    color: `hsl(${hue} 72% 34%)`,
    background: `hsl(${hue} 85% 96%)`,
    border: `hsl(${hue} 65% 75%)`,
  };
  return {
    '--clients-asset-type-color': colors.color,
    '--clients-asset-type-bg': colors.background,
    '--clients-asset-type-border': colors.border,
  } as React.CSSProperties;
}

function formatAssetDate(value: string | null, languageCode: ClientsLanguageCode) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat(languageCode === 'es' ? 'es-MX' : 'en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value));
}

function mapAssetRow(row: CustomerAssetRow): CustomerAssetRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    sourceType: row.source_type,
    sourceProductionOrderId: row.source_production_order_id,
    lastProductionOrderId: row.last_production_order_id,
    assetType: row.asset_type,
    toolId: '',
    internalToolId: '',
    toolDefinitionId: row.tool_definition_id ?? null,
    serialNumber: row.serial_number,
    partNumber: row.part_number ?? '',
    description: row.description,
    manufacturer: row.manufacturer ?? '',
    familyCategory: row.family_category ?? '',
    currentLocation: row.current_location ?? '',
    custodianName: row.custodian_name ?? '',
    custodianRole: row.custodian_role ?? '',
    status: row.status,
    estimatedLifePercent: row.estimated_life_percent,
    maximumSharpenings: row.max_sharpenings ?? null,
    lastInspectionAt: row.last_inspection_at,
    lastServiceAt: row.last_service_at,
    serviceCount: row.service_count,
    internalNotes: row.internal_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function CustomerOperationsWorkspace({ onNavigate, activeTab, organizationId, languageCode, hostSection = 'clients' }: CustomerOperationsWorkspaceProps) {
  const page = hostSection === 'financial-status' && activeTab === 'balances'
    ? { ...clientsPageContent.balances, eyebrow: 'OPS INTELLIGENCE / FINANCE' }
    : clientsPageContent[activeTab];
  const restoredAssetView = React.useMemo(() => readAssetRegistryViewState(organizationId), [organizationId]);
  const [customers, setCustomers] = React.useState<CustomerRecord[]>([]);
  const [assetCustomerFilter, setAssetCustomerFilter] = React.useState(restoredAssetView.customerFilter);
  const [assetSearch, setAssetSearch] = React.useState(restoredAssetView.assetSearch);
  const [assetToolIdSearch, setAssetToolIdSearch] = React.useState(restoredAssetView.toolIdSearch);
  const [selectedAssetTypes, setSelectedAssetTypes] = React.useState<Set<string> | null>(() => restoredAssetView.selectedAssetTypes ? new Set(restoredAssetView.selectedAssetTypes) : null);
  const [assets, setAssets] = React.useState<CustomerAssetRecord[]>([]);
  const [toolDefinitions, setToolDefinitions] = React.useState<CustomerToolDefinition[]>([]);
  const [assetLifeTraceability, setAssetLifeTraceability] = React.useState<AssetLifeTraceabilityRow[]>([]);
  const [assetServices, setAssetServices] = React.useState<CustomerAssetService[]>([]);
  const [performanceService, setPerformanceService] = React.useState<CustomerAssetService | null>(null);
  const [performancePiecesDraft, setPerformancePiecesDraft] = React.useState('');
  const [performanceSaving, setPerformanceSaving] = React.useState(false);
  const [performanceError, setPerformanceError] = React.useState('');
  const [assetOrderDetails, setAssetOrderDetails] = React.useState<{ order: ProductionOrder; details: ProductionOrderDetailsState } | null>(null);
  const [assetAttachments, setAssetAttachments] = React.useState<CustomerAssetAttachment[]>([]);
  const [selectedAssetId, setSelectedAssetId] = React.useState<string | null>(restoredAssetView.selectedAssetId);
  const [assetLoading, setAssetLoading] = React.useState(false);
  const [assetError, setAssetError] = React.useState('');
  const [assetAttachmentPreview, setAssetAttachmentPreview] = React.useState<{ fileName: string; url: string; isPdf: boolean; category?: string } | null>(null);
  const [assetPreviewZoom, setAssetPreviewZoom] = React.useState(1);
  const [assetPreviewPosition, setAssetPreviewPosition] = React.useState({ x: 0, y: 0 });
  const assetPreviewDragRef = React.useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const [assetFormOpen, setAssetFormOpen] = React.useState(false);
  const [assetEditingId, setAssetEditingId] = React.useState<string | null>(null);
  const [assetForm, setAssetForm] = React.useState<CustomerAssetFormState>(emptyCustomerAssetForm);
  const [toolIdSearch, setToolIdSearch] = React.useState('');
  const [toolFormOpen, setToolFormOpen] = React.useState(false);
  const [toolEditingId, setToolEditingId] = React.useState<string | null>(null);
  const [toolEditSearch, setToolEditSearch] = React.useState('');
  const [toolForm, setToolForm] = React.useState({ toolId: '', internalToolId: '', partType: 'Hobs', minimumLife: '', measurementUnit: 'in' as 'in' | 'mm' });
  const [toolDrawingFiles, setToolDrawingFiles] = React.useState<File[]>([]);
  const [toolDocuments, setToolDocuments] = React.useState<CustomerToolDocument[]>([]);
  const [toolDocumentRenamingId, setToolDocumentRenamingId] = React.useState<string | null>(null);
  const [toolDocumentRename, setToolDocumentRename] = React.useState('');
  const [toolDocumentDeleteCandidate, setToolDocumentDeleteCandidate] = React.useState<CustomerToolDocument | null>(null);
  const [toolUploadMessage, setToolUploadMessage] = React.useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [toolUpdateMessage, setToolUpdateMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [toolDrawingUploading, setToolDrawingUploading] = React.useState(false);
  const [toolDrawingDragActive, setToolDrawingDragActive] = React.useState(false);
  const [toolMissingReportOpen, setToolMissingReportOpen] = React.useState(false);
  const [toolMissingReportDownloading, setToolMissingReportDownloading] = React.useState(false);
  const [assetPhotos, setAssetPhotos] = React.useState<File[]>([]);
  const [assetDocuments, setAssetDocuments] = React.useState<File[]>([]);
  const [loading, setLoading] = React.useState(activeTab === 'customers' || activeTab === 'assets-equipment' || activeTab === 'receptions' || activeTab === 'balances');
  const [saving, setSaving] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [formMode, setFormMode] = React.useState<'create' | 'edit' | null>(null);
  const [customerToDelete, setCustomerToDelete] = React.useState<CustomerRecord | null>(null);
  const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerRecord | null>(null);
  const [customerSearch, setCustomerSearch] = React.useState('');
  const [customerForm, setCustomerForm] = React.useState<CustomerFormState>(emptyCustomerForm);
  const [sameLegalName, setSameLegalName] = React.useState(false);
  const [sameContactName, setSameContactName] = React.useState(false);
  const [paymentTermsMode, setPaymentTermsMode] = React.useState<PaymentTermsMode>('Net 30');
  const [addressLookup, setAddressLookup] = React.useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });
  const [addressSuggestions, setAddressSuggestions] = React.useState<GooglePlacesAddressMatch[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = React.useState(false);
  const [addressSuggestionsLoading, setAddressSuggestionsLoading] = React.useState(false);
  const [addressSuggestionPosition, setAddressSuggestionPosition] = React.useState<FloatingMenuPosition | null>(null);
  const addressLookupControlRef = React.useRef<HTMLDivElement | null>(null);
  const addressSuggestionMenuRef = React.useRef<HTMLDivElement | null>(null);

  const loadCustomers = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setErrorMessage('');
    const { data, error } = await supabase
      .from('mes_customers')
      .select(customerSelectColumns)
      .eq('organization_id', organizationId)
      .order('status', { ascending: true })
      .order('customer_name', { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setCustomers([]);
    } else {
      setCustomers(((data ?? []) as CustomerRow[]).map(mapCustomerRow));
    }
    setLoading(false);
  }, [organizationId]);

  const loadAssets = React.useCallback(async () => {
    if (!organizationId) return;
    setAssetLoading(true);
    setAssetError('');

    const [assetResponse, serviceResponse, attachmentResponse, productionSerialResponse, toolResponse, toolDocumentResponse, traceabilityResponse, performanceResponse] = await Promise.all([
      supabase
        .from('mes_customer_assets')
        .select('*')
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('mes_customer_asset_service_events')
        .select('*, production_order:mes_production_orders(order_number)')
        .eq('organization_id', organizationId)
        .order('service_date', { ascending: false }),
      supabase
        .from('mes_customer_asset_attachments')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false }),
      supabase
        .from('mes_production_serials')
        .select('production_order_id, serial_number, tool_id')
        .eq('organization_id', organizationId),
      supabase.from('mes_customer_tool_ids').select('id, tool_id, internal_tool_id, part_type, minimum_life, measurement_unit').eq('organization_id', organizationId).order('tool_id'),
      supabase.from('mes_customer_tool_id_documents').select('id, tool_definition_id, storage_bucket, file_name, file_path, file_type, created_at').eq('organization_id', organizationId).order('created_at'),
      supabase.from('mes_operator_terminal_traceability').select('production_order_id, tool_id, serial_number, dimensions_unit, before_notch, before_tooth_length, stock_to_remove, after_tooth_length, payload, created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }),
      supabase.from('mes_tool_performance_runs').select('service_event_id, tool_life').eq('organization_id', organizationId),
    ]);

    const firstError = assetResponse.error || serviceResponse.error || attachmentResponse.error || productionSerialResponse.error || toolResponse.error || toolDocumentResponse.error || traceabilityResponse.error;
    if (firstError) {
      setAssetError(firstError.message);
      setAssets([]);
      setAssetServices([]);
      setAssetAttachments([]);
      setToolDefinitions([]);
      setToolDocuments([]);
      setAssetLifeTraceability([]);
    } else {
      const toolIdByProductionSerial = new Map(
        ((productionSerialResponse.data ?? []) as ProductionSerialToolRow[]).map((row) => [
          `${row.production_order_id}:${row.serial_number.trim().toLocaleLowerCase()}`,
          row.tool_id?.trim() ?? '',
        ]),
      );
      const nextAssets = ((assetResponse.data ?? []) as CustomerAssetRow[]).map((row) => {
        const asset = mapAssetRow(row);
        const linkedTool = ((toolResponse.data ?? []) as CustomerToolDefinitionRow[]).find((tool) => tool.id === asset.toolDefinitionId);
        const productionOrderId = asset.lastProductionOrderId ?? asset.sourceProductionOrderId;
        return {
          ...asset,
          toolId: linkedTool?.tool_id ?? (productionOrderId
            ? toolIdByProductionSerial.get(`${productionOrderId}:${asset.serialNumber.trim().toLocaleLowerCase()}`) ?? ''
            : ''),
          internalToolId: linkedTool?.internal_tool_id ?? '',
        };
      });
      setAssets(nextAssets);
      setToolDefinitions(((toolResponse.data ?? []) as CustomerToolDefinitionRow[]).map((row) => ({ id: row.id, toolId: row.tool_id, internalToolId: row.internal_tool_id, partType: row.part_type, minimumLife: row.minimum_life === null ? null : Number(row.minimum_life), measurementUnit: row.measurement_unit })));
      setToolDocuments(((toolDocumentResponse.data ?? []) as CustomerToolDocumentRow[]).map((row) => ({
        id: row.id,
        toolDefinitionId: row.tool_definition_id,
        storageBucket: row.storage_bucket,
        fileName: row.file_name,
        filePath: row.file_path,
        fileType: row.file_type,
        createdAt: row.created_at,
      })));
      setAssetLifeTraceability((traceabilityResponse.data ?? []) as AssetLifeTraceabilityRow[]);
      const performanceByService = new Map((performanceResponse.data ?? []).map((row) => [String(row.service_event_id), Number(row.tool_life)]));
      setAssetServices(((serviceResponse.data ?? []) as CustomerAssetServiceRow[]).map((row) => {
        const order = Array.isArray(row.production_order) ? row.production_order[0] : row.production_order;
        return {
          id: row.id,
          assetId: row.asset_id,
          productionOrderId: row.production_order_id,
          sourceType: row.source_type,
          serviceType: row.service_type,
          result: row.result,
          serviceDate: row.service_date,
          remainingLifePercent: row.remaining_life_percent,
          notes: row.notes,
          orderNumber: order?.order_number ?? '',
          performancePieces: performanceByService.get(row.id) ?? null,
        };
      }));
      setAssetAttachments(((attachmentResponse.data ?? []) as CustomerAssetAttachmentRow[]).map((row) => ({
        id: row.id,
        assetId: row.asset_id,
        serviceEventId: row.service_event_id ?? null,
        attachmentType: row.attachment_type,
        storageBucket: row.storage_bucket,
        fileName: row.file_name,
        filePath: row.file_path,
        fileType: row.file_type,
        createdAt: row.created_at,
      })));
      setSelectedAssetId((current) => current && nextAssets.some((asset) => asset.id === current)
        ? current
        : nextAssets[0]?.id ?? null);
    }
    setAssetLoading(false);
  }, [organizationId]);

  React.useEffect(() => {
    if (activeTab === 'customers' || activeTab === 'assets-equipment' || activeTab === 'receptions' || activeTab === 'balances') void loadCustomers();
  }, [activeTab, loadCustomers]);

  React.useEffect(() => {
    if (activeTab === 'assets-equipment') void loadAssets();
  }, [activeTab, loadAssets]);

  React.useEffect(() => {
    if (toolUploadMessage?.type !== 'success') return undefined;
    const timeoutId = window.setTimeout(() => {
      setToolUploadMessage((current) => current?.type === 'success' && current.text === toolUploadMessage.text ? null : current);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [toolUploadMessage]);

  React.useEffect(() => {
    if (toolUpdateMessage?.type !== 'success') return undefined;
    const timeoutId = window.setTimeout(() => setToolUpdateMessage(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [toolUpdateMessage]);

  const assetRealtimeTables = React.useMemo(() => ([
    { table: 'mes_customer_assets', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_asset_service_events', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_asset_attachments', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_operator_terminal_traceability', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_tool_ids', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_tool_id_documents', filter: `organization_id=eq.${organizationId}` },
  ]), [organizationId]);

  useSupabaseRealtimeRefresh({
    channelName: `mes-customer-assets-live:${organizationId}`,
    tables: assetRealtimeTables,
    onRefresh: loadAssets,
    enabled: activeTab === 'assets-equipment' && Boolean(organizationId),
  });

  React.useEffect(() => {
    setAssetPreviewZoom(1);
    setAssetPreviewPosition({ x: 0, y: 0 });
    assetPreviewDragRef.current = null;
  }, [assetAttachmentPreview?.url]);

  const changeAssetPreviewZoom = (nextZoom: number) => {
    const zoom = Math.min(5, Math.max(1, nextZoom));
    setAssetPreviewZoom(zoom);
    if (zoom === 1) setAssetPreviewPosition({ x: 0, y: 0 });
  };

  React.useEffect(() => {
    if (activeTab !== 'assets-equipment') return;
    window.sessionStorage.setItem(getAssetRegistryViewStateKey(organizationId), JSON.stringify({
      customerFilter: assetCustomerFilter,
      assetSearch,
      toolIdSearch: assetToolIdSearch,
      selectedAssetTypes: selectedAssetTypes ? Array.from(selectedAssetTypes) : null,
      selectedAssetId,
    } satisfies AssetRegistryViewState));
  }, [activeTab, organizationId, assetCustomerFilter, assetSearch, assetToolIdSearch, selectedAssetTypes, selectedAssetId]);

  React.useEffect(() => {
    if (!formMode && !customerToDelete && !assetFormOpen && !toolFormOpen && !toolMissingReportOpen && !assetAttachmentPreview && !toolDocumentDeleteCandidate) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving) return;
      if (toolDocumentDeleteCandidate) {
        setToolDocumentDeleteCandidate(null);
        return;
      }
      if (assetAttachmentPreview) {
        setAssetAttachmentPreview(null);
        return;
      }
      setFormMode(null);
      setCustomerToDelete(null);
      setAssetFormOpen(false);
      setToolFormOpen(false);
      setToolMissingReportOpen(false);
      setToolDocumentDeleteCandidate(null);
      setAssetEditingId(null);
      setAssetAttachmentPreview(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [formMode, customerToDelete, assetFormOpen, toolFormOpen, toolMissingReportOpen, assetAttachmentPreview, toolDocumentDeleteCandidate, saving]);

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

  React.useLayoutEffect(() => {
    if (!(showAddressSuggestions || addressSuggestionsLoading)) return;
    if (!addressSuggestions.length && !addressSuggestionsLoading) return;
    updateAddressSuggestionPosition();
  }, [addressSuggestions.length, addressSuggestionsLoading, showAddressSuggestions, updateAddressSuggestionPosition]);

  React.useEffect(() => {
    if (!formMode || customerForm.address.trim().length < 3) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressSuggestionsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setAddressSuggestionsLoading(true);
      searchGooglePlacesAddressMatches(customerForm.address.trim(), 5, controller.signal)
        .then((matches) => {
          if (controller.signal.aborted) return;
          setAddressSuggestions(matches);
          setShowAddressSuggestions(matches.length > 0);
        })
        .catch((error) => {
          if ((error as Error).name === 'AbortError') return;
          setAddressSuggestions([]);
          setShowAddressSuggestions(false);
          setAddressLookup({ status: 'error', message: 'Unable to load Google address suggestions.' });
        })
        .finally(() => {
          if (!controller.signal.aborted) setAddressSuggestionsLoading(false);
        });
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [customerForm.address, formMode]);

  React.useEffect(() => {
    const menuOpen = (showAddressSuggestions || addressSuggestionsLoading) && (addressSuggestions.length > 0 || addressSuggestionsLoading);
    if (!menuOpen) return undefined;
    const closeIfOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (addressLookupControlRef.current?.contains(target) || addressSuggestionMenuRef.current?.contains(target)) return;
      setShowAddressSuggestions(false);
    };
    const reposition = () => updateAddressSuggestionPosition();
    document.addEventListener('mousedown', closeIfOutside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', closeIfOutside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [addressSuggestions.length, addressSuggestionsLoading, showAddressSuggestions, updateAddressSuggestionPosition]);

  const openCreateCustomer = () => {
    setErrorMessage('');
    setSelectedCustomer(null);
    setCustomerForm(emptyCustomerForm);
    setSameLegalName(false);
    setSameContactName(false);
    setPaymentTermsMode('Net 30');
    setAddressLookup({ status: 'idle', message: '' });
    setAddressSuggestions([]);
    setFormMode('create');
  };

  const openEditCustomer = (customer: CustomerRecord) => {
    setErrorMessage('');
    setSelectedCustomer(customer);
    setCustomerForm(customerToForm(customer));
    setSameLegalName(customer.customerName.trim() === customer.legalName.trim());
    setSameContactName(customer.customerName.trim() === customer.contactName.trim());
    setPaymentTermsMode(standardPaymentTerms.has(customer.paymentTerms as PaymentTermsMode)
      ? customer.paymentTerms as PaymentTermsMode
      : 'Custom');
    setAddressLookup({ status: 'idle', message: '' });
    setAddressSuggestions([]);
    setFormMode('edit');
  };

  const lookupCustomerAddress = async () => {
    const address = customerForm.address.trim();
    if (!address) {
      setAddressLookup({ status: 'error', message: 'Enter an address before searching.' });
      return;
    }
    setAddressLookup({ status: 'loading', message: 'Searching address...' });
    try {
      const match = (await searchGooglePlacesAddressMatches(address, 1))[0];
      const resolvedMatch = match ? await resolveGooglePlacesAddressMatch(match) : null;
      if (!resolvedMatch) {
        setAddressLookup({ status: 'error', message: 'No match found. Try street, city, state, and country.' });
        return;
      }
      setCustomerForm((current) => ({ ...current, address: resolvedMatch.address }));
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressLookup({ status: 'success', message: 'Address verified with Google Maps.' });
    } catch {
      setAddressLookup({ status: 'error', message: 'Could not reach the address lookup service. Try again.' });
    }
  };

  const selectAddressSuggestion = async (match: GooglePlacesAddressMatch) => {
    setAddressLookup({ status: 'loading', message: 'Loading selected address...' });
    try {
      const resolvedMatch = await resolveGooglePlacesAddressMatch(match);
      if (!resolvedMatch) throw new Error('Address details unavailable');
      setCustomerForm((current) => ({ ...current, address: resolvedMatch.address }));
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressLookup({ status: 'success', message: 'Address verified with Google Maps.' });
    } catch {
      setAddressLookup({ status: 'error', message: 'Could not load the selected address details.' });
    }
  };

  const closeDialog = () => {
    if (saving) return;
    setFormMode(null);
    setCustomerToDelete(null);
    setAssetFormOpen(false);
    setAssetEditingId(null);
    setToolFormOpen(false);
    setToolEditingId(null);
    setToolDocumentRenamingId(null);
    setToolDocumentRename('');
    setToolDrawingFiles([]);
    setToolUploadMessage(null);
    setToolUpdateMessage(null);
    setToolMissingReportOpen(false);
  };

  const saveCustomer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || saving) return;
    setSaving(true);
    setErrorMessage('');

    const payload = {
      organization_id: organizationId,
      customer_name: customerForm.customerName.trim(),
      legal_name: customerForm.legalName.trim(),
      tax_id: customerForm.taxId.trim() || null,
      contact_name: customerForm.contactName.trim(),
      email: customerForm.email.trim(),
      phone: customerForm.phone.trim(),
      address: customerForm.address.trim(),
      payment_terms: customerForm.paymentTerms.trim(),
      lead_time_days: Math.max(0, Math.min(3650, Number.parseInt(customerForm.leadTimeDays, 10) || 15)),
      base_currency: customerForm.baseCurrency,
      notes: customerForm.notes.trim(),
      status: customerForm.status,
    };

    const request = formMode === 'edit' && selectedCustomer
      ? supabase
        .from('mes_customers')
        .update(payload)
        .eq('id', selectedCustomer.id)
        .eq('organization_id', organizationId)
      : supabase.from('mes_customers').insert(payload);
    const { data, error } = await request.select(customerSelectColumns).single();

    if (error) {
      setErrorMessage(error.code === '23505'
        ? 'A customer with this name already exists in your organization.'
        : error.message);
      setSaving(false);
      return;
    }

    const savedCustomer = mapCustomerRow(data as CustomerRow);
    setCustomers((current) => formMode === 'edit'
      ? current.map((customer) => customer.id === savedCustomer.id ? savedCustomer : customer)
      : [savedCustomer, ...current]);
    setFormMode(null);
    setSelectedCustomer(null);
    setSaving(false);
  };

  const deleteCustomer = async () => {
    if (!customerToDelete || saving) return;
    setSaving(true);
    setErrorMessage('');
    const { data, error } = await supabase
      .from('mes_customers')
      .delete()
      .eq('id', customerToDelete.id)
      .eq('organization_id', organizationId)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      setErrorMessage(error?.message || 'You do not have permission to delete this customer.');
      setSaving(false);
      return;
    }

    setCustomers((current) => current.filter((customer) => customer.id !== customerToDelete.id));
    setCustomerToDelete(null);
    setSaving(false);
  };

  const openCreateAsset = () => {
    setAssetEditingId(null);
    const preferredCustomer = assetCustomerFilter !== 'all'
      ? assetCustomerFilter
      : customers.find((customer) => customer.status === 'active')?.id ?? customers[0]?.id ?? '';
    setAssetForm({ ...emptyCustomerAssetForm, customerId: preferredCustomer });
    setToolIdSearch('');
    setAssetPhotos([]);
    setAssetDocuments([]);
    setAssetError('');
    setAssetFormOpen(true);
  };

  const openEditAsset = (asset: CustomerAssetRecord) => {
    setAssetEditingId(asset.id);
    setAssetForm({
      customerId: asset.customerId,
      toolDefinitionId: asset.toolDefinitionId ?? '',
      assetType: asset.assetType,
      serialNumber: asset.serialNumber,
      partNumber: asset.partNumber,
      description: asset.description,
      manufacturer: asset.manufacturer,
      familyCategory: asset.familyCategory,
      currentLocation: asset.currentLocation,
      custodianName: asset.custodianName,
      custodianRole: asset.custodianRole,
      status: asset.status,
      lastInspectionAt: asset.lastInspectionAt?.slice(0, 10) ?? '',
      internalNotes: asset.internalNotes,
    });
    setAssetPhotos([]);
    setAssetDocuments([]);
    setToolIdSearch(asset.toolId);
    setAssetError('');
    setAssetFormOpen(true);
  };

  const uploadAssetFiles = async (
    assetId: string,
    customerId: string,
    files: File[],
    attachmentType: CustomerAssetAttachment['attachmentType'],
  ) => {
    const uploadedRows = [];
    for (const [index, file] of files.entries()) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const filePath = `${organizationId}/${customerId}/${assetId}/${Date.now()}-${index}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('mes-customer-assets')
        .upload(filePath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      uploadedRows.push({
        organization_id: organizationId,
        asset_id: assetId,
        attachment_type: attachmentType,
        storage_bucket: 'mes-customer-assets',
        file_name: file.name,
        file_path: filePath,
        file_type: file.type || 'application/octet-stream',
      });
    }
    if (uploadedRows.length) {
      const { error: attachmentError } = await supabase.from('mes_customer_asset_attachments').insert(uploadedRows);
      if (attachmentError) throw attachmentError;
    }
  };

  const uploadToolDrawings = async (toolDefinitionId: string, files: File[]) => {
    if (!files.length || toolDrawingUploading) return false;
    setToolDrawingFiles(files);
    setToolDrawingUploading(true);
    setToolUploadMessage({
      type: 'info',
      text: files.length === 1 ? 'Uploading drawing...' : `Uploading ${files.length} drawings...`,
    });
    try {
      const uploadedRows = [];
      for (const [index, file] of files.entries()) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        const filePath = `${organizationId}/tool-ids/${toolDefinitionId}/${Date.now()}-${index}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('mes-customer-assets').upload(filePath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedRows.push({ organization_id: organizationId, tool_definition_id: toolDefinitionId, storage_bucket: 'mes-customer-assets', file_name: file.name, file_path: filePath, file_type: file.type || 'application/pdf' });
      }
      const { error: documentError } = await supabase.from('mes_customer_tool_id_documents').insert(uploadedRows);
      if (documentError) throw documentError;
      setToolDrawingFiles([]);
      setToolUploadMessage({
        type: 'success',
        text: files.length === 1 ? 'Drawing uploaded.' : `${files.length} drawings uploaded.`,
      });
      await loadAssets();
      return true;
    } catch (uploadError) {
      const uploadMessage = uploadError instanceof Error ? uploadError.message : 'The drawings could not be uploaded.';
      setToolUploadMessage({ type: 'error', text: uploadMessage });
      return false;
    } finally {
      setToolDrawingUploading(false);
    }
  };

  const selectToolDrawings = (files: File[]) => {
    const pdfFiles = files.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    setToolUploadMessage(null);
    if (!pdfFiles.length) {
      setToolDrawingFiles([]);
      setToolUploadMessage({ type: 'error', text: 'Select at least one PDF drawing.' });
      return;
    }
    if (toolEditingId === '') {
      setToolDrawingFiles([]);
      setToolUploadMessage({ type: 'error', text: 'Select a Tool ID before uploading drawings.' });
      return;
    }
    if (toolEditingId) {
      void uploadToolDrawings(toolEditingId, pdfFiles);
      return;
    }
    setToolDrawingFiles(pdfFiles);
  };

  const saveToolDefinition = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const toolFormIsShaver = /shaver/i.test(toolForm.partType);
    if (saving || !toolForm.toolId.trim()) return;
    setSaving(true);
    setAssetError('');
    setToolUpdateMessage(null);
    const existingTool = toolEditingId
      ? toolDefinitions.find((tool) => tool.id === toolEditingId)
      : toolDefinitions.find((tool) => tool.toolId.trim().toLowerCase() === toolForm.toolId.trim().toLowerCase());
    const toolPayload = {
      organization_id: organizationId,
      tool_id: toolForm.toolId.trim(),
      internal_tool_id: toolForm.internalToolId.trim(),
      part_type: toolForm.partType,
      minimum_life: toolFormIsShaver || !toolForm.minimumLife.trim() ? null : Number(toolForm.minimumLife),
      measurement_unit: toolForm.measurementUnit,
    };
    const request = existingTool
      ? supabase.from('mes_customer_tool_ids').update(toolPayload).eq('id', existingTool.id).eq('organization_id', organizationId)
      : supabase.from('mes_customer_tool_ids').insert(toolPayload);
    const { data, error } = await request.select('id, tool_id, internal_tool_id, part_type, minimum_life, measurement_unit').single();
    if (error || !data) {
      setToolUpdateMessage({ type: 'error', text: error?.message ?? 'The Tool ID could not be saved.' });
      setSaving(false);
      return;
    }
    try {
      if (toolDrawingFiles.length) await uploadToolDrawings(data.id, toolDrawingFiles);
      await loadAssets();
      if (toolEditingId === null) {
        setToolFormOpen(false);
        setToolEditingId(null);
        setToolForm({ toolId: '', internalToolId: '', partType: 'Hobs', minimumLife: '', measurementUnit: 'in' });
      } else {
        setToolUpdateMessage({ type: 'success', text: 'Tool ID updated.' });
      }
    } catch (updateError) {
      setToolUpdateMessage({ type: 'error', text: updateError instanceof Error ? updateError.message : 'The Tool ID could not be refreshed.' });
    } finally {
      setSaving(false);
    }
  };

  const saveAsset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || saving || !assetForm.customerId || !assetForm.toolDefinitionId) return;
    setSaving(true);
    setAssetError('');

    const linkedTool = toolDefinitions.find((tool) => tool.id === assetForm.toolDefinitionId);
    const assetPayload = {
      organization_id: organizationId,
      customer_id: assetForm.customerId,
      tool_definition_id: assetForm.toolDefinitionId || null,
      asset_type: linkedTool?.partType ?? assetForm.assetType.trim(),
      serial_number: assetForm.serialNumber.trim(),
      part_number: assetForm.partNumber.trim() || null,
      description: assetForm.description.trim(),
      manufacturer: assetForm.manufacturer.trim() || null,
      family_category: assetForm.familyCategory.trim() || null,
      current_location: assetForm.currentLocation.trim() || null,
      custodian_name: assetForm.custodianName.trim() || null,
      custodian_role: assetForm.custodianRole.trim() || null,
      status: assetForm.status,
      max_sharpenings: null,
      last_inspection_at: assetForm.lastInspectionAt || null,
      internal_notes: assetForm.internalNotes.trim(),
    };
    const request = assetEditingId
      ? supabase
        .from('mes_customer_assets')
        .update(assetPayload)
        .eq('id', assetEditingId)
        .eq('organization_id', organizationId)
      : supabase
        .from('mes_customer_assets')
        .insert({ ...assetPayload, source_type: 'manual' });
    const { data, error } = await request.select('*').single();

    if (error || !data) {
      setAssetError(error?.code === '23505'
        ? 'This serial number is already registered for the selected client.'
        : error?.message || 'The asset could not be created.');
      setSaving(false);
      return;
    }

    try {
      const savedAsset = mapAssetRow(data as CustomerAssetRow);
      await uploadAssetFiles(savedAsset.id, savedAsset.customerId, assetPhotos, 'photo');
      await uploadAssetFiles(savedAsset.id, savedAsset.customerId, assetDocuments, 'document');
      setAssetFormOpen(false);
      setAssetEditingId(null);
      setSelectedAssetId(savedAsset.id);
      await loadAssets();
    } catch (uploadError) {
      const uploadMessage = uploadError instanceof Error ? uploadError.message : 'The asset was saved, but some files could not be uploaded.';
      setAssetFormOpen(false);
      setAssetEditingId(null);
      await loadAssets();
      setAssetError(uploadMessage);
    } finally {
      setSaving(false);
    }
  };

  const openAssetAttachment = async (attachment: CustomerAssetAttachment) => {
    setAssetError('');
    const { data, error } = await supabase.storage
      .from(attachment.storageBucket)
      .createSignedUrl(attachment.filePath, 60 * 10);
    if (error || !data?.signedUrl) {
      setAssetError(error?.message || 'This file could not be opened.');
      return;
    }
    setAssetAttachmentPreview({
      fileName: attachment.fileName,
      url: data.signedUrl,
      isPdf: attachment.fileType === 'application/pdf' || attachment.fileName.toLocaleLowerCase().endsWith('.pdf'),
      category: 'Asset Evidence',
    });
  };

  const openToolDocument = async (document: CustomerToolDocument) => {
    setAssetError('');
    const { data, error } = await supabase.storage
      .from(document.storageBucket)
      .createSignedUrl(document.filePath, 60 * 10);
    if (error || !data?.signedUrl) {
      setAssetError(error?.message || 'This drawing could not be opened.');
      return;
    }
    setAssetAttachmentPreview({
      fileName: document.fileName,
      url: data.signedUrl,
      isPdf: true,
      category: 'Tool Drawing',
    });
  };

  const renameToolDocument = async (document: CustomerToolDocument) => {
    const nextName = toolDocumentRename.trim();
    if (!nextName || saving) return;
    setSaving(true);
    setAssetError('');
    const { error } = await supabase.from('mes_customer_tool_id_documents')
      .update({ file_name: nextName })
      .eq('organization_id', organizationId)
      .eq('id', document.id);
    setSaving(false);
    if (error) {
      setAssetError(error.message);
      return;
    }
    setToolDocuments((current) => current.map((item) => item.id === document.id ? { ...item, fileName: nextName } : item));
    setToolDocumentRenamingId(null);
    setToolDocumentRename('');
  };

  const deleteToolDocument = async () => {
    const document = toolDocumentDeleteCandidate;
    if (!document || saving) return;
    setSaving(true);
    setAssetError('');
    const { error } = await supabase.from('mes_customer_tool_id_documents')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', document.id);
    if (error) {
      setAssetError(error.message);
      setSaving(false);
      setToolDocumentDeleteCandidate(null);
      return;
    }
    const storageResult = await supabase.storage.from(document.storageBucket).remove([document.filePath]);
    setToolDocuments((current) => current.filter((item) => item.id !== document.id));
    setToolDocumentDeleteCandidate(null);
    setSaving(false);
    if (storageResult.error) setAssetError(`The drawing was removed from this Tool ID, but its stored file could not be deleted: ${storageResult.error.message}`);
  };

  const openProductionOrder = async (productionOrderId: string | null) => {
    if (!productionOrderId) return;
    setAssetOrderDetails({
      order: { id: productionOrderId, orderNumber: '', partNumber: '', partName: '', plannedQuantity: 0, completedQuantity: 0, scrapQuantity: 0, status: 'planned', priority: 'normal', dueDate: '', assignedWorkCenter: '', plannedShifts: [], manufacturingType: 'multi-step', productionFlow: '', assignedStation: '' },
      details: { loading: true, error: '', pieces: [], timeSpentMs: 0 },
    });
    const [{ data: orderRow, error: orderError }, { data: serialRows, error: serialError }, { data: traceabilityRows, error: traceabilityError }] = await Promise.all([
      supabase.from('mes_production_orders').select('*').eq('organization_id', organizationId).eq('id', productionOrderId).single(),
      supabase.from('mes_production_serials').select('id, piece_sequence, tool_id, serial_number, result, traceability_id, reported_at').eq('organization_id', organizationId).eq('production_order_id', productionOrderId).order('piece_sequence'),
      supabase.from('mes_operator_terminal_traceability').select('id, production_order_id, template_id, part_label, tool_id, serial_number, dimensions_unit, before_notch, before_tooth_length, damage_codes, damage_image_url, stock_to_remove, after_tooth_length, payload, created_at').eq('organization_id', organizationId).eq('production_order_id', productionOrderId).order('created_at', { ascending: false }),
    ]);
    if (orderError || serialError || traceabilityError || !orderRow) {
      setAssetOrderDetails((current) => current ? { ...current, details: { loading: false, error: 'Unable to load order details.', pieces: [], timeSpentMs: 0 } } : null);
      return;
    }
    const row = orderRow as Record<string, any>;
    const order: ProductionOrder = { id: row.id, orderNumber: row.order_number, partNumber: row.part_number, partName: row.part_name, clientName: row.client_name ?? '', customerId: row.customer_id ?? '', plannedQuantity: Number(row.planned_quantity) || 0, completedQuantity: Number(row.completed_quantity) || 0, scrapQuantity: Number(row.scrap_quantity) || 0, status: row.status, priority: row.priority, dueDate: row.due_date, assignedWorkCenter: row.assigned_work_center ?? '', plannedShifts: row.planned_shifts ?? [], manufacturingType: row.manufacturing_type ?? 'multi-step', productionFlow: row.production_flow ?? '', assignedStation: row.assigned_station ?? '', pieceType: row.piece_type ?? 'hobs', qualityChecksEnabled: row.quality_checks_enabled ?? false, qualityChecks: row.quality_checks ?? [], qualityCheckLimits: row.quality_check_limits ?? {}, qualityMeasurementUnit: row.quality_measurement_unit ?? 'microns', createdAt: row.created_at ?? undefined, updatedAt: row.updated_at ?? undefined };
    const traces = (traceabilityRows ?? []) as ProductionOrderDetailTraceabilityRow[];
    const traceById = new Map(traces.map((trace) => [trace.id, trace]));
    const traceBySerial = new Map(traces.filter((trace) => trace.serial_number).map((trace) => [trace.serial_number!.trim().toLowerCase(), trace]));
    const serials = (serialRows ?? []) as Array<{ id:string;piece_sequence:number;tool_id:string;serial_number:string;result:'good'|'scrap'|null;traceability_id:string|null;reported_at:string|null }>;
    const pieces: ProductionOrderDetailPiece[] = serials.map((serial) => ({ serialId: serial.id, pieceSequence: serial.piece_sequence, toolId: serial.tool_id ?? '', serialNumber: serial.serial_number ?? '', status: serial.result ?? 'not-started', reportedAt: serial.reported_at ?? '', timeSpentMs: 0, runningTimeMs: 0, setupTimeMs: 0, traceability: (serial.traceability_id ? traceById.get(serial.traceability_id) : null) ?? traceBySerial.get(serial.serial_number.trim().toLowerCase()) ?? null, qualityInspection: null, qualityMeasurements: [], qualityDocuments: [], evidence: [] }));
    setAssetOrderDetails({ order, details: { loading: false, error: '', pieces, timeSpentMs: 0 } });
  };

  const customerFilterOptions = React.useMemo<Array<CustomerDropdownOption<string>>>(() => [
    { value: 'all', label: 'All clients' },
    ...customers.map((customer) => ({
      value: customer.id,
      label: customer.status === 'inactive' ? `${customer.customerName} (Inactive)` : customer.customerName,
    })),
  ], [customers]);

  React.useEffect(() => {
    if (assetCustomerFilter !== 'all' && !customers.some((customer) => customer.id === assetCustomerFilter)) {
      setAssetCustomerFilter('all');
    }
  }, [assetCustomerFilter, customers]);

  const assetCustomerOptions = React.useMemo<Array<CustomerDropdownOption<string>>>(() => customers.map((customer) => ({
    value: customer.id,
    label: customer.status === 'inactive' ? `${customer.customerName} (Inactive)` : customer.customerName,
  })), [customers]);

  const assetTypeOptions = React.useMemo(() => {
    const typeByKey = new Map<string, string>();
    assets.forEach((asset) => {
      const key = normalizeAssetType(asset.assetType);
      if (key && !typeByKey.has(key)) typeByKey.set(key, asset.assetType.trim());
    });
    return Array.from(typeByKey, ([key, label]) => ({ key, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [assets]);

  const filteredAssets = React.useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    const toolIdQuery = assetToolIdSearch.trim().toLowerCase();
    return assets.filter((asset) => {
      if (assetCustomerFilter !== 'all' && asset.customerId !== assetCustomerFilter) return false;
      if (selectedAssetTypes && !selectedAssetTypes.has(normalizeAssetType(asset.assetType))) return false;
      if (toolIdQuery && !`${asset.toolId} ${asset.internalToolId}`.toLowerCase().includes(toolIdQuery)) return false;
      if (!query) return true;
      const customer = customers.find((item) => item.id === asset.customerId);
      return [asset.serialNumber, asset.partNumber, asset.assetType, asset.description, asset.manufacturer, customer?.customerName]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [assetCustomerFilter, assetSearch, assetToolIdSearch, assets, customers, selectedAssetTypes]);

  const assetTypeSummaries = React.useMemo(() => {
    const countByType = new Map<string, number>();
    filteredAssets.forEach((asset) => {
      const key = normalizeAssetType(asset.assetType);
      countByType.set(key, (countByType.get(key) ?? 0) + 1);
    });
    return assetTypeOptions
      .map((assetType) => ({ ...assetType, count: countByType.get(assetType.key) ?? 0 }))
      .filter((assetType) => assetType.count > 0);
  }, [assetTypeOptions, filteredAssets]);

  React.useEffect(() => {
    if (loading || assetLoading || assets.length === 0) return;
    if (selectedAssetId && filteredAssets.some((asset) => asset.id === selectedAssetId)) return;
    setSelectedAssetId(filteredAssets[0]?.id ?? null);
  }, [assetLoading, assets.length, filteredAssets, loading, selectedAssetId]);

  const selectedAsset = filteredAssets.find((asset) => asset.id === selectedAssetId) ?? null;
  const selectedAssetCustomer = selectedAsset
    ? customers.find((customer) => customer.id === selectedAsset.customerId) ?? null
    : null;
  const selectedAssetServices = selectedAsset
    ? assetServices.filter((service) => service.assetId === selectedAsset.id)
    : [];
  const selectedAssetAttachments = selectedAsset
    ? assetAttachments.filter((attachment) => attachment.assetId === selectedAsset.id)
    : [];
  const selectedAssetSharpeningCount = selectedAssetServices.filter((service) => service.result !== 'skipped').length;
  const selectedAssetTool = selectedAsset?.toolDefinitionId ? toolDefinitions.find((tool) => tool.id === selectedAsset.toolDefinitionId) ?? null : null;
  const saveServicePerformance = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedAsset || !performanceService) return;
    const pieces = Math.round(Number(performancePiecesDraft));
    const effectiveToolId = selectedAsset.toolId.trim() || selectedAssetTool?.toolId.trim() || '';
    if (!Number.isFinite(pieces) || pieces < 0) { setPerformanceError('Enter a valid number of produced pieces.'); return; }
    if (!effectiveToolId) { setPerformanceError('Link a Tool ID to this serial before adding performance.'); return; }
    const chronologicalServices = [...selectedAssetServices].filter((service) => service.result !== 'skipped').sort((a, b) => new Date(a.serviceDate).getTime() - new Date(b.serviceDate).getTime());
    const regrindNumber = Math.max(0, chronologicalServices.findIndex((service) => service.id === performanceService.id) + 1);
    setPerformanceSaving(true); setPerformanceError('');
    const performancePayload = {
      organization_id: organizationId,
      service_event_id: performanceService.id,
      tool_id: effectiveToolId,
      cutter_serial_number: selectedAsset.serialNumber,
      part_number: selectedAsset.partNumber,
      regrind_number: regrindNumber,
      tool_life: pieces,
      run_date: performanceService.serviceDate.slice(0, 10),
      customer_name: selectedAssetCustomer?.customerName ?? '',
    };
    const { error } = performanceService.performancePieces === null
      ? await supabase.from('mes_tool_performance_runs').insert(performancePayload)
      : await supabase.from('mes_tool_performance_runs').update(performancePayload).eq('service_event_id', performanceService.id);
    if (error) setPerformanceError(error.message);
    else { setAssetServices((current) => current.map((service) => service.id === performanceService.id ? { ...service, performancePieces: pieces } : service)); setPerformanceService(null); }
    setPerformanceSaving(false);
  };
  const isSelectedAssetShaver = /shaver/i.test(selectedAsset?.assetType ?? '') || /shaver/i.test(selectedAssetTool?.partType ?? '');
  const normalizeLifeUnit = (value: string | null | undefined) => {
    const unit = value?.trim().toLowerCase() ?? '';
    if (['in', 'inch', 'inches', '"'].includes(unit)) return 'in';
    if (['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'].includes(unit)) return 'mm';
    return unit;
  };
  const selectedAssetSerialKey = selectedAsset?.serialNumber.trim().toLowerCase() ?? '';
  const selectedToolIdKey = selectedAssetTool?.toolId.trim().toLowerCase() ?? '';
  const selectedToolUnit = normalizeLifeUnit(selectedAssetTool?.measurementUnit);
  const compatibleLifeUnit = (record: AssetLifeTraceabilityRow) =>
    isSelectedAssetShaver || normalizeLifeUnit(record.dimensions_unit) === selectedToolUnit;
  const matchingSerialMeasurements = selectedAsset && selectedAssetTool
    ? assetLifeTraceability.filter((record) => record.serial_number?.trim().toLowerCase() === selectedAssetSerialKey && compatibleLifeUnit(record))
    : [];
  const matchingToolMeasurements = selectedAssetTool
    ? assetLifeTraceability.filter((record) => record.tool_id?.trim().toLowerCase() === selectedToolIdKey && compatibleLifeUnit(record))
    : [];
  const getLifeMeasurement = (record: AssetLifeTraceabilityRow | null) => {
    if (!record || !selectedAssetTool) return null;
    const payload = record.payload ?? {};
    const preferredValues = /shaver/i.test(selectedAssetTool.partType)
      ? [payload.shaver_diameter, payload.after_height, record.after_tooth_length]
      : /shaper/i.test(selectedAssetTool.partType)
        ? [payload.after_height, record.after_tooth_length, payload.shaver_diameter]
        : [record.after_tooth_length, payload.after_height, payload.shaver_diameter];
    for (const rawValue of preferredValues) {
      const value = typeof rawValue === 'number' ? rawValue : typeof rawValue === 'string' ? Number(rawValue) : NaN;
      if (Number.isFinite(value)) return value;
    }
    return null;
  };
  const selectedSerialMeasurement = matchingSerialMeasurements.find((record) => getLifeMeasurement(record) !== null) ?? null;
  const combinedLifeMeasurements = Array.from(new Set([...matchingSerialMeasurements, ...matchingToolMeasurements]));
  const validLifeMeasurements = combinedLifeMeasurements.filter((record) => getLifeMeasurement(record) !== null);
  const selectedSerialRemovalValues = matchingSerialMeasurements.map((record) => Number(record.stock_to_remove)).filter((value) => Number.isFinite(value) && value > 0);
  const toolRemovalValues = validLifeMeasurements.map((record) => Number(record.stock_to_remove)).filter((value) => Number.isFinite(value) && value > 0);
  const explicitMaterialRemovalValues = selectedSerialRemovalValues.length ? selectedSerialRemovalValues : toolRemovalValues;
  const measuredDimensions = validLifeMeasurements.map((record) => getLifeMeasurement(record)).filter((value): value is number => value !== null);
  const derivedMaterialRemovalValues = measuredDimensions.slice(0, -1).map((value, index) => measuredDimensions[index + 1] - value).filter((value) => value > 0);
  const materialRemovalValues = explicitMaterialRemovalValues.length ? explicitMaterialRemovalValues : derivedMaterialRemovalValues;
  const averageMaterialRemoval = materialRemovalValues.length ? materialRemovalValues.reduce((sum, value) => sum + value, 0) / materialRemovalValues.length : null;
  const excludedLifeMeasurementCount = combinedLifeMeasurements.length - validLifeMeasurements.length;
  const currentLifeMeasurement = getLifeMeasurement(selectedSerialMeasurement);
  const rawShaverSharpeningNumber = selectedSerialMeasurement?.payload?.shaver_sharpening_number;
  const parsedShaverSharpeningNumber = typeof rawShaverSharpeningNumber === 'number'
    ? rawShaverSharpeningNumber
    : typeof rawShaverSharpeningNumber === 'string' ? Number.parseInt(rawShaverSharpeningNumber, 10) : NaN;
  const currentShaverSharpeningNumber = Number.isFinite(parsedShaverSharpeningNumber) ? Math.max(0, parsedShaverSharpeningNumber) : null;
  const dimensionalLifeRatio = selectedAssetTool && selectedAssetTool.minimumLife !== null && currentLifeMeasurement !== null && averageMaterialRemoval
    ? (currentLifeMeasurement - selectedAssetTool.minimumLife) / averageMaterialRemoval
    : null;
  const dimensionalSharpeningsRemaining = dimensionalLifeRatio === null
    ? null
    : Math.max(0, Math.floor(dimensionalLifeRatio + 1e-9));
  const selectedAssetSharpeningsRemaining = isSelectedAssetShaver
    ? currentShaverSharpeningNumber === null ? null : Math.max(0, SHAVER_MAX_SHARPENINGS - currentShaverSharpeningNumber)
    : dimensionalSharpeningsRemaining;
  const estimatedTotalSharpenings = selectedAssetSharpeningsRemaining === null ? null : selectedAssetSharpeningCount + selectedAssetSharpeningsRemaining;
  const selectedAssetLifePercent = isSelectedAssetShaver
    ? selectedAssetSharpeningsRemaining === null ? null : Math.max(0, Math.min(100, selectedAssetSharpeningsRemaining / SHAVER_MAX_SHARPENINGS * 100))
    : estimatedTotalSharpenings
      ? Math.max(0, Math.min(100, selectedAssetSharpeningsRemaining! / estimatedTotalSharpenings * 100))
      : selectedAssetSharpeningsRemaining === 0 ? 0 : null;
  const selectedAssetLifeTone = selectedAssetLifePercent === null
    ? 'unestimated'
    : selectedAssetLifePercent < 30 ? 'critical' : selectedAssetLifePercent <= 50 ? 'warning' : 'healthy';
  const incompleteToolDefinitions = React.useMemo(() => toolDefinitions.filter((tool) => (
    (!/shaver/i.test(tool.partType) && tool.minimumLife === null) || !tool.partType.trim() || !tool.measurementUnit
  )), [toolDefinitions]);
  const incompleteToolTypeSummaries = React.useMemo(() => {
    const counts = new Map<string, number>();
    incompleteToolDefinitions.forEach((tool) => counts.set(tool.partType || 'Other', (counts.get(tool.partType || 'Other') ?? 0) + 1));
    return Array.from(counts, ([partType, count]) => ({ partType, count })).sort((left, right) => right.count - left.count || left.partType.localeCompare(right.partType));
  }, [incompleteToolDefinitions]);
  const incompleteToolClientGroups = React.useMemo(() => {
    const groups = new Map<string, { customerId: string; customerName: string; tools: CustomerToolDefinition[] }>();
    incompleteToolDefinitions.forEach((tool) => {
      const linkedCustomerIds = Array.from(new Set(assets.filter((asset) => asset.toolDefinitionId === tool.id).map((asset) => asset.customerId)));
      const customerIds = linkedCustomerIds.length ? linkedCustomerIds : ['unassigned'];
      customerIds.forEach((customerId) => {
        const customerName = customerId === 'unassigned'
          ? 'Unassigned / No linked client'
          : customers.find((customer) => customer.id === customerId)?.customerName ?? 'Unknown client';
        const current = groups.get(customerId) ?? { customerId, customerName, tools: [] };
        current.tools.push(tool);
        groups.set(customerId, current);
      });
    });
    return Array.from(groups.values()).sort((left, right) => left.customerName.localeCompare(right.customerName));
  }, [assets, customers, incompleteToolDefinitions]);

  const downloadMissingToolDataReport = async () => {
    if (toolMissingReportDownloading) return;
    setToolMissingReportDownloading(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
      const generatedAt = new Date();
      let y = 54;
      pdf.setTextColor(7, 17, 28);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.text('Missing Tool ID Data Report', 48, y);
      y += 22;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(82, 98, 115);
      pdf.text(`Generated ${generatedAt.toLocaleString('en-US')}`, 48, y);
      y += 30;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(7, 17, 28);
      pdf.text(`Total Tool IDs missing data: ${incompleteToolDefinitions.length}`, 48, y);
      y += 18;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      incompleteToolTypeSummaries.forEach((summary) => { pdf.text(`${summary.partType}: ${summary.count}`, 48, y); y += 14; });
      y += 15;
      pdf.setFillColor(247, 249, 252);
      pdf.rect(48, y - 13, 516, 24, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.text('TOOL ID', 58, y);
      pdf.setTextColor(37, 99, 235);
      pdf.text('INTERNAL TOOL ID', 150, y);
      pdf.setTextColor(7, 17, 28);
      pdf.text('PART TYPE', 278, y);
      pdf.text('MISSING DATA', 365, y);
      pdf.text('SERIALS', 520, y);
      y += 22;
      pdf.setFont('helvetica', 'normal');
      incompleteToolClientGroups.forEach((group) => {
        if (y > 710) { pdf.addPage(); y = 54; }
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(230, 102, 0);
        pdf.text(`${group.customerName} (${group.tools.length})`, 52, y);
        y += 18;
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(38, 53, 68);
        group.tools.forEach((tool) => {
          if (y > 735) { pdf.addPage(); y = 54; }
        const missing = [!/shaver/i.test(tool.partType) && tool.minimumLife === null ? 'Minimum life' : '', !tool.partType.trim() ? 'Part type' : '', !tool.measurementUnit ? 'Unit' : ''].filter(Boolean).join(', ');
          const linkedSerials = assets.filter((asset) => asset.toolDefinitionId === tool.id && (group.customerId === 'unassigned' || asset.customerId === group.customerId)).length;
          pdf.text(tool.toolId.slice(0, 22), 58, y);
          pdf.setTextColor(37, 99, 235);
          pdf.setFont('helvetica', 'bold');
          pdf.text((tool.internalToolId || 'Not specified').slice(0, 24), 150, y);
          pdf.setTextColor(38, 53, 68);
          pdf.setFont('helvetica', 'normal');
          pdf.text((tool.partType || 'Not specified').slice(0, 14), 278, y);
          pdf.text(missing.slice(0, 23), 365, y);
          pdf.text(String(linkedSerials), 530, y);
          pdf.setDrawColor(226, 232, 240);
          pdf.line(48, y + 7, 564, y + 7);
          y += 22;
        });
        y += 8;
      });
      pdf.save(`missing-tool-id-data-${generatedAt.toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('Unable to generate missing Tool ID data report', error);
      setAssetError('The Missing Tool ID Data report could not be generated.');
    } finally {
      setToolMissingReportDownloading(false);
    }
  };
  const activeCustomers = customers.filter((customer) => customer.status === 'active').length;
  const normalizedCustomerSearch = customerSearch.trim().toLocaleLowerCase();
  const filteredCustomers = normalizedCustomerSearch
    ? customers.filter((customer) => [
      customer.customerName,
      customer.legalName,
      customer.contactName,
      customer.email,
      customer.phone,
      customer.taxId,
      customer.address,
      customer.paymentTerms,
      customer.notes,
    ].some((value) => value.toLocaleLowerCase().includes(normalizedCustomerSearch)))
    : customers;
  const addressSuggestionMenu = (showAddressSuggestions || addressSuggestionsLoading)
    && (addressSuggestions.length > 0 || addressSuggestionsLoading)
    && addressSuggestionPosition
    ? createPortal(
      <div
        className="address-suggestion-menu customer-address-suggestion-menu"
        role="listbox"
        aria-label={translateClientsText(languageCode, 'Customer address suggestions')}
        ref={addressSuggestionMenuRef}
        style={addressSuggestionPosition}
      >
        {addressSuggestionsLoading ? <span className="address-suggestion-loading">{translateClientsText(languageCode, 'Searching locations...')}</span> : null}
        {addressSuggestions.map((suggestion) => (
          <button type="button" role="option" key={suggestion.placeId ?? suggestion.address} onClick={() => void selectAddressSuggestion(suggestion)}>
            <strong>{suggestion.address.split(',')[0]}</strong>
            <span>{suggestion.address.split(',').slice(1).join(',').trim()}</span>
          </button>
        ))}
      </div>,
      document.body,
    )
    : null;

  return localizeClientsTree((
    <section className="mes-workspace-panel clients-operations-workspace">
      {addressSuggestionMenu}
      <div className={`mes-screen-header${activeTab === 'balances' ? ' client-balances-screen-header' : ''}`}>
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate(hostSection === 'financial-status' ? '/workspace/manufacturing-ops/intelligence' : '/workspace/manufacturing-ops/mes')}>
          <ArrowLeft size={17} />
          {hostSection === 'financial-status' ? 'Ops Intelligence' : 'MES Applications'}
        </button>
        <div className="mes-workspace-heading">
          <span className="eyebrow">{page.eyebrow}</span>
          <h2>{page.title}</h2>
          <p>{page.description}</p>
        </div>
        <div
          className={`clients-header-actions${activeTab === 'balances' ? ' client-balances-header-currency' : ''}`}
          id={activeTab === 'balances' ? 'client-balances-currency-portal' : undefined}
        >
          {activeTab === 'customers' ? (
            <button type="button" onClick={openCreateCustomer}>
              <Plus size={16} />
              Add New Customer
            </button>
          ) : null}
          {activeTab === 'assets-equipment' ? (
            <>
              <button type="button" onClick={openCreateAsset} disabled={!customers.length}><Plus size={16} /> Add Asset</button>
              <span className="clients-tool-header-row">
                <button type="button" className="secondary" onClick={() => { setToolEditingId(null); setToolEditSearch(''); setToolForm({ toolId: '', internalToolId: '', partType: 'Hobs', minimumLife: '', measurementUnit: 'in' }); setToolDrawingFiles([]); setToolUploadMessage(null); setToolUpdateMessage(null); setAssetError(''); setToolFormOpen(true); }}><Plus size={16} /> Add Tool ID</button>
                <button type="button" className="secondary" onClick={() => { setToolEditingId(''); setToolEditSearch(''); setToolForm({ toolId: '', internalToolId: '', partType: 'Hobs', minimumLife: '', measurementUnit: 'in' }); setToolDrawingFiles([]); setToolUploadMessage(null); setToolUpdateMessage(null); setAssetError(''); setToolFormOpen(true); }} disabled={!toolDefinitions.length}><Search size={16} /> Edit &amp; Look for Tool ID</button>
              </span>
              <button type="button" className="secondary clients-tool-report-action" onClick={() => setToolMissingReportOpen(true)}><FileText size={16} /> Missing Tool ID Data</button>
            </>
          ) : null}
        </div>
      </div>

      {activeTab === 'customers' ? (
        <div className="clients-app-content">
          {loading ? <div className="clients-feedback">Loading customers...</div> : null}
          {errorMessage ? (
            <div className="clients-feedback error" role="alert">
              <span>{errorMessage}</span>
              <button type="button" onClick={() => void loadCustomers()}>Retry</button>
            </div>
          ) : null}

          {!loading ? (
            <section className="clients-directory">
              <div className="clients-directory-heading">
                <span><Building2 size={16} /> Customer Directory</span>
                <strong>{normalizedCustomerSearch ? `${filteredCustomers.length} of ` : ''}{customers.length} customers · {activeCustomers} active</strong>
              </div>

              <label className="clients-customer-search">
                <Search size={17} aria-hidden="true" />
                <input
                  type="search"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Search by customer, contact, email, phone, tax ID, or address"
                  aria-label="Search customers"
                />
                {customerSearch ? <button type="button" onClick={() => setCustomerSearch('')} aria-label="Clear customer search"><X size={16} /></button> : null}
              </label>

              {filteredCustomers.length ? (
                <div className="clients-card-grid">
                  {filteredCustomers.map((customer) => (
                    <article className={customer.status === 'inactive' ? 'inactive' : ''} key={customer.id}>
                      <div className="clients-customer-card-main">
                        <div className="clients-customer-card-copy">
                          <div className="clients-customer-card-topline">
                            <span>
                              <strong>{customer.customerName}</strong>
                              <em>{customer.legalName}</em>
                            </span>
                            <div className="clients-card-actions">
                              <span className={`clients-status ${customer.status}`}>{customer.status}</span>
                              <button type="button" onClick={() => openEditCustomer(customer)} aria-label={`Edit ${customer.customerName}`}>
                                <Pencil size={14} />
                              </button>
                              <button type="button" onClick={() => setCustomerToDelete(customer)} aria-label={`Delete ${customer.customerName}`}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="clients-customer-contact-lines">
                            <span><b>Contact:</b> {customer.contactName}</span>
                            <span><b>Email:</b> {customer.email}</span>
                            <span><b>Phone:</b> {customer.phone}</span>
                            <span><b>Tax ID:</b> {customer.taxId || 'Not provided'}</span>
                            <span className="wide"><b>Address:</b> {customer.address}</span>
                          </div>
                          <p className="clients-customer-card-notes">
                            <span>Comment:</span>
                            {customer.notes || 'No customer notes yet.'}
                          </p>
                        </div>
                        <aside className="clients-customer-card-media">
                          <div className="clients-customer-avatar" aria-label={`${customer.customerName} initials`}>
                            {customer.customerName.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || 'CU'}
                          </div>
                          <div className="clients-customer-card-metrics">
                            <span><small>Payment terms</small><b>{customer.paymentTerms}</b></span>
                            <span><small>Base lead time</small><b>{customer.leadTimeDays} days</b></span>
                          </div>
                          <button
                            type="button"
                            className="clients-card-balance-link"
                            onClick={() => {
                              sessionStorage.setItem('yvimo:mes:clients:balance-customer', customer.id);
                              onNavigate('/workspace/manufacturing-ops/intelligence/revenue-opportunity/balances');
                            }}
                          >
                            <WalletCards size={15} /> View Balance
                          </button>
                        </aside>
                      </div>
                    </article>
                  ))}
                </div>
              ) : customers.length ? (
                <div className="clients-empty-state">
                  <span><Search size={26} /></span>
                  <strong>No matching customers</strong>
                  <p>Try a different customer name, contact, email, phone, tax ID, or address.</p>
                  <button type="button" onClick={() => setCustomerSearch('')}>Clear Search</button>
                </div>
              ) : (
                <div className="clients-empty-state">
                  <span><Building2 size={26} /></span>
                  <strong>No customers yet</strong>
                  <p>Create the first customer record to begin replacing the customer-based Excel workflow.</p>
                  <button type="button" onClick={openCreateCustomer}><Plus size={16} /> Add New Customer</button>
                </div>
              )}
            </section>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'assets-equipment' ? (
        <div className="clients-app-content clients-assets-content">
          {loading || assetLoading ? <div className="clients-feedback">Loading customer assets...</div> : null}
          {errorMessage || assetError ? (
            <div className="clients-feedback error" role="alert">
              <span>{errorMessage || assetError}</span>
              <button type="button" onClick={() => { void loadCustomers(); void loadAssets(); }}>Retry</button>
            </div>
          ) : null}
          {!loading && !assetLoading ? (
            <>
              <section className="clients-assets-filter-bar" aria-label="Assets and equipment filters">
                <div className="clients-assets-filter-field">
                  <span>Client</span>
                  <CustomerDropdown
                    id="assets-equipment-client"
                    value={assetCustomerFilter}
                    options={customerFilterOptions}
                    onChange={setAssetCustomerFilter}
                  />
                </div>
                <label className="clients-assets-search">
                  <span>Search assets</span>
                  <div><Search size={16} /><input value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder="Serial, part, type, manufacturer" /></div>
                </label>
                <label className="clients-assets-search clients-assets-tool-search">
                  <span>Search Tool IDs</span>
                  <div><Search size={16} /><input value={assetToolIdSearch} onChange={(event) => setAssetToolIdSearch(event.target.value)} placeholder="Tool ID or Internal Tool ID" /></div>
                </label>
                <fieldset className="clients-assets-type-filters">
                  <legend>Part Type</legend>
                  <div>
                    {assetTypeOptions.map((assetType) => {
                      const checked = selectedAssetTypes === null || selectedAssetTypes.has(assetType.key);
                      return (
                        <label key={assetType.key} style={getAssetTypeColors(assetType.label)}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setSelectedAssetTypes((current) => {
                              const next = current ? new Set(current) : new Set(assetTypeOptions.map((option) => option.key));
                              if (next.has(assetType.key)) next.delete(assetType.key);
                              else next.add(assetType.key);
                              return next.size === assetTypeOptions.length ? null : next;
                            })}
                          />
                          <span>{assetType.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </section>

              <section className="clients-assets-kpis" aria-label="Asset summary">
                <div><Package size={18} /><span>Total Assets<strong>{filteredAssets.length}</strong></span></div>
                {assetTypeSummaries.map((assetType) => (
                  <div className="asset-type" style={getAssetTypeColors(assetType.label)} key={assetType.key}>
                    <Package size={18} />
                    <span>{assetType.label}<strong>{assetType.count}</strong></span>
                  </div>
                ))}
              </section>

              {!customers.length ? (
                <div className="clients-empty-state">
                  <span><Building2 size={26} /></span>
                  <strong>Create a client first</strong>
                  <p>Every asset must have an owner before its custody and service history can be recorded.</p>
                </div>
              ) : filteredAssets.length ? (
                <section className="clients-assets-workspace">
                  <div className="clients-assets-registry">
                    <div className="clients-assets-section-heading">
                      <span><Package size={16} /> Asset Registry</span>
                      <strong>{filteredAssets.length} items</strong>
                    </div>
                    <div className="clients-assets-list" role="listbox" aria-label="Customer assets">
                      {filteredAssets.map((asset) => {
                        const customer = customers.find((item) => item.id === asset.customerId);
                        return (
                          <button
                            type="button"
                            className={asset.id === selectedAssetId ? 'selected' : ''}
                            aria-selected={asset.id === selectedAssetId}
                            key={asset.id}
                            onClick={() => setSelectedAssetId(asset.id)}
                          >
                            <span className="clients-asset-list-icon"><Package size={18} /></span>
                            <span className="clients-asset-list-name">
                              <strong className="clients-asset-type-badge" style={getAssetTypeColors(asset.assetType)}>{asset.assetType}</strong>
                              <b>{asset.toolId || 'Not specified'}</b>
                              {asset.internalToolId ? <em className="clients-asset-internal-tool-id">{asset.internalToolId}</em> : null}
                            </span>
                            <span><small>Client</small>{customer?.customerName ?? 'Unknown client'}</span>
                            <span><small>Serial Number</small>{asset.serialNumber}</span>
                            <span><small>Services</small>{asset.serviceCount}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedAsset ? (
                    <article className="clients-asset-detail">
                      <header>
                        <span className="clients-asset-detail-mark"><Package size={23} /></span>
                        <div>
                          <span>{selectedAsset.sourceType === 'production-order' ? 'Generated from Production Order' : 'Manually Registered Asset'}</span>
                          <h3>{selectedAsset.assetType}</h3>
                          <strong>{selectedAsset.serialNumber}</strong>
                        </div>
                        <div className="clients-asset-detail-actions">
                          <em className={`clients-asset-status ${selectedAsset.status}`}>{assetStatusOptions.find((option) => option.value === selectedAsset.status)?.label}</em>
                          <button type="button" onClick={() => openEditAsset(selectedAsset)}><Pencil size={14} /> Edit Asset</button>
                        </div>
                      </header>

                      <div className="clients-asset-identity-grid">
                        <span><small>Owner</small><b>{selectedAssetCustomer?.customerName ?? 'Unknown client'}</b></span>
                        <span><small>Family / Category</small><b>{selectedAsset.familyCategory || 'Not specified'}</b></span>
                        <span><small>Serial Number</small><b>{selectedAsset.serialNumber}</b></span>
                        <span><small>Tool ID</small><b>{selectedAsset.toolId || 'Not specified'}</b></span>
                        <span className="clients-internal-tool-detail"><small>Internal Tool ID</small><b>{selectedAsset.internalToolId || 'Not specified'}</b></span>
                      </div>

                      <div className="clients-asset-lifecycle">
                        <div className={`clients-asset-life-progress ${selectedAssetLifeTone}`}>
                          <span>
                            Estimated Useful Life
                            <strong>{selectedAssetLifePercent === null ? 'Not estimated' : `${Math.round(selectedAssetLifePercent)}%`}</strong>
                          </span>
                          <div className="clients-asset-life-bar"><i style={{ width: `${selectedAssetLifePercent ?? 0}%` }} /></div>
                          <div className="clients-asset-life-metrics">
                            <span className={`remaining-${selectedAssetSharpeningsRemaining === null ? 'unknown' : selectedAssetSharpeningsRemaining === 0 ? 'critical' : selectedAssetSharpeningsRemaining <= 4 ? 'warning' : 'healthy'}`}><small>Remaining Sharpenings</small><b>{selectedAssetSharpeningsRemaining === null ? '—' : `${isSelectedAssetShaver ? '' : '~'}${selectedAssetSharpeningsRemaining}`}</b></span>
                            <span><small>{isSelectedAssetShaver ? 'Current Sharpening' : 'Average Removal'}</small><b>{isSelectedAssetShaver ? (currentShaverSharpeningNumber === null ? '—' : `${currentShaverSharpeningNumber} of ${SHAVER_MAX_SHARPENINGS}`) : (averageMaterialRemoval === null ? '—' : `${averageMaterialRemoval.toFixed(4)} ${selectedAssetTool?.measurementUnit ?? ''}`)}</b></span>
                            <span><small>Minimum Life EOL</small><b>{selectedAssetTool?.minimumLife === null || selectedAssetTool?.minimumLife === undefined ? '—' : `${selectedAssetTool.minimumLife.toFixed(4)} ${selectedAssetTool.measurementUnit}`}</b></span>
                          </div>
                          {selectedAssetSharpeningsRemaining === null ? <p className="clients-asset-life-hint">{isSelectedAssetShaver ? 'Record the current sharpening number to calculate remaining life.' : 'Link a configured Tool ID and compatible measurements.'}</p> : null}
                          {!isSelectedAssetShaver && excludedLifeMeasurementCount > 0 ? <p className="clients-asset-life-hint">{excludedLifeMeasurementCount} service record{excludedLifeMeasurementCount === 1 ? ' was' : 's were'} excluded because the life measurement was not captured.</p> : null}
                          {!isSelectedAssetShaver && selectedAssetSharpeningsRemaining === 1 ? <p className="clients-asset-life-hint clients-asset-life-eol-warning">Next sharpening reaches EOL.</p> : null}
                        </div>
                        <span><small>Last Service</small><b>{formatAssetDate(selectedAsset.lastServiceAt, languageCode)}</b></span>
                        <span><small>Last Inspection</small><b>{formatAssetDate(selectedAsset.lastInspectionAt, languageCode)}</b></span>
                        <span><small>Total Services</small><b>{selectedAsset.serviceCount}</b></span>
                      </div>

                      <div className="clients-asset-notes">
                        <p><b>Description</b>{selectedAsset.description || 'Not specified'}</p>
                      </div>

                      <section className="clients-asset-service-records">
                        <div className="clients-assets-section-heading">
                          <span><History size={16} /> Service &amp; Evidence History</span>
                          <strong>{selectedAssetServices.length} events · {selectedAssetAttachments.length} files</strong>
                        </div>
                        <div className="clients-asset-service-table-wrap">
                          <table>
                            <thead><tr><th>Service</th><th>Date</th><th>Order</th><th>Result / Life</th><th>Performance</th><th>Evidence</th></tr></thead>
                            <tbody>
                              {selectedAssetServices.map((service) => {
                                const serviceAttachments = selectedAssetAttachments.filter((attachment) => attachment.serviceEventId === service.id);
                                const serviceMeasurement = service.productionOrderId
                                  ? assetLifeTraceability.find((record) => record.production_order_id === service.productionOrderId && record.serial_number?.trim().toLowerCase() === selectedAssetSerialKey) ?? null
                                  : null;
                                const measurementUnit = normalizeLifeUnit(serviceMeasurement?.dimensions_unit) || selectedAssetTool?.measurementUnit || '';
                                const formatServiceMeasurement = (value: number | null | undefined) => {
                                  const parsed = Number(value);
                                  return value !== null && value !== undefined && Number.isFinite(parsed) ? `${parsed.toFixed(4)} ${measurementUnit}` : 'N/A';
                                };
                                return (
                                  <React.Fragment key={service.id}>
                                    <tr>
                                      <td><span className="clients-asset-service-name"><Wrench size={17} /><b>Sharpening</b></span></td>
                                      <td><b>{formatAssetDate(service.serviceDate, languageCode)}</b></td>
                                      <td>{service.orderNumber ? <button className="clients-asset-order-link" type="button" onClick={() => void openProductionOrder(service.productionOrderId)}>{service.orderNumber}</button> : <span className="clients-asset-no-evidence">Not linked</span>}</td>
                                      <td><em className={`clients-service-result ${service.result}`}>{service.result}</em>{service.remainingLifePercent !== null ? <small>{service.remainingLifePercent}% life</small> : null}</td>
                                      <td>{service.performancePieces !== null ? <button className="clients-performance-value" type="button" onClick={() => { setPerformanceService(service); setPerformancePiecesDraft(String(service.performancePieces)); setPerformanceError(''); }}><strong>{service.performancePieces.toLocaleString()}</strong><small>pieces</small></button> : <button className="clients-performance-add" type="button" onClick={() => { setPerformanceService(service); setPerformancePiecesDraft(''); setPerformanceError(''); }}><Plus size={14} /> Add</button>}</td>
                                      <td>
                                        {serviceAttachments.length ? <div className="clients-asset-service-files">{serviceAttachments.map((attachment) => (
                                          <button type="button" key={attachment.id} onClick={() => void openAssetAttachment(attachment)}>
                                            {attachment.attachmentType === 'photo' ? <Camera size={15} /> : <FileText size={15} />}
                                            <span>{attachment.fileName}</span><ExternalLink size={13} />
                                          </button>
                                        ))}</div> : <span className="clients-asset-no-evidence">No evidence</span>}
                                      </td>
                                    </tr>
                                    <tr className="clients-asset-service-measurements">
                                      <td colSpan={6}>
                                        <div>
                                          <span><small>Before sharpening</small><b>{formatServiceMeasurement(serviceMeasurement?.before_tooth_length ?? serviceMeasurement?.before_notch)}</b></span>
                                          <span><small>Stock to remove</small><b>{formatServiceMeasurement(serviceMeasurement?.stock_to_remove)}</b></span>
                                          <span><small>After sharpening</small><b>{formatServiceMeasurement(serviceMeasurement?.after_tooth_length)}</b></span>
                                        </div>
                                      </td>
                                    </tr>
                                  </React.Fragment>
                                );
                              })}
                              {selectedAssetAttachments.filter((attachment) => !attachment.serviceEventId).map((attachment) => (
                                <tr className="unlinked-evidence" key={`attachment-${attachment.id}`}>
                                  <td><b>Unlinked evidence</b></td>
                                  <td><b>{formatAssetDate(attachment.createdAt, languageCode)}</b></td>
                                  <td>—</td>
                                  <td>—</td>
                                  <td>—</td>
                                  <td><div className="clients-asset-service-files"><button type="button" onClick={() => void openAssetAttachment(attachment)}>{attachment.attachmentType === 'photo' ? <Camera size={15} /> : <FileText size={15} />}<span>{attachment.fileName}</span><ExternalLink size={13} /></button></div></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {!selectedAssetServices.length && !selectedAssetAttachments.length ? <p className="clients-assets-inline-empty">No service events or evidence recorded yet.</p> : null}
                        </div>
                      </section>
                    </article>
                  ) : null}
                </section>
              ) : (
                <div className="clients-empty-state">
                  <span><Package size={26} /></span>
                  <strong>No assets match this view</strong>
                  <p>Register an existing customer asset manually, or complete a Production Order to generate its manufactured assets automatically.</p>
                  <button type="button" onClick={openCreateAsset}><Plus size={16} /> Add Asset</button>
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'balances' ? (
        <div className="clients-app-content">
          <ClientBalancesWorkspace
            organizationId={organizationId}
            customers={customers.map((customer) => ({
              id: customer.id,
              customerName: customer.customerName,
              legalName: customer.legalName,
              baseCurrency: customer.baseCurrency,
              status: customer.status,
            }))}
            loadingCustomers={loading}
            customerError={errorMessage}
            onRetryCustomers={() => void loadCustomers()}
          />
        </div>
      ) : null}

      {activeTab === 'receptions' ? (
        <div className="clients-app-content">
          <ClientReceptionsWorkspace
            organizationId={organizationId}
            onNavigate={onNavigate}
            languageCode={languageCode}
            customers={customers.map((customer) => ({ id: customer.id, customerName: customer.customerName, status: customer.status }))}
          />
        </div>
      ) : null}

      {assetFormOpen ? (
        <div className="mes-modal-backdrop production-order-form-backdrop clients-asset-form-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}>
          <section className="mes-order-modal clients-asset-modal" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title">
            <button className="supplier-modal-close" type="button" onClick={closeDialog} aria-label="Close dialog" disabled={saving}>
              <X size={18} />
            </button>
            <form className="mes-order-form clients-asset-form" onSubmit={saveAsset}>
              <div className="clients-asset-modal-header mes-order-form-wide">
                <p className="eyebrow">Customer Asset</p>
                <h3 id="asset-dialog-title">{assetEditingId ? 'Edit asset' : 'Register existing asset'}</h3>
                <p>{assetEditingId ? 'Update its custody, condition, and identity without changing its service history.' : 'Add an asset already owned by the client. Future completed Production Orders with this serial will extend its service history.'}</p>
              </div>
              <div className="clients-asset-form-grid mes-order-form-wide">
                <label>
                  Owner Client
                  <CustomerDropdown id="asset-owner-client" value={assetForm.customerId} options={assetCustomerOptions} onChange={(customerId) => setAssetForm((current) => ({ ...current, customerId }))} />
                </label>
                <label>
                  Status
                  <CustomerDropdown id="asset-status" value={assetForm.status} options={assetStatusOptions} onChange={(status) => setAssetForm((current) => ({ ...current, status }))} />
                </label>
                <label>
                  Asset Type
                  <input required value={assetForm.assetType} readOnly={Boolean(assetForm.toolDefinitionId)} onChange={(event) => setAssetForm((current) => ({ ...current, assetType: event.target.value }))} placeholder="Selected from the Tool ID" />
                </label>
                <label className="clients-tool-id-link-field">
                  Tool ID
                  <input autoFocus type="search" value={toolIdSearch} onChange={(event) => setToolIdSearch(event.target.value)} placeholder="Search Tool ID or Internal Tool ID..." />
                  <CustomerDropdown
                    id="asset-tool-id"
                    value={assetForm.toolDefinitionId}
                    options={toolDefinitions.filter((tool) => !toolIdSearch || `${tool.toolId} ${tool.internalToolId} ${tool.partType}`.toLowerCase().includes(toolIdSearch.toLowerCase())).map((tool) => ({ value: tool.id, label: `${tool.toolId}${tool.internalToolId ? ` · Internal ${tool.internalToolId}` : ''} · ${tool.partType}${tool.minimumLife === null && !/shaver/i.test(tool.partType) ? ' · Life not configured' : ''}` }))}
                    placeholder="Select Tool ID"
                    onChange={(toolDefinitionId) => {
                      const tool = toolDefinitions.find((item) => item.id === toolDefinitionId);
                      setAssetForm((current) => ({ ...current, toolDefinitionId, assetType: tool?.partType ?? current.assetType, familyCategory: tool?.partType ?? current.familyCategory }));
                    }}
                  />
                </label>
                <label>
                  Serial Number
                  <input required value={assetForm.serialNumber} onChange={(event) => setAssetForm((current) => ({ ...current, serialNumber: event.target.value }))} />
                </label>
                <label>
                  Part Number <em>Optional</em>
                  <input value={assetForm.partNumber} onChange={(event) => setAssetForm((current) => ({ ...current, partNumber: event.target.value }))} />
                </label>
                <label>
                  Manufacturer <em>Optional</em>
                  <input value={assetForm.manufacturer} onChange={(event) => setAssetForm((current) => ({ ...current, manufacturer: event.target.value }))} />
                </label>
                <label>
                  Family / Category <em>Optional</em>
                  <input value={assetForm.familyCategory} onChange={(event) => setAssetForm((current) => ({ ...current, familyCategory: event.target.value }))} />
                </label>
                <label>
                  Current Location <em>Optional</em>
                  <input value={assetForm.currentLocation} onChange={(event) => setAssetForm((current) => ({ ...current, currentLocation: event.target.value }))} />
                </label>
                <label>
                  Custodian / Responsible <em>Optional</em>
                  <input value={assetForm.custodianName} onChange={(event) => setAssetForm((current) => ({ ...current, custodianName: event.target.value }))} />
                </label>
                <label>
                  Position / Role <em>Optional</em>
                  <input value={assetForm.custodianRole} onChange={(event) => setAssetForm((current) => ({ ...current, custodianRole: event.target.value }))} />
                </label>
                <label>
                  Last Inspection <em>Optional</em>
                  <input type="date" value={assetForm.lastInspectionAt} onChange={(event) => setAssetForm((current) => ({ ...current, lastInspectionAt: event.target.value }))} />
                </label>
                <label className="mes-order-form-wide">
                  Description
                  <textarea required value={assetForm.description} onChange={(event) => setAssetForm((current) => ({ ...current, description: event.target.value }))} placeholder="Identify the asset and its operational purpose." />
                </label>
                <div className="clients-asset-file-field">
                  <div className="clients-asset-file-heading"><span><Camera size={16} /> Photos</span><em>Optional</em></div>
                  <div className="clients-asset-file-control">
                    <input id="asset-photo-files" type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple onChange={(event) => setAssetPhotos(Array.from(event.target.files ?? []))} />
                    <label htmlFor="asset-photo-files"><Plus size={15} /> Select photos</label>
                    <span>{assetPhotos.length ? `${assetPhotos.length} selected` : 'No files selected'}</span>
                  </div>
                  <small>JPG, PNG, WEBP or HEIC</small>
                </div>
                <div className="clients-asset-file-field">
                  <div className="clients-asset-file-heading"><span><FileText size={16} /> Documents</span><em>Optional</em></div>
                  <div className="clients-asset-file-control">
                    <input id="asset-document-files" type="file" accept="application/pdf" multiple onChange={(event) => setAssetDocuments(Array.from(event.target.files ?? []))} />
                    <label htmlFor="asset-document-files"><Plus size={15} /> Select PDFs</label>
                    <span>{assetDocuments.length ? `${assetDocuments.length} selected` : 'No files selected'}</span>
                  </div>
                  <small>PDF files up to 50 MB</small>
                </div>
                <label className="mes-order-form-wide">
                  Internal Notes <em>Optional</em>
                  <textarea value={assetForm.internalNotes} onChange={(event) => setAssetForm((current) => ({ ...current, internalNotes: event.target.value }))} />
                </label>
              </div>
              {assetError ? <div className="clients-modal-error" role="alert">{assetError}</div> : null}
              <div className="mes-order-form-actions">
                <button type="button" onClick={closeDialog} disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving || !assetForm.customerId || !assetForm.toolDefinitionId}>
                  {assetEditingId ? <Pencil size={16} /> : <Plus size={16} />} {saving ? 'Saving...' : assetEditingId ? 'Save Asset' : 'Register Asset'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {toolFormOpen ? (
        <div className="mes-modal-backdrop production-order-form-backdrop clients-asset-form-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <section className="mes-order-modal clients-asset-modal clients-tool-id-modal" role="dialog" aria-modal="true" aria-labelledby="tool-id-dialog-title">
            <button className="supplier-modal-close clients-tool-id-modal-close" type="button" onClick={closeDialog} aria-label="Close dialog" disabled={saving || toolDrawingUploading}><X size={18} /></button>
            <form className="mes-order-form clients-asset-form" onSubmit={saveToolDefinition}>
              <div className="clients-asset-modal-header mes-order-form-wide">
                <p className="eyebrow">Tool Definition</p>
                <h3 id="tool-id-dialog-title">{toolEditingId === null ? 'Add Tool ID' : 'Edit & Look for Tool ID'}</h3>
                <p>{toolEditingId === null ? 'Define the shared dimensional limit and drawings used by every serial linked to this Tool ID.' : 'Find and review an existing Tool ID, update its shared parameters, or manage its drawings.'}</p>
              </div>
              <div className="clients-asset-form-grid mes-order-form-wide">
                {toolEditingId !== null ? (
                  <div className="clients-tool-edit-picker mes-order-form-wide">
                    <label>Search Tool IDs<input type="search" value={toolEditSearch} onChange={(event) => setToolEditSearch(event.target.value)} placeholder="Search Tool ID, Internal Tool ID, or part type..." /></label>
                    <label>Select Tool ID<CustomerDropdown
                      id="edit-tool-id-picker"
                      value={toolEditingId}
                      options={toolDefinitions.filter((tool) => !toolEditSearch || `${tool.toolId} ${tool.internalToolId} ${tool.partType}`.toLowerCase().includes(toolEditSearch.toLowerCase())).map((tool) => ({ value: tool.id, label: `${tool.toolId}${tool.internalToolId ? ` · Internal ${tool.internalToolId}` : ''} · ${tool.partType}${tool.minimumLife === null && !/shaver/i.test(tool.partType) ? ' · Life not configured' : ''}` }))}
                      placeholder="Choose a Tool ID"
                      onChange={(toolId) => {
                        const tool = toolDefinitions.find((item) => item.id === toolId);
                        setToolEditingId(toolId);
                        setToolDocumentRenamingId(null);
                        setToolDocumentRename('');
                        setToolDrawingFiles([]);
                        setToolUploadMessage(null);
                        setToolUpdateMessage(null);
                        if (tool) setToolForm({ toolId: tool.toolId, internalToolId: tool.internalToolId, partType: tool.partType, minimumLife: tool.minimumLife === null ? '' : String(tool.minimumLife), measurementUnit: tool.measurementUnit });
                      }}
                    /></label>
                  </div>
                ) : null}
                <label>Tool ID<input required autoFocus value={toolForm.toolId} onChange={(event) => setToolForm((current) => ({ ...current, toolId: event.target.value }))} placeholder="e.g. 17864-T-4" /></label>
                <label>Internal Tool ID <em>Optional</em><input value={toolForm.internalToolId} onChange={(event) => setToolForm((current) => ({ ...current, internalToolId: event.target.value }))} placeholder="Factory Tool ID" /></label>
                <label>Part Type<CustomerDropdown id="tool-part-type" value={toolForm.partType} options={['Hobs', 'Shaper', 'Shavers', 'Skiving', 'Talladores', 'Other'].map((value) => ({ value, label: value }))} onChange={(partType) => setToolForm((current) => ({ ...current, partType }))} /></label>
                {/shaver/i.test(toolForm.partType) ? (
                  <label>Maximum Sharpenings<input value={SHAVER_MAX_SHARPENINGS} readOnly /><small>Fixed YVIMO standard for Shavers. Remaining life uses the recorded sharpening number.</small></label>
                ) : (
                  <label>Minimum Tool Life <em>Optional</em><input type="number" min="0" step="any" value={toolForm.minimumLife} onChange={(event) => setToolForm((current) => ({ ...current, minimumLife: event.target.value }))} placeholder="Minimum usable dimension" /></label>
                )}
                <label>Measurement Unit<CustomerDropdown id="tool-measurement-unit" value={toolForm.measurementUnit} options={[{ value: 'in', label: 'Inches' }, { value: 'mm', label: 'Millimeters' }]} onChange={(measurementUnit) => setToolForm((current) => ({ ...current, measurementUnit }))} /></label>
                <div
                  className={`clients-asset-file-field clients-tool-drawing-drop mes-order-form-wide${toolDrawingDragActive ? ' drag-active' : ''}`}
                  onDragOver={(event) => { event.preventDefault(); if (!toolDrawingUploading) setToolDrawingDragActive(true); }}
                  onDragLeave={() => setToolDrawingDragActive(false)}
                  onDrop={(event) => { event.preventDefault(); setToolDrawingDragActive(false); if (!toolDrawingUploading) selectToolDrawings(Array.from(event.dataTransfer.files)); }}
                >
                  <div className="clients-asset-file-heading"><span><FileText size={16} /> Drawings</span><em>Optional</em></div>
                  <div className="clients-asset-file-control">
                    <input id="tool-drawing-files" type="file" accept="application/pdf" multiple disabled={toolDrawingUploading} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; selectToolDrawings(files); }} />
                    <label htmlFor="tool-drawing-files"><Plus size={15} /> Select drawings</label>
                    <span>{toolDrawingUploading ? 'Uploading selected drawings...' : toolDrawingFiles.length ? `${toolDrawingFiles.length} selected` : 'Drop PDF drawings here or select files'}</span>
                  </div>
                  <small>PDF drawings · drag and drop supported</small>
                  {toolEditingId || toolDrawingFiles.length ? (
                    <div className="clients-tool-drawing-list">
                      {toolEditingId ? toolDocuments.filter((document) => document.toolDefinitionId === toolEditingId).map((document) => (
                        <div className="clients-tool-drawing-row" key={document.id}>
                          <span className="clients-tool-drawing-icon"><FileText size={16} /></span>
                          {toolDocumentRenamingId === document.id ? (
                            <input
                              autoFocus
                              value={toolDocumentRename}
                              onChange={(event) => setToolDocumentRename(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  void renameToolDocument(document);
                                }
                                if (event.key === 'Escape') {
                                  event.stopPropagation();
                                  setToolDocumentRenamingId(null);
                                  setToolDocumentRename('');
                                }
                              }}
                              aria-label={`Rename ${document.fileName}`}
                            />
                          ) : <b title={document.fileName}>{document.fileName}</b>}
                          <small>Uploaded {formatAssetDate(document.createdAt, languageCode)}</small>
                          <div>
                            <button type="button" title="Preview drawing" aria-label={`Preview ${document.fileName}`} onClick={() => void openToolDocument(document)}><Eye size={15} /></button>
                            {toolDocumentRenamingId === document.id ? (
                              <>
                                <button type="button" title="Save filename" aria-label={`Save filename for ${document.fileName}`} disabled={saving || !toolDocumentRename.trim()} onClick={() => void renameToolDocument(document)}><Check size={15} /></button>
                                <button type="button" title="Cancel rename" aria-label={`Cancel renaming ${document.fileName}`} onClick={() => { setToolDocumentRenamingId(null); setToolDocumentRename(''); }}><X size={15} /></button>
                              </>
                            ) : (
                              <button type="button" title="Rename drawing" aria-label={`Rename ${document.fileName}`} onClick={() => { setToolDocumentRenamingId(document.id); setToolDocumentRename(document.fileName); }}><Pencil size={15} /></button>
                            )}
                            <button className="danger" type="button" title="Delete drawing" aria-label={`Delete ${document.fileName}`} onClick={() => setToolDocumentDeleteCandidate(document)}><Trash2 size={15} /></button>
                          </div>
                        </div>
                      )) : null}
                      {toolDrawingFiles.map((file, index) => (
                        <div className="clients-tool-drawing-row pending" key={`${file.name}:${file.lastModified}:${index}`}>
                          <span className="clients-tool-drawing-icon"><FileText size={16} /></span>
                          <b title={file.name}>{file.name}</b>
                          <small>Ready to upload</small>
                          <div><button className="danger" type="button" title="Remove pending drawing" aria-label={`Remove ${file.name}`} onClick={() => setToolDrawingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}><Trash2 size={15} /></button></div>
                        </div>
                      ))}
                      {toolEditingId && !toolDocuments.some((document) => document.toolDefinitionId === toolEditingId) && !toolDrawingFiles.length
                        ? <p className="clients-tool-drawing-empty">No drawings uploaded for this Tool ID.</p>
                        : null}
                    </div>
                  ) : null}
                  {toolUploadMessage ? (
                    <div className={`quality-document-message ${toolUploadMessage.type}`} role="status">
                      {toolUploadMessage.text}
                    </div>
                  ) : null}
                </div>
              </div>
              {assetError ? <div className="clients-modal-error" role="alert">{assetError}</div> : null}
              {toolUpdateMessage ? <div className={`quality-document-message ${toolUpdateMessage.type}`} role="status">{toolUpdateMessage.text}</div> : null}
              <div className="mes-order-form-actions"><button type="button" onClick={closeDialog} disabled={saving || toolDrawingUploading}>Cancel</button><button type="submit" disabled={saving || toolDrawingUploading || toolEditingId === ''}>{toolEditingId === null ? <Plus size={16} /> : <Pencil size={16} />} {saving ? 'Saving...' : toolEditingId === null ? 'Save Tool ID' : 'Update Tool ID'}</button></div>
            </form>
          </section>
        </div>
      ) : null}

      {toolMissingReportOpen ? (
        <div className="mes-modal-backdrop clients-tool-report-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setToolMissingReportOpen(false); }}>
          <section className="clients-tool-report-modal" role="dialog" aria-modal="true" aria-labelledby="missing-tool-report-title">
            <header>
              <span className="clients-tool-report-icon"><FileText size={23} /></span>
              <div><small>Asset Registry</small><h3 id="missing-tool-report-title">Missing Tool ID Data</h3><p>Generated {new Date().toLocaleString('en-US')}</p></div>
              <button className="clients-tool-report-download" type="button" disabled={toolMissingReportDownloading} onClick={() => void downloadMissingToolDataReport()}><Download size={17} /> {toolMissingReportDownloading ? 'Generating PDF' : 'Download PDF'}</button>
              <button className="supplier-modal-close" type="button" onClick={() => setToolMissingReportOpen(false)} aria-label="Close report"><X size={18} /></button>
            </header>
            <div className="clients-tool-report-kpis">
              <article className="total"><small>Total Missing</small><strong>{incompleteToolDefinitions.length}</strong><span>Tool IDs</span></article>
              <article className="clients"><small>Clients Affected</small><strong>{incompleteToolClientGroups.filter((group) => group.customerId !== 'unassigned').length}</strong><span>with incomplete Tool IDs</span></article>
              {incompleteToolTypeSummaries.map((summary) => <article style={getAssetTypeColors(summary.partType)} key={summary.partType}><small>{summary.partType}</small><strong>{summary.count}</strong><span>missing definitions</span></article>)}
            </div>
            <section className="clients-tool-report-table-panel">
              <div className="clients-assets-section-heading"><span><FileText size={16} /> Tool IDs Requiring Data</span><strong>{incompleteToolDefinitions.length} items</strong></div>
              <div className="clients-tool-report-table-scroll">
                <table>
                  <thead><tr><th>Tool ID</th><th className="clients-tool-report-internal-id">Internal Tool ID</th><th>Part Type</th><th>Missing Data</th><th>Unit</th><th>Linked Serials</th></tr></thead>
                  <tbody>{incompleteToolClientGroups.map((group) => <React.Fragment key={group.customerId}>
                    <tr className="clients-tool-report-client-row"><td colSpan={6}><span>{group.customerName}</span><b>{group.tools.length} Tool IDs</b></td></tr>
                    {group.tools.map((tool) => {
                      const missing = [!/shaver/i.test(tool.partType) && tool.minimumLife === null ? 'Minimum life' : '', !tool.partType.trim() ? 'Part type' : '', !tool.measurementUnit ? 'Measurement unit' : ''].filter(Boolean);
                      const linkedSerials = assets.filter((asset) => asset.toolDefinitionId === tool.id && (group.customerId === 'unassigned' || asset.customerId === group.customerId)).length;
                      return <tr key={`${group.customerId}:${tool.id}`}><td><b>{tool.toolId}</b></td><td className="clients-tool-report-internal-id"><b>{tool.internalToolId || 'Not specified'}</b></td><td><span className="clients-asset-type-badge" style={getAssetTypeColors(tool.partType)}>{tool.partType || 'Not specified'}</span></td><td>{missing.map((item) => <em key={item}>{item}</em>)}</td><td>{tool.measurementUnit || '—'}</td><td>{linkedSerials}</td></tr>;
                    })}
                  </React.Fragment>)}</tbody>
                </table>
                {!incompleteToolDefinitions.length ? <div className="clients-tool-report-empty"><Check size={22} /><strong>All Tool IDs are configured</strong><span>No missing dimensional data was found.</span></div> : null}
              </div>
            </section>
          </section>
        </div>
      ) : null}

      {performanceService && selectedAsset ? (
        <div className="mes-modal-backdrop clients-performance-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !performanceSaving) setPerformanceService(null); }}>
          <section className="clients-performance-modal" role="dialog" aria-modal="true" aria-labelledby="service-performance-title">
            <button className="supplier-modal-close" type="button" onClick={() => setPerformanceService(null)} aria-label="Close"><X size={17} /></button>
            <p className="eyebrow">SERVICE PERFORMANCE</p><h3 id="service-performance-title">Produced pieces</h3>
            <p>Record the tool life achieved after this sharpening cycle.</p>
            <dl><div><dt>Serial Number</dt><dd>{selectedAsset.serialNumber}</dd></div><div><dt>Tool ID</dt><dd>{selectedAsset.toolId || selectedAssetTool?.toolId || 'Not linked'}</dd></div><div><dt>Service date</dt><dd>{formatAssetDate(performanceService.serviceDate, languageCode)}</dd></div></dl>
            <form onSubmit={(event) => void saveServicePerformance(event)}><label><span>Performance</span><div><input autoFocus type="number" min="0" step="1" value={performancePiecesDraft} onChange={(event) => setPerformancePiecesDraft(event.target.value)} placeholder="0" /><small>pieces</small></div></label>{performanceError ? <span className="clients-modal-error">{performanceError}</span> : null}<footer><button type="button" onClick={() => setPerformanceService(null)} disabled={performanceSaving}>Cancel</button><button type="submit" disabled={performanceSaving}>{performanceSaving ? 'Saving…' : performanceService.performancePieces === null ? 'Add performance' : 'Update performance'}</button></footer></form>
          </section>
        </div>
      ) : null}

      {toolDocumentDeleteCandidate ? (
        <div className="mes-modal-backdrop clients-tool-drawing-confirm-backdrop" role="presentation">
          <section className="mes-confirm-modal danger" role="dialog" aria-modal="true" aria-labelledby="delete-tool-drawing-title">
            <div className="mes-confirm-mark" aria-hidden="true"><Trash2 size={23} /></div>
            <div>
              <p className="eyebrow">Tool Drawing</p>
              <h3 id="delete-tool-drawing-title">Delete Tool ID drawing?</h3>
              <p><strong>{toolDocumentDeleteCandidate.fileName}</strong> will be permanently removed from this Tool ID and storage.</p>
            </div>
            <div className="mes-confirm-actions">
              <button type="button" disabled={saving} onClick={() => setToolDocumentDeleteCandidate(null)}>Cancel</button>
              <button className="danger" type="button" disabled={saving} onClick={() => void deleteToolDocument()}>{saving ? 'Deleting...' : 'Delete drawing'}</button>
            </div>
          </section>
        </div>
      ) : null}

      {assetAttachmentPreview ? (
        <div className="supplier-modal-backdrop clients-asset-evidence-preview-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAssetAttachmentPreview(null);
        }}>
          <div className="supplier-modal production-order-preview-modal clients-asset-evidence-preview" role="dialog" aria-modal="true" aria-labelledby="asset-evidence-preview-title">
            <button className="supplier-modal-close" type="button" onClick={() => setAssetAttachmentPreview(null)} aria-label="Close evidence preview"><X size={18} /></button>
            <div>
              <div className="supplier-modal-header">
                <span>{assetAttachmentPreview.category ?? 'Asset Evidence'}</span>
                <strong id="asset-evidence-preview-title">{assetAttachmentPreview.fileName}</strong>
              </div>
              <div
                className={`supplier-document-preview production-order-preview-frame ${assetAttachmentPreview.isPdf ? 'pdf' : `image${assetPreviewZoom > 1 ? ' zoomed' : ''}`}`}
                onWheel={!assetAttachmentPreview.isPdf ? (event) => { event.preventDefault(); changeAssetPreviewZoom(assetPreviewZoom + (event.deltaY < 0 ? .25 : -.25)); } : undefined}
                onPointerDown={!assetAttachmentPreview.isPdf && assetPreviewZoom > 1 ? (event) => { if ((event.target as HTMLElement).closest('.production-order-preview-controls')) return; event.currentTarget.setPointerCapture(event.pointerId); assetPreviewDragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: assetPreviewPosition.x, originY: assetPreviewPosition.y }; } : undefined}
                onPointerMove={!assetAttachmentPreview.isPdf ? (event) => { const drag = assetPreviewDragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; setAssetPreviewPosition({ x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y }); } : undefined}
                onPointerUp={!assetAttachmentPreview.isPdf ? (event) => { if (assetPreviewDragRef.current?.pointerId === event.pointerId) assetPreviewDragRef.current = null; } : undefined}
                onPointerCancel={!assetAttachmentPreview.isPdf ? () => { assetPreviewDragRef.current = null; } : undefined}
                onDoubleClick={!assetAttachmentPreview.isPdf ? (event) => { if ((event.target as HTMLElement).closest('.production-order-preview-controls')) return; changeAssetPreviewZoom(assetPreviewZoom > 1 ? 1 : 2); } : undefined}
              >
                {assetAttachmentPreview.isPdf
                  ? <iframe src={`${assetAttachmentPreview.url}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`} title={`Preview ${assetAttachmentPreview.fileName}`} />
                  : <><img src={assetAttachmentPreview.url} alt={assetAttachmentPreview.fileName} draggable={false} style={{ transform: `translate3d(${assetPreviewPosition.x}px, ${assetPreviewPosition.y}px, 0) scale(${assetPreviewZoom})` }} /><div className="production-order-preview-controls" aria-label="Image controls" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}><button type="button" onClick={() => changeAssetPreviewZoom(assetPreviewZoom - .25)} disabled={assetPreviewZoom <= 1} aria-label="Zoom out"><ZoomOut size={18} /></button><output aria-label="Current zoom">{Math.round(assetPreviewZoom * 100)}%</output><button type="button" onClick={() => changeAssetPreviewZoom(assetPreviewZoom + .25)} disabled={assetPreviewZoom >= 5} aria-label="Zoom in"><ZoomIn size={18} /></button><button type="button" onClick={() => changeAssetPreviewZoom(1)} disabled={assetPreviewZoom === 1 && assetPreviewPosition.x === 0 && assetPreviewPosition.y === 0} aria-label="Reset image"><RotateCcw size={17} /></button></div>{assetPreviewZoom > 1 ? <span className="production-order-preview-pan-hint"><Move size={14} /> Drag to pan</span> : null}</>}
              </div>
              <div className="supplier-modal-actions"><button type="button" onClick={() => setAssetAttachmentPreview(null)}>Close</button></div>
            </div>
          </div>
        </div>
      ) : null}

      {formMode ? (
        <div className="supplier-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}>
          <div className="supplier-modal clients-customer-modal" role="dialog" aria-modal="true" aria-labelledby="customer-dialog-title">
            <button className="supplier-modal-close" type="button" onClick={closeDialog} aria-label="Close dialog" disabled={saving}>
              <X size={18} />
            </button>
            <form onSubmit={saveCustomer}>
              <div className="supplier-modal-header">
                <span>Customer</span>
                <strong id="customer-dialog-title">{formMode === 'edit' ? 'Edit Customer' : 'Add New Customer'}</strong>
              </div>
              <div className="supplier-form-grid">
                <label>
                  Customer Name
                  <input
                    required
                    autoFocus
                    value={customerForm.customerName}
                    onChange={(event) => {
                      const customerName = event.target.value;
                      setCustomerForm((current) => ({
                        ...current,
                        customerName,
                        legalName: sameLegalName ? customerName : current.legalName,
                        contactName: sameContactName ? customerName : current.contactName,
                      }));
                    }}
                  />
                </label>
                <label>
                  Status
                  <CustomerDropdown id="customer-status" value={customerForm.status} options={customerStatusOptions} onChange={(status) => setCustomerForm((current) => ({ ...current, status }))} />
                </label>
                <div className="clients-form-field supplier-form-wide">
                  <span>Legal / Billing Name</span>
                  <input required disabled={sameLegalName} value={customerForm.legalName} onChange={(event) => setCustomerForm((current) => ({ ...current, legalName: event.target.value }))} />
                  <label className="customer-copy-checkbox">
                    <input
                      type="checkbox"
                      checked={sameLegalName}
                      onChange={(event) => {
                        setSameLegalName(event.target.checked);
                        if (event.target.checked) setCustomerForm((current) => ({ ...current, legalName: current.customerName }));
                      }}
                    />
                    <span><Check size={12} /></span>
                    Same as Customer Name
                  </label>
                </div>
                <label>
                  RFC / Tax ID <em>Optional</em>
                  <input value={customerForm.taxId} onChange={(event) => setCustomerForm((current) => ({ ...current, taxId: event.target.value }))} />
                </label>
                <label>
                  Payment Terms
                  <CustomerDropdown
                    id="customer-payment-terms"
                    value={paymentTermsMode}
                    options={paymentTermsOptions}
                    onChange={(paymentTerms) => {
                      setPaymentTermsMode(paymentTerms);
                      setCustomerForm((current) => ({
                        ...current,
                        paymentTerms: paymentTerms === 'Custom' ? '' : paymentTerms,
                      }));
                    }}
                  />
                  {paymentTermsMode === 'Custom' ? (
                    <input
                      className="customer-custom-payment-terms"
                      required
                      value={customerForm.paymentTerms}
                      onChange={(event) => setCustomerForm((current) => ({ ...current, paymentTerms: event.target.value }))}
                      placeholder="Enter custom terms"
                    />
                  ) : null}
                </label>
                <label>
                  Base Lead Time <em>Days</em>
                  <input
                    required
                    type="number"
                    min="0"
                    max="3650"
                    step="1"
                    value={customerForm.leadTimeDays}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, leadTimeDays: event.target.value }))}
                  />
                  <small className="customer-base-currency-note">Defaults to 15 days and follows the organization day-count setting.</small>
                </label>
                <label>
                  Base Currency
                  {formMode === 'create' ? (
                    <CustomerDropdown
                      id="customer-base-currency"
                      value={customerForm.baseCurrency}
                      options={currencyOptions}
                      onChange={(baseCurrency) => setCustomerForm((current) => ({ ...current, baseCurrency }))}
                    />
                  ) : (
                    <input value={customerForm.baseCurrency} disabled aria-label="Base currency cannot be changed" />
                  )}
                  <small className="customer-base-currency-note">Official account currency; fixed after customer creation.</small>
                </label>
                <div className="clients-form-field">
                  <span>Contact Name</span>
                  <input required disabled={sameContactName} value={customerForm.contactName} onChange={(event) => setCustomerForm((current) => ({ ...current, contactName: event.target.value }))} />
                  <label className="customer-copy-checkbox">
                    <input
                      type="checkbox"
                      checked={sameContactName}
                      onChange={(event) => {
                        setSameContactName(event.target.checked);
                        if (event.target.checked) setCustomerForm((current) => ({ ...current, contactName: current.customerName }));
                      }}
                    />
                    <span><Check size={12} /></span>
                    Same as Customer Name
                  </label>
                </div>
                <label>
                  Email
                  <input required type="email" value={customerForm.email} onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))} />
                </label>
                <label>
                  Phone
                  <input required type="tel" value={customerForm.phone} onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))} />
                </label>
                <label className="supplier-form-wide work-center-address-field">
                  Address
                  <div className="address-lookup-control" ref={addressLookupControlRef}>
                    <input
                      required
                      value={customerForm.address}
                      onChange={(event) => {
                        setCustomerForm((current) => ({ ...current, address: event.target.value }));
                        setAddressLookup({ status: 'idle', message: '' });
                        setShowAddressSuggestions(true);
                      }}
                      onFocus={() => setShowAddressSuggestions(addressSuggestions.length > 0)}
                      placeholder="Street, city, state, country"
                    />
                    <button type="button" onClick={() => void lookupCustomerAddress()} disabled={addressLookup.status === 'loading'}>
                      {addressLookup.status === 'loading' ? 'Searching...' : 'Find address'}
                    </button>
                  </div>
                  {addressLookup.message ? <small className={`address-lookup-message ${addressLookup.status}`}>{addressLookup.message}</small> : null}
                </label>
              </div>
              <label>
                Notes
                <textarea value={customerForm.notes} onChange={(event) => setCustomerForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              {errorMessage ? <div className="clients-modal-error" role="alert">{errorMessage}</div> : null}
              <div className="supplier-modal-actions">
                <button type="button" onClick={closeDialog} disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving}>
                  {formMode === 'edit' ? <Pencil size={16} /> : <Plus size={16} />}
                  {saving ? 'Saving...' : formMode === 'edit' ? 'Save Customer' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {customerToDelete ? (
        <div className="supplier-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}>
          <div className="supplier-modal clients-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-customer-title">
            <button className="supplier-modal-close" type="button" onClick={closeDialog} aria-label="Close dialog" disabled={saving}>
              <X size={18} />
            </button>
            <div>
              <div className="supplier-modal-header">
                <span>Customer</span>
                <strong id="delete-customer-title">Delete Customer</strong>
              </div>
              <p>Delete <strong>{customerToDelete.customerName}</strong>? This action cannot be undone.</p>
              {errorMessage ? <div className="clients-modal-error" role="alert">{errorMessage}</div> : null}
              <div className="supplier-modal-actions">
                <button type="button" onClick={closeDialog} disabled={saving}>Cancel</button>
                <button className="supplier-confirm-delete-button" type="button" onClick={() => void deleteCustomer()} disabled={saving}>
                  <Trash2 size={16} /> {saving ? 'Deleting...' : 'Delete Customer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {assetOrderDetails ? (
        <ProductionOrderDetailsModal
          order={assetOrderDetails.order}
          details={assetOrderDetails.details}
          organizationId={organizationId}
          onNavigate={onNavigate}
          onPieceReleased={loadAssets}
          onClose={() => setAssetOrderDetails(null)}
        />
      ) : null}
    </section>
  ), languageCode);
}
