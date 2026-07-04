import React from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Building2,
  Camera,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileText,
  History,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  WalletCards,
  Wrench,
  X,
} from 'lucide-react';
import {
  resolveGooglePlacesAddressMatch,
  searchGooglePlacesAddressMatches,
  type GooglePlacesAddressMatch,
} from '../lib/maps/googlePlacesAddressLookup';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../lib/exchangeRates';
import { supabase } from '../lib/supabaseClient';
import { ClientBalancesWorkspace } from './ClientBalancesWorkspace';

export type ClientsContextTab =
  | 'customers'
  | 'assets-equipment'
  | 'deliveries-returns'
  | 'balances'
  | 'docs-vouchers';

type CustomerStatus = 'active' | 'inactive';
type AssetStatus = 'available' | 'in-custody' | 'in-service' | 'awaiting-return' | 'delivered' | 'maintenance' | 'inspection' | 'retired';
type PaymentTermsMode = 'Net 30' | 'Net 60' | '50/50' | 'Immediate' | 'Custom';

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
  result: 'completed' | 'ok' | 'approach' | 'nok' | 'scrap';
  serviceDate: string;
  remainingLifePercent: number | null;
  notes: string;
  orderNumber: string;
};

type CustomerAssetAttachment = {
  id: string;
  assetId: string;
  attachmentType: 'photo' | 'document';
  storageBucket: string;
  fileName: string;
  filePath: string;
  fileType: string;
  createdAt: string;
};

type CustomerAssetFormState = {
  customerId: string;
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
  estimatedLifePercent: string;
  lastInspectionAt: string;
  internalNotes: string;
};

type CustomerOperationsWorkspaceProps = {
  onNavigate: (path: string) => void;
  activeTab: ClientsContextTab;
  organizationId: string;
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
  baseCurrency: 'MXN',
  notes: '',
  status: 'active',
};

const emptyCustomerAssetForm: CustomerAssetFormState = {
  customerId: '',
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
  estimatedLifePercent: '',
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
  attachment_type: 'photo' | 'document';
  storage_bucket: string;
  file_name: string;
  file_path: string;
  file_type: string;
  created_at: string;
};

function formatAssetDate(value: string | null) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value));
}

