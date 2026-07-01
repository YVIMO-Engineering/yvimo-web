import React from 'react';
import {
  ArrowLeft,
  Building2,
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
import { supabase } from '../lib/supabaseClient';

export type ClientsContextTab =
  | 'customers'
  | 'assets-equipment'
  | 'deliveries-returns'
  | 'balances'
  | 'docs-vouchers';

type CustomerStatus = 'active' | 'inactive';

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

  const openCreateCustomer = () => {
    setErrorMessage('');
    setSelectedCustomer(null);
    setCustomerForm(emptyCustomerForm);
    setFormMode('create');
  };

  const openEditCustomer = (customer: CustomerRecord) => {
    setErrorMessage('');
    setSelectedCustomer(customer);
    setCustomerForm(customerToForm(customer));
    setFormMode('edit');
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

  return (
    <section className="mes-workspace-panel clients-operations-workspace">
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
                  <input required autoFocus value={customerForm.customerName} onChange={(event) => setCustomerForm((current) => ({ ...current, customerName: event.target.value }))} />
                </label>
                <label>
                  Status
                  <select value={customerForm.status} onChange={(event) => setCustomerForm((current) => ({ ...current, status: event.target.value as CustomerStatus }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <label className="supplier-form-wide">
                  Legal / Billing Name
                  <input required value={customerForm.legalName} onChange={(event) => setCustomerForm((current) => ({ ...current, legalName: event.target.value }))} />
                </label>
                <label>
                  RFC / Tax ID <em>Optional</em>
                  <input value={customerForm.taxId} onChange={(event) => setCustomerForm((current) => ({ ...current, taxId: event.target.value }))} />
                </label>
                <label>
                  Payment Terms
                  <input required list="customer-payment-terms" value={customerForm.paymentTerms} onChange={(event) => setCustomerForm((current) => ({ ...current, paymentTerms: event.target.value }))} />
                  <datalist id="customer-payment-terms">
                    <option value="Due on receipt" />
                    <option value="Net 15" />
                    <option value="Net 30" />
                    <option value="Net 45" />
                    <option value="Net 60" />
                    <option value="Net 90" />
                  </datalist>
                </label>
                <label>
                  Contact Name
                  <input required value={customerForm.contactName} onChange={(event) => setCustomerForm((current) => ({ ...current, contactName: event.target.value }))} />
                </label>
                <label>
                  Email
                  <input required type="email" value={customerForm.email} onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))} />
                </label>
                <label>
                  Phone
                  <input required type="tel" value={customerForm.phone} onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))} />
                </label>
                <label className="supplier-form-wide">
                  Address
                  <input required value={customerForm.address} onChange={(event) => setCustomerForm((current) => ({ ...current, address: event.target.value }))} />
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
