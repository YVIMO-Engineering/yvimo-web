import React from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import {
  resolveGooglePlacesAddressMatch,
  searchGooglePlacesAddressMatches,
  type GooglePlacesAddressMatch,
} from '../lib/maps/googlePlacesAddressLookup';
import { supabase } from '../lib/supabaseClient';

export type ClientsContextTab =
  | 'customers'
  | 'assets-equipment'
  | 'deliveries-returns'
  | 'balances'
  | 'docs-vouchers';

type CustomerStatus = 'active' | 'inactive';
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
  notes: string;
  status: CustomerStatus;
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
  notes: '',
  status: 'active',
};

const customerStatusOptions: Array<CustomerDropdownOption<CustomerStatus>> = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
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
    eyebrow: 'MES / CLIENTS',
    title: 'Balances',
    description: 'Review the current balance of customer assets, equipment, deliveries, and returns in one place.',
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
    notes: customer.notes,
    status: customer.status,
  };
}

export function CustomerOperationsWorkspace({ onNavigate, activeTab, organizationId }: CustomerOperationsWorkspaceProps) {
  const page = clientsPageContent[activeTab];
  const [customers, setCustomers] = React.useState<CustomerRecord[]>([]);
  const [loading, setLoading] = React.useState(activeTab === 'customers');
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

  React.useEffect(() => {
    if (activeTab === 'customers') void loadCustomers();
  }, [activeTab, loadCustomers]);

  React.useEffect(() => {
    if (!formMode && !customerToDelete) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving) return;
      setFormMode(null);
      setCustomerToDelete(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [formMode, customerToDelete, saving]);

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
      <div className="mes-screen-header">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes')}>
          <ArrowLeft size={17} />
          MES Applications
        </button>
        <div className="mes-workspace-heading">
          <span className="eyebrow">{page.eyebrow}</span>
          <h2>{page.title}</h2>
          <p>{page.description}</p>
        </div>
        <div className="clients-header-actions">
          {activeTab === 'customers' ? (
            <button type="button" onClick={openCreateCustomer}>
              <Plus size={16} />
              Add New Customer
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
