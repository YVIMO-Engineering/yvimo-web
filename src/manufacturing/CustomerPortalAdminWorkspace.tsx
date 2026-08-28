import React from 'react';
import { ArrowLeft, Building2, Check, ChevronDown, ChevronRight, Eye, FileText, Link2, LoaderCircle, Mail, Plus, Search, Settings2, ShieldCheck, ToggleLeft, Users } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import './customerPortal.css';
import './customerPortalDropdown.css';

type Props = { organizationId: string; organizationName: string; onNavigate: (path: string) => void };
type CustomerOption = { id: string; name: string; legalName: string };

export function CustomerPortalAdminWorkspace({ organizationId, organizationName, onNavigate }: Props) {
  const [tab, setTab] = React.useState<'users' | 'permissions' | 'settings'>('users');
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [message, setMessageState] = React.useState('');
  const [portalUsers, setPortalUsers] = React.useState<Array<{ initials: string; name: string; email: string; customer: string; role: string; status: string; last: string }>>([]);
  const [inviteSaving, setInviteSaving] = React.useState(false);
  const [createdCredentials, setCreatedCredentials] = React.useState<{ email: string; password: string; customer: string } | null>(null);
  const [customers, setCustomers] = React.useState<CustomerOption[]>([]);
  const [customersLoading, setCustomersLoading] = React.useState(false);
  const [customerMenuOpen, setCustomerMenuOpen] = React.useState(false);
  const [customerSearch, setCustomerSearch] = React.useState('');
  const [selectedCustomerId, setSelectedCustomerId] = React.useState('');
  const [accessProfile, setAccessProfile] = React.useState('standard');
  const [accessMenuOpen, setAccessMenuOpen] = React.useState(false);
  const customerDropdownRef = React.useRef<HTMLDivElement | null>(null);
  const accessDropdownRef = React.useRef<HTMLDivElement | null>(null);
  const accessProfiles = [
    { value: 'standard', label: 'Standard viewer', description: 'Orders, tools, documents and shipments' },
    { value: 'admin', label: 'Customer administrator', description: 'Standard access plus customer user management' },
    { value: 'documents', label: 'Documents only', description: 'Only documents explicitly shared with the customer' },
  ];
  const selectedAccessProfile = accessProfiles.find((profile) => profile.value === accessProfile) ?? accessProfiles[0];
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const filteredCustomers = customers.filter((customer) => `${customer.name} ${customer.legalName}`.toLowerCase().includes(customerSearch.trim().toLowerCase()));

  const prepareInvitation = async () => {
    const emailInput = document.querySelector<HTMLInputElement>('.cp-modal input[type="email"]');
    const email = emailInput?.value.trim().toLowerCase() ?? '';
    if (!selectedCustomerId) { setMessageState('Select a customer before preparing the invitation.'); return; }
    if (!email) { setMessageState('Enter an email address.'); return; }
    setInviteSaving(true);
    setMessageState('');
    setCreatedCredentials(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sign in again before creating an external access.');
      const response = await fetch('/api/manufacturing/customer-portal/accesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ organizationId, customerId: selectedCustomerId, email, accessProfile }),
      });
      const result = await response.json() as { error?: string; temporaryPassword?: string; customer?: { name: string } };
      if (!response.ok || !result.temporaryPassword) throw new Error(result.error || 'Unable to create the Customer Portal access.');
      const customerName = result.customer?.name ?? selectedCustomer?.name ?? '';
      setCreatedCredentials({ email, password: result.temporaryPassword, customer: customerName });
      setMessageState('Customer Portal login created. Copy the temporary credentials now; the password will not be shown again.');
      setPortalUsers((current) => [{ initials: email.slice(0, 2).toUpperCase(), name: email.split('@')[0], email, customer: customerName, role: selectedAccessProfile.label, status: 'Active', last: 'Never signed in' }, ...current]);
    } catch (error) {
      setMessageState(error instanceof Error ? error.message : 'Unable to create the Customer Portal access.');
    } finally {
      setInviteSaving(false);
    }
  };

  const setMessage = (value: string) => {
    if (value.startsWith('Invitation prepared for')) { if (!inviteSaving) void prepareInvitation(); return; }
    setMessageState(value);
  };

  React.useEffect(() => {
    if (!inviteOpen || customers.length) return;
    let active = true;
    setCustomersLoading(true);
    void supabase.from('mes_customers').select('id, customer_name, legal_name').eq('organization_id', organizationId).order('customer_name').then(({ data, error }) => {
      if (!active) return;
      if (error) console.error('[customer-portal] unable to load organization customers', error);
      setCustomers((data ?? []).map((row) => ({ id: String(row.id), name: String(row.customer_name), legalName: String(row.legal_name ?? '') })));
      setCustomersLoading(false);
    });
    return () => { active = false; };
  }, [customers.length, inviteOpen, organizationId]);

  React.useEffect(() => {
    let active = true;
    void supabase.from('customer_portal_accesses').select('email, access_profile, status, created_at, mes_customers(customer_name)').eq('organization_id', organizationId).order('created_at', { ascending: false }).then(({ data, error }) => {
      if (!active) return;
      if (error) { console.error('[customer-portal] unable to load portal users', error); return; }
      setPortalUsers((data ?? []).map((row) => {
        const customer = Array.isArray(row.mes_customers) ? row.mes_customers[0] : row.mes_customers;
        const email = String(row.email);
        const profileLabel = accessProfiles.find((profile) => profile.value === row.access_profile)?.label ?? String(row.access_profile);
        return { initials: email.slice(0, 2).toUpperCase(), name: email.split('@')[0], email, customer: String(customer?.customer_name ?? 'Unknown customer'), role: profileLabel, status: row.status === 'active' ? 'Active' : 'Disabled', last: 'Never signed in' };
      }));
    });
    return () => { active = false; };
  }, [organizationId]);

  React.useEffect(() => {
    if (!customerMenuOpen && !accessMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!customerDropdownRef.current?.contains(event.target as Node)) setCustomerMenuOpen(false);
      if (!accessDropdownRef.current?.contains(event.target as Node)) setAccessMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [accessMenuOpen, customerMenuOpen]);

  return (
    <main className="cp-admin">
      <header className="cp-admin-header">
        <button className="cp-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/aps')}><ArrowLeft size={17} /> APS Applications</button>
        <div className="cp-admin-title"><span className="cp-product-mark"><Users size={24} /></span><div><p>APS / CUSTOMER PORTAL</p><h1>Customer Portal</h1><span>Control how your customers access operational information.</span></div></div>
        <div className="cp-org"><Building2 size={17} /><span><small>ORGANIZATION</small><strong>{organizationName}</strong></span></div>
      </header>

      <section className="cp-admin-summary">
        <article><span className="blue"><Users size={20} /></span><div><small>EXTERNAL USERS</small><strong>{portalUsers.length}</strong><em>Across {new Set(portalUsers.map((item) => item.customer)).size} customers</em></div></article>
        <article><span className="green"><Check size={20} /></span><div><small>ACTIVE ACCESS</small><strong>{portalUsers.filter((item) => item.status === 'Active').length}</strong><em>Customer Portal logins</em></div></article>
        <article><span className="violet"><ShieldCheck size={20} /></span><div><small>PORTAL STATUS</small><strong>Live</strong><em>Protected customer access</em></div></article>
        <a href="/customer-portal" target="_blank" rel="noreferrer"><Eye size={18} /><span><small>PUBLIC EXPERIENCE</small><strong>Preview portal</strong></span><ChevronRight size={18} /></a>
      </section>

      <section className="cp-admin-panel">
        <nav className="cp-tabs" aria-label="Customer Portal settings">
          <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Users size={17} /> Portal users</button>
          <button className={tab === 'permissions' ? 'active' : ''} onClick={() => setTab('permissions')}><ShieldCheck size={17} /> Permissions</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Settings2 size={17} /> Portal settings</button>
        </nav>

        {tab === 'users' ? <>
          <div className="cp-admin-toolbar"><div><h2>External users</h2><p>Every user is isolated to an organization and customer account.</p></div><span className="cp-search"><Search size={17} /><input aria-label="Search users" placeholder="Search name, email or customer" /></span><button className="cp-primary" onClick={() => setInviteOpen(true)}><Plus size={17} /> Invite user</button></div>
          <div className="cp-user-table"><div className="cp-user-head"><span>User</span><span>Customer</span><span>Access profile</span><span>Status</span><span>Last access</span><span /></div>{portalUsers.map((row) => <div className="cp-user-row" key={row.email}><span className="cp-user-name"><i>{row.initials}</i><span><strong>{row.name}</strong><small>{row.email}</small></span></span><strong>{row.customer}</strong><span>{row.role}</span><span className={`cp-status ${row.status.toLowerCase()}`}>{row.status}</span><span>{row.last}</span><button aria-label={`Manage ${row.name}`}><ChevronRight size={17} /></button></div>)}</div>
        </> : tab === 'permissions' ? <div className="cp-permission-view"><div><h2>Default customer visibility</h2><p>Start with a safe baseline. Individual access profiles can be narrowed later.</p></div><div className="cp-permission-grid">{[['Orders','Order status, progress and expected dates'],['Tools','Customer-owned assets and service history'],['Documents','Only files explicitly shared with customers'],['Shipments','Dispatch and delivery information'],['Notifications','Relevant changes and new shared documents']].map(([title, description], index) => <article key={title}><span>{index < 4 ? <Check size={16} /> : <ToggleLeft size={20} />}</span><div><strong>{title}</strong><small>{description}</small></div><button>{index < 4 ? 'Visible' : 'Optional'}</button></article>)}</div></div> : <div className="cp-settings-view"><div><h2>Public portal</h2><p>Configure the customer-facing entry point for {organizationName}.</p></div><article><Link2 size={21} /><span><small>PUBLIC URL</small><strong>yvimo.com/customer-portal</strong></span><a href="/customer-portal" target="_blank" rel="noreferrer">Open portal <ChevronRight size={16} /></a></article><article><FileText size={21} /><span><small>SHARED INFORMATION</small><strong>Explicit publishing only</strong></span><em>Recommended</em></article></div>}
      </section>

      {inviteOpen ? <div className="cp-modal-backdrop" role="presentation" onMouseDown={() => setInviteOpen(false)}><form className="cp-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (!selectedCustomerId) { setMessage('Select a customer before preparing the invitation.'); return; } setMessage(`Invitation prepared for ${selectedCustomer?.name} with ${selectedAccessProfile.label.toLowerCase()} access. Data persistence will be connected in the next phase.`); }}><button className="cp-modal-close" type="button" onClick={() => setInviteOpen(false)}>×</button><span className="cp-product-mark"><Mail size={23} /></span><small>NEW PORTAL ACCESS</small><h2>Invite an external user</h2><p>The account will only see information associated with the selected customer.</p><label>Email address<input type="email" placeholder="name@customer.com" required /></label><label>Customer<div className={`cp-customer-dropdown${customerMenuOpen ? ' open' : ''}`} ref={customerDropdownRef}><button type="button" aria-haspopup="listbox" aria-expanded={customerMenuOpen} onClick={() => { setCustomerMenuOpen((open) => !open); setCustomerSearch(''); }}><span>{selectedCustomer?.name ?? 'Select a Manufacturing Ops customer'}</span>{customersLoading ? <LoaderCircle className="cp-spin" size={16} /> : <ChevronDown size={16} />}</button>{customerMenuOpen ? <div className="cp-customer-menu" role="listbox"><div className="cp-customer-search"><Search size={15} /><input autoFocus value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Search customers" /></div><div className="cp-customer-options">{customersLoading ? <p><LoaderCircle className="cp-spin" size={16} /> Loading organization customers…</p> : filteredCustomers.length ? filteredCustomers.map((customer) => <button type="button" role="option" aria-selected={customer.id === selectedCustomerId} className={customer.id === selectedCustomerId ? 'selected' : ''} key={customer.id} onClick={() => { setSelectedCustomerId(customer.id); setCustomerMenuOpen(false); setCustomerSearch(''); }}><span><strong>{customer.name}</strong>{customer.legalName && customer.legalName !== customer.name ? <small>{customer.legalName}</small> : null}</span>{customer.id === selectedCustomerId ? <Check size={16} /> : null}</button>) : <p>No customers found in this organization.</p>}</div></div> : null}</div></label><label>Access profile<div className={`cp-customer-dropdown cp-access-dropdown${accessMenuOpen ? ' open' : ''}`} ref={accessDropdownRef}><button type="button" aria-haspopup="listbox" aria-expanded={accessMenuOpen} onClick={() => setAccessMenuOpen((open) => !open)}><span>{selectedAccessProfile.label}</span><ChevronDown size={16} /></button>{accessMenuOpen ? <div className="cp-customer-menu cp-access-menu" role="listbox"><div className="cp-customer-options">{accessProfiles.map((profile) => <button type="button" role="option" aria-selected={profile.value === accessProfile} className={profile.value === accessProfile ? 'selected' : ''} key={profile.value} onClick={() => { setAccessProfile(profile.value); setAccessMenuOpen(false); }}><span><strong>{profile.label}</strong><small>{profile.description}</small></span>{profile.value === accessProfile ? <Check size={16} /> : null}</button>)}</div></div> : null}</div></label>{message ? <div className="cp-form-message">{message}</div> : null}<button className="cp-primary" type="submit"><Mail size={17} /> Prepare invitation</button></form></div> : null}
      {createdCredentials ? <div className="cp-credentials-backdrop"><section className="cp-credentials-card" role="dialog" aria-modal="true" aria-label="Temporary Customer Portal credentials"><span className="cp-product-mark"><ShieldCheck size={23} /></span><small>ACCESS CREATED</small><h2>Temporary login credentials</h2><p>This password is shown only once. Share it securely with the customer.</p><div><label>Email</label><strong>{createdCredentials.email}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(createdCredentials.email)}>Copy</button></div><div><label>Temporary password</label><code>{createdCredentials.password}</code><button type="button" onClick={() => void navigator.clipboard.writeText(createdCredentials.password)}>Copy</button></div><span className="cp-credential-customer"><Building2 size={15} /> Customer: <strong>{createdCredentials.customer}</strong></span><button className="cp-primary" type="button" onClick={() => { setCreatedCredentials(null); setInviteOpen(false); setSelectedCustomerId(''); setMessageState(''); }}>Done</button></section></div> : null}
    </main>
  );
}