function mapAssetRow(row: CustomerAssetRow): CustomerAssetRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    sourceType: row.source_type,
    sourceProductionOrderId: row.source_production_order_id,
    lastProductionOrderId: row.last_production_order_id,
    assetType: row.asset_type,
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
    lastInspectionAt: row.last_inspection_at,
    lastServiceAt: row.last_service_at,
    serviceCount: row.service_count,
    internalNotes: row.internal_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function CustomerOperationsWorkspace({ onNavigate, activeTab, organizationId }: CustomerOperationsWorkspaceProps) {
  const page = clientsPageContent[activeTab];
  const [customers, setCustomers] = React.useState<CustomerRecord[]>([]);
  const [assetCustomerFilter, setAssetCustomerFilter] = React.useState('all');
  const [assetSearch, setAssetSearch] = React.useState('');
  const [assets, setAssets] = React.useState<CustomerAssetRecord[]>([]);
  const [assetServices, setAssetServices] = React.useState<CustomerAssetService[]>([]);
  const [assetAttachments, setAssetAttachments] = React.useState<CustomerAssetAttachment[]>([]);
  const [selectedAssetId, setSelectedAssetId] = React.useState<string | null>(null);
  const [assetLoading, setAssetLoading] = React.useState(false);
  const [assetError, setAssetError] = React.useState('');
  const [assetFormOpen, setAssetFormOpen] = React.useState(false);
  const [assetEditingId, setAssetEditingId] = React.useState<string | null>(null);
  const [assetForm, setAssetForm] = React.useState<CustomerAssetFormState>(emptyCustomerAssetForm);
  const [assetPhotos, setAssetPhotos] = React.useState<File[]>([]);
  const [assetDocuments, setAssetDocuments] = React.useState<File[]>([]);
  const [loading, setLoading] = React.useState(activeTab === 'customers' || activeTab === 'assets-equipment' || activeTab === 'balances');
  const [saving, setSaving] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [formMode, setFormMode] = React.useState<'create' | 'edit' | null>(null);
  const [customerToDelete, setCustomerToDelete] = React.useState<CustomerRecord | null>(null);
  const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerRecord | null>(null);
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

    const [assetResponse, serviceResponse, attachmentResponse] = await Promise.all([
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
    ]);

    const firstError = assetResponse.error || serviceResponse.error || attachmentResponse.error;
    if (firstError) {
      setAssetError(firstError.message);
      setAssets([]);
      setAssetServices([]);
      setAssetAttachments([]);
    } else {
      const nextAssets = ((assetResponse.data ?? []) as CustomerAssetRow[]).map(mapAssetRow);
      setAssets(nextAssets);
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
        };
      }));
      setAssetAttachments(((attachmentResponse.data ?? []) as CustomerAssetAttachmentRow[]).map((row) => ({
        id: row.id,
        assetId: row.asset_id,
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
    if (activeTab === 'customers' || activeTab === 'assets-equipment' || activeTab === 'balances') void loadCustomers();
  }, [activeTab, loadCustomers]);

  React.useEffect(() => {
    if (activeTab === 'assets-equipment') void loadAssets();
  }, [activeTab, loadAssets]);

  React.useEffect(() => {
    if (!formMode && !customerToDelete && !assetFormOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving) return;
      setFormMode(null);
      setCustomerToDelete(null);
      setAssetFormOpen(false);
      setAssetEditingId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [formMode, customerToDelete, assetFormOpen, saving]);

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
    setAssetPhotos([]);
    setAssetDocuments([]);
    setAssetError('');
    setAssetFormOpen(true);
  };

  const openEditAsset = (asset: CustomerAssetRecord) => {
    setAssetEditingId(asset.id);
    setAssetForm({
      customerId: asset.customerId,
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
      estimatedLifePercent: asset.estimatedLifePercent === null ? '' : String(asset.estimatedLifePercent),
      lastInspectionAt: asset.lastInspectionAt?.slice(0, 10) ?? '',
      internalNotes: asset.internalNotes,
    });
    setAssetPhotos([]);
    setAssetDocuments([]);
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

  const saveAsset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || saving || !assetForm.customerId) return;
    setSaving(true);
    setAssetError('');

    const lifePercent = assetForm.estimatedLifePercent.trim() === ''
      ? null
      : Number(assetForm.estimatedLifePercent);
    const assetPayload = {
      organization_id: organizationId,
      customer_id: assetForm.customerId,
      asset_type: assetForm.assetType.trim(),
      serial_number: assetForm.serialNumber.trim(),
      part_number: assetForm.partNumber.trim() || null,
      description: assetForm.description.trim(),
      manufacturer: assetForm.manufacturer.trim() || null,
      family_category: assetForm.familyCategory.trim() || null,
      current_location: assetForm.currentLocation.trim() || null,
      custodian_name: assetForm.custodianName.trim() || null,
      custodian_role: assetForm.custodianRole.trim() || null,
      status: assetForm.status,
      estimated_life_percent: lifePercent,
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
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
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

  const filteredAssets = React.useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    return assets.filter((asset) => {
      if (assetCustomerFilter !== 'all' && asset.customerId !== assetCustomerFilter) return false;
      if (!query) return true;
      const customer = customers.find((item) => item.id === asset.customerId);
      return [asset.serialNumber, asset.partNumber, asset.assetType, asset.description, asset.manufacturer, customer?.customerName]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [assetCustomerFilter, assetSearch, assets, customers]);

  React.useEffect(() => {
    if (selectedAssetId && filteredAssets.some((asset) => asset.id === selectedAssetId)) return;
    setSelectedAssetId(filteredAssets[0]?.id ?? null);
  }, [filteredAssets, selectedAssetId]);

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
  const assetsInCustody = filteredAssets.filter((asset) => ['in-custody', 'in-service', 'maintenance', 'inspection'].includes(asset.status)).length;
  const assetsWithLowLife = filteredAssets.filter((asset) => asset.estimatedLifePercent !== null && asset.estimatedLifePercent <= 35).length;

  const activeCustomers = customers.filter((customer) => customer.status === 'active').length;
  const addressSuggestionMenu = (showAddressSuggestions || addressSuggestionsLoading)
    && (addressSuggestions.length > 0 || addressSuggestionsLoading)
    && addressSuggestionPosition
    ? createPortal(
      <div
        className="address-suggestion-menu customer-address-suggestion-menu"
        role="listbox"
        aria-label="Customer address suggestions"
        ref={addressSuggestionMenuRef}
        style={addressSuggestionPosition}
      >
        {addressSuggestionsLoading ? <span className="address-suggestion-loading">Searching locations...</span> : null}
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

  return (
    <section className="mes-workspace-panel clients-operations-workspace">
      {addressSuggestionMenu}
      <div className={`mes-screen-header${activeTab === 'balances' ? ' client-balances-screen-header' : ''}`}>
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes')}>
          <ArrowLeft size={17} />
          MES Applications
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
            <button type="button" onClick={openCreateAsset} disabled={!customers.length}>
              <Plus size={16} />
              Add Asset
            </button>
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
                <strong>{customers.length} customers · {activeCustomers} active</strong>
              </div>

              {customers.length ? (
                <div className="clients-card-grid">
                  {customers.map((customer) => (
                    <article className={customer.status === 'inactive' ? 'inactive' : ''} key={customer.id}>
                      <div className="clients-card-topline">
                        <div>
                          <span className="clients-customer-mark"><Building2 size={19} /></span>
                          <span>
                            <strong>{customer.customerName}</strong>
                            <em>{customer.legalName}</em>
                          </span>
                        </div>
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
                      <div className="clients-card-details">
                        <span><UserRound size={14} /><b>Contact</b>{customer.contactName}</span>
                        <span><Mail size={14} /><b>Email</b>{customer.email}</span>
                        <span><Phone size={14} /><b>Phone</b>{customer.phone}</span>
                        <span><FileText size={14} /><b>Tax ID</b>{customer.taxId || 'Not provided'}</span>
                        <span><MapPin size={14} /><b>Address</b>{customer.address}</span>
                      </div>
                      <div className="clients-card-footer">
                        <span><b>Payment terms</b>{customer.paymentTerms}</span>
                        <p><b>Notes</b>{customer.notes || 'No customer notes yet.'}</p>
                        <button
                          type="button"
                          className="clients-card-balance-link"
                          onClick={() => {
                            sessionStorage.setItem('yvimo:mes:clients:balance-customer', customer.id);
                            onNavigate('/workspace/manufacturing-ops/mes/clients/balances');
                          }}
                        >
                          <WalletCards size={15} /> View Balance
                        </button>
                      </div>
                    </article>
                  ))}
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
              </section>

              <section className="clients-assets-kpis" aria-label="Asset summary">
                <div><Package size={18} /><span>Total Assets<strong>{filteredAssets.length}</strong></span></div>
                <div><Building2 size={18} /><span>Clients Represented<strong>{new Set(filteredAssets.map((asset) => asset.customerId)).size}</strong></span></div>
                <div><MapPin size={18} /><span>In YVIMO Custody<strong>{assetsInCustody}</strong></span></div>
                <div className={assetsWithLowLife ? 'warning' : ''}><Clock3 size={18} /><span>Low Estimated Life<strong>{assetsWithLowLife}</strong></span></div>
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
                              <strong>{asset.assetType}</strong>
                              <b>{asset.serialNumber}</b>
                            </span>
                            <span><small>Client</small>{customer?.customerName ?? 'Unknown client'}</span>
                            <span><small>Part Number</small>{asset.partNumber || 'Not specified'}</span>
                            <span><small>Services</small>{asset.serviceCount}</span>
                            <em className={`clients-asset-status ${asset.status}`}>{assetStatusOptions.find((option) => option.value === asset.status)?.label}</em>
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
                        <span><small>Part Number</small><b>{selectedAsset.partNumber || 'Not specified'}</b></span>
                        <span><small>Manufacturer</small><b>{selectedAsset.manufacturer || 'Not specified'}</b></span>
                        <span><small>Family / Category</small><b>{selectedAsset.familyCategory || 'Not specified'}</b></span>
                        <span><small>Current Location</small><b>{selectedAsset.currentLocation || 'Not recorded'}</b></span>
                        <span><small>Responsible / Role</small><b>{selectedAsset.custodianName || 'Unassigned'}{selectedAsset.custodianRole ? ` · ${selectedAsset.custodianRole}` : ''}</b></span>
                      </div>

                      <div className="clients-asset-lifecycle">
                        <div>
                          <span>Estimated Useful Life<strong>{selectedAsset.estimatedLifePercent === null ? 'Not estimated' : `${selectedAsset.estimatedLifePercent}%`}</strong></span>
                          <div><i style={{ width: `${selectedAsset.estimatedLifePercent ?? 0}%` }} /></div>
                        </div>
                        <span><small>Last Service</small><b>{formatAssetDate(selectedAsset.lastServiceAt)}</b></span>
                        <span><small>Last Inspection</small><b>{formatAssetDate(selectedAsset.lastInspectionAt)}</b></span>
                        <span><small>Total Services</small><b>{selectedAsset.serviceCount}</b></span>
                      </div>

                      {selectedAsset.description || selectedAsset.internalNotes ? (
                        <div className="clients-asset-notes">
                          {selectedAsset.description ? <p><b>Description</b>{selectedAsset.description}</p> : null}
                          {selectedAsset.internalNotes ? <p><b>Internal Notes</b>{selectedAsset.internalNotes}</p> : null}
                        </div>
                      ) : null}

                      <div className="clients-asset-detail-columns">
                        <section className="clients-asset-evidence">
                          <div className="clients-assets-section-heading"><span><FileText size={16} /> Evidence</span><strong>{selectedAssetAttachments.length} files</strong></div>
                          {selectedAssetAttachments.length ? selectedAssetAttachments.map((attachment) => (
                            <button type="button" key={attachment.id} onClick={() => void openAssetAttachment(attachment)}>
                              <span>{attachment.attachmentType === 'photo' ? <Camera size={17} /> : <FileText size={17} />}</span>
                              <b>{attachment.fileName}</b>
                              <small>{formatAssetDate(attachment.createdAt)}</small>
                              <ExternalLink size={15} />
                            </button>
                          )) : <p className="clients-assets-inline-empty">No photos or documents attached.</p>}
                        </section>

                        <section className="clients-asset-history">
                          <div className="clients-assets-section-heading"><span><History size={16} /> Service History</span><strong>{selectedAssetServices.length} events</strong></div>
                          {selectedAssetServices.length ? (
                            <div className="clients-asset-timeline">
                              {selectedAssetServices.map((service) => (
                                <article key={service.id}>
                                  <span><Wrench size={15} /></span>
                                  <div>
                                    <strong>{service.serviceType}</strong>
                                    <small>{formatAssetDate(service.serviceDate)}{service.orderNumber ? ` · ${service.orderNumber}` : ''}</small>
                                    {service.notes ? <p>{service.notes}</p> : null}
                                  </div>
                                  <em className={`clients-service-result ${service.result}`}>{service.result}</em>
                                  {service.remainingLifePercent !== null ? <b>{service.remainingLifePercent}% life</b> : null}
                                </article>
                              ))}
                            </div>
                          ) : <p className="clients-assets-inline-empty">No service events recorded yet.</p>}
                        </section>
                      </div>
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

      {assetFormOpen ? (
        <div className="supplier-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}>
          <div className="supplier-modal clients-asset-modal" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title">
            <button className="supplier-modal-close" type="button" onClick={closeDialog} aria-label="Close dialog" disabled={saving}>
              <X size={18} />
            </button>
            <form onSubmit={saveAsset}>
              <div className="supplier-modal-header clients-asset-modal-header">
                <span>Customer Asset</span>
                <strong id="asset-dialog-title">{assetEditingId ? 'Edit Asset' : 'Register Existing Asset'}</strong>
                <p>{assetEditingId ? 'Update its custody, condition, and identity without changing its service history.' : 'Add an asset already owned by the client. Future completed Production Orders with this serial will extend its service history.'}</p>
              </div>
              <div className="supplier-form-grid clients-asset-form-grid">
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
                  <input required autoFocus value={assetForm.assetType} onChange={(event) => setAssetForm((current) => ({ ...current, assetType: event.target.value }))} placeholder="Hob, fixture, machine, tooling..." />
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
                  Estimated Useful Life % <em>Optional</em>
                  <input type="number" min="0" max="100" step="0.1" value={assetForm.estimatedLifePercent} onChange={(event) => setAssetForm((current) => ({ ...current, estimatedLifePercent: event.target.value }))} />
                </label>
                <label>
                  Last Inspection <em>Optional</em>
                  <input type="date" value={assetForm.lastInspectionAt} onChange={(event) => setAssetForm((current) => ({ ...current, lastInspectionAt: event.target.value }))} />
                </label>
                <label className="supplier-form-wide">
                  Description
                  <textarea required value={assetForm.description} onChange={(event) => setAssetForm((current) => ({ ...current, description: event.target.value }))} placeholder="Identify the asset and its operational purpose." />
                </label>
                <label className="clients-asset-file-field">
                  <span><Camera size={15} /> Photos <em>Optional</em></span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple onChange={(event) => setAssetPhotos(Array.from(event.target.files ?? []))} />
                  <small>{assetPhotos.length ? `${assetPhotos.length} photos selected` : 'JPG, PNG, WEBP or HEIC'}</small>
                </label>
                <label className="clients-asset-file-field">
                  <span><FileText size={15} /> Documents <em>Optional</em></span>
                  <input type="file" accept="application/pdf" multiple onChange={(event) => setAssetDocuments(Array.from(event.target.files ?? []))} />
                  <small>{assetDocuments.length ? `${assetDocuments.length} documents selected` : 'PDF files up to 50 MB'}</small>
                </label>
                <label className="supplier-form-wide">
                  Internal Notes <em>Optional</em>
                  <textarea value={assetForm.internalNotes} onChange={(event) => setAssetForm((current) => ({ ...current, internalNotes: event.target.value }))} />
                </label>
              </div>
              {assetError ? <div className="clients-modal-error" role="alert">{assetError}</div> : null}
              <div className="supplier-modal-actions">
                <button type="button" onClick={closeDialog} disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving || !assetForm.customerId}>
                  {assetEditingId ? <Pencil size={16} /> : <Plus size={16} />} {saving ? 'Saving...' : assetEditingId ? 'Save Asset' : 'Register Asset'}
                </button>
              </div>
            </form>
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
    </section>
  );
}
