import React from 'react';
import { AlertTriangle, ArrowLeft, Building2, CalendarClock, Check, ChevronDown, ChevronRight, Eye, FileText, Link2, LoaderCircle, Mail, Plus, RotateCcw, Search, Send, Settings2, ShieldCheck, ToggleLeft, Users } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import './customerPortal.css';
import './customerPortalDropdown.css';

type Props = { organizationId: string; organizationName: string; onNavigate: (path: string) => void };
type CustomerOption = { id: string; name: string; legalName: string };
type DelayOrder = { id: string; orderNumber: string; partLabel: string; customerId: string; customerName: string; dueDate: string; status: string };
type DelayNotice = { id: string; productionOrderId: string; originalDueDate: string; newDueDate: string; reason: string; createdAt: string };

const openOrderStatuses = ['planned', 'released', 'running', 'paused', 'waiting-inspection'];

function formatDay(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function nextDay(value: string) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function CustomerPortalAdminWorkspace({ organizationId, organizationName, onNavigate }: Props) {
  const [tab, setTab] = React.useState<'users' | 'permissions' | 'delays' | 'settings'>('users');
  const [delayOrders, setDelayOrders] = React.useState<DelayOrder[]>([]);
  const [delayNotices, setDelayNotices] = React.useState<DelayNotice[]>([]);
  const [delaysLoading, setDelaysLoading] = React.useState(false);
  const [delaySearch, setDelaySearch] = React.useState('');
  const [delayOrder, setDelayOrder] = React.useState<DelayOrder | null>(null);
  const [delayDate, setDelayDate] = React.useState('');
  const [delayReason, setDelayReason] = React.useState('');
  const [delayMessage, setDelayMessage] = React.useState('');
  const [delaySaving, setDelaySaving] = React.useState(false);
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

  const loadDeliveryDelays = React.useCallback(async () => {
    setDelaysLoading(true);
    const [orderResult, noticeResult] = await Promise.all([
      supabase.from('mes_production_orders').select('id, order_number, part_number, part_name, customer_id, due_date, status, mes_customers(customer_name)').eq('organization_id', organizationId).not('customer_id', 'is', null).in('status', openOrderStatuses).order('due_date'),
      supabase.from('mes_order_delivery_delays').select('id, production_order_id, original_due_date, new_due_date, reason, created_at').eq('organization_id', organizationId).eq('status', 'active').order('created_at', { ascending: false }),
    ]);
    if (orderResult.error) console.error('[customer-portal] unable to load production orders', orderResult.error);
    if (noticeResult.error) console.error('[customer-portal] unable to load delivery delays', noticeResult.error);
    setDelayOrders((orderResult.data ?? []).map((row) => {
      const customer = Array.isArray(row.mes_customers) ? row.mes_customers[0] : row.mes_customers;
      return { id: String(row.id), orderNumber: String(row.order_number), partLabel: String(row.part_number || row.part_name || ''), customerId: String(row.customer_id), customerName: String(customer?.customer_name ?? 'Unknown customer'), dueDate: String(row.due_date), status: String(row.status) };
    }));
    setDelayNotices((noticeResult.data ?? []).map((row) => ({ id: String(row.id), productionOrderId: String(row.production_order_id), originalDueDate: String(row.original_due_date), newDueDate: String(row.new_due_date), reason: String(row.reason), createdAt: String(row.created_at) })));
    setDelaysLoading(false);
  }, [organizationId]);

  const openDelayModal = (order: DelayOrder) => {
    const notice = delayNotices.find((row) => row.productionOrderId === order.id);
    setDelayOrder(order);
    setDelayDate(notice?.newDueDate ?? '');
    setDelayReason(notice?.reason ?? '');
    setDelayMessage('');
  };

  const closeDelayModal = () => { setDelayOrder(null); setDelayDate(''); setDelayReason(''); setDelayMessage(''); };

  const submitDelayNotice = async () => {
    if (!delayOrder) return;
    const reason = delayReason.trim();
    if (!delayDate) { setDelayMessage('Select the new expected delivery date.'); return; }
    if (delayDate <= delayOrder.dueDate) { setDelayMessage('The new date must be later than the current expected delivery.'); return; }
    if (!reason) { setDelayMessage('Describe the reason the customer will see.'); return; }
    setDelaySaving(true);
    setDelayMessage('');
    const supersededIds = delayNotices.filter((row) => row.productionOrderId === delayOrder.id).map((row) => row.id);
    const { error } = await supabase.from('mes_order_delivery_delays').insert({ organization_id: organizationId, customer_id: delayOrder.customerId, production_order_id: delayOrder.id, original_due_date: delayOrder.dueDate, new_due_date: delayDate, reason });
    if (error) { setDelaySaving(false); setDelayMessage(error.message || 'Unable to publish the delay notice.'); return; }
    if (supersededIds.length) {
      const { error: supersedeError } = await supabase.from('mes_order_delivery_delays').update({ status: 'cancelled', updated_at: new Date().toISOString() }).in('id', supersededIds);
      if (supersedeError) console.error('[customer-portal] unable to retire the previous delay notice', supersedeError);
    }
    setDelaySaving(false);
    closeDelayModal();
    await loadDeliveryDelays();
  };

  const cancelDelayNotice = async (noticeId: string) => {
    const { error } = await supabase.from('mes_order_delivery_delays').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', noticeId);
    if (error) { console.error('[customer-portal] unable to cancel delivery delay', error); return; }
    await loadDeliveryDelays();
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
    if (tab !== 'delays') return;
    void loadDeliveryDelays();
  }, [loadDeliveryDelays, tab]);

  React.useEffect(() => {
    if (!customerMenuOpen && !accessMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!customerDropdownRef.current?.contains(event.target as Node)) setCustomerMenuOpen(false);
      if (!accessDropdownRef.current?.contains(event.target as Node)) setAccessMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [accessMenuOpen, customerMenuOpen]);

  const noticeByOrderId = new Map(delayNotices.map((notice) => [notice.productionOrderId, notice]));
  const normalizedDelaySearch = delaySearch.trim().toLowerCase();
  const filteredDelayOrders = delayOrders.filter((order) => !normalizedDelaySearch || `${order.orderNumber} ${order.partLabel} ${order.customerName}`.toLowerCase().includes(normalizedDelaySearch));

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
          <button className={tab === 'delays' ? 'active' : ''} onClick={() => setTab('delays')}><CalendarClock size={17} /> Delivery delays</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Settings2 size={17} /> Portal settings</button>
        </nav>

        {tab === 'users' ? <>
          <div className="cp-admin-toolbar"><div><h2>External users</h2><p>Every user is isolated to an organization and customer account.</p></div><span className="cp-search"><Search size={17} /><input aria-label="Search users" placeholder="Search name, email or customer" /></span><button className="cp-primary" onClick={() => setInviteOpen(true)}><Plus size={17} /> Invite user</button></div>
          <div className="cp-user-table"><div className="cp-user-head"><span>User</span><span>Customer</span><span>Access profile</span><span>Status</span><span>Last access</span><span /></div>{portalUsers.map((row) => <div className="cp-user-row" key={row.email}><span className="cp-user-name"><i>{row.initials}</i><span><strong>{row.name}</strong><small>{row.email}</small></span></span><strong>{row.customer}</strong><span>{row.role}</span><span className={`cp-status ${row.status.toLowerCase()}`}>{row.status}</span><span>{row.last}</span><button aria-label={`Manage ${row.name}`}><ChevronRight size={17} /></button></div>)}</div>
        </> : tab === 'delays' ? <>
          <div className="cp-admin-toolbar"><div><h2>Delivery delays</h2><p>Publish a formal reschedule notice. The customer sees the new date and the reason in place of the expected delivery.</p></div><span className="cp-search"><Search size={17} /><input aria-label="Search orders" value={delaySearch} onChange={(event) => setDelaySearch(event.target.value)} placeholder="Search order, part or customer" /></span><button className="cp-primary" type="button" disabled={delaysLoading} onClick={() => void loadDeliveryDelays()}><RotateCcw size={16} /> Refresh</button></div>
          <div className="cp-delay-table">
            <div className="cp-delay-head"><span>Order</span><span>Customer</span><span>Expected delivery</span><span>Delay notice</span><span /></div>
            {delaysLoading ? <p className="cp-delay-empty"><LoaderCircle className="cp-spin" size={17} /> Loading production orders…</p> : filteredDelayOrders.length ? filteredDelayOrders.map((order) => {
              const notice = noticeByOrderId.get(order.id);
              return <div className={`cp-delay-row${notice ? ' rescheduled' : ''}`} key={order.id}>
                <span className="cp-delay-order"><strong>{order.orderNumber}</strong><small>{order.partLabel}</small></span>
                <span className="cp-delay-customer">{order.customerName}</span>
                <span className="cp-delay-date"><strong className={notice ? 'superseded' : ''}>{formatDay(order.dueDate)}</strong>{notice ? <em>Now {formatDay(notice.newDueDate)}</em> : null}</span>
                <span>{notice ? <span className="cp-delay-notice"><small><AlertTriangle size={12} /> Customer notified</small><em>{notice.reason}</em></span> : <span className="cp-delay-none">No notice published</span>}</span>
                <span className="cp-delay-actions">{notice ? <button type="button" onClick={() => void cancelDelayNotice(notice.id)}>Withdraw</button> : null}<button className="cp-delay-report" type="button" onClick={() => openDelayModal(order)}><CalendarClock size={15} /> {notice ? 'Update' : 'Report delay'}</button></span>
              </div>;
            }) : <p className="cp-delay-empty">No open production orders assigned to a customer.</p>}
          </div>
        </> : tab === 'permissions' ? <div className="cp-permission-view"><div><h2>Default customer visibility</h2><p>Start with a safe baseline. Individual access profiles can be narrowed later.</p></div><div className="cp-permission-grid">{[['Orders','Order status, progress and expected dates'],['Tools','Customer-owned assets and service history'],['Documents','Only files explicitly shared with customers'],['Shipments','Dispatch and delivery information'],['Notifications','Relevant changes and new shared documents']].map(([title, description], index) => <article key={title}><span>{index < 4 ? <Check size={16} /> : <ToggleLeft size={20} />}</span><div><strong>{title}</strong><small>{description}</small></div><button>{index < 4 ? 'Visible' : 'Optional'}</button></article>)}</div></div> : <div className="cp-settings-view"><div><h2>Public portal</h2><p>Configure the customer-facing entry point for {organizationName}.</p></div><article><Link2 size={21} /><span><small>PUBLIC URL</small><strong>yvimo.com/customer-portal</strong></span><a href="/customer-portal" target="_blank" rel="noreferrer">Open portal <ChevronRight size={16} /></a></article><article><FileText size={21} /><span><small>SHARED INFORMATION</small><strong>Explicit publishing only</strong></span><em>Recommended</em></article></div>}
      </section>

      {inviteOpen ? <div className="cp-modal-backdrop" role="presentation" onMouseDown={() => setInviteOpen(false)}><form className="cp-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (!selectedCustomerId) { setMessage('Select a customer before preparing the invitation.'); return; } setMessage(`Invitation prepared for ${selectedCustomer?.name} with ${selectedAccessProfile.label.toLowerCase()} access. Data persistence will be connected in the next phase.`); }}><button className="cp-modal-close" type="button" onClick={() => setInviteOpen(false)}>×</button><span className="cp-product-mark"><Mail size={23} /></span><small>NEW PORTAL ACCESS</small><h2>Invite an external user</h2><p>The account will only see information associated with the selected customer.</p><label>Email address<input type="email" placeholder="name@customer.com" required /></label><label>Customer<div className={`cp-customer-dropdown${customerMenuOpen ? ' open' : ''}`} ref={customerDropdownRef}><button type="button" aria-haspopup="listbox" aria-expanded={customerMenuOpen} onClick={() => { setCustomerMenuOpen((open) => !open); setCustomerSearch(''); }}><span>{selectedCustomer?.name ?? 'Select a Manufacturing Ops customer'}</span>{customersLoading ? <LoaderCircle className="cp-spin" size={16} /> : <ChevronDown size={16} />}</button>{customerMenuOpen ? <div className="cp-customer-menu" role="listbox"><div className="cp-customer-search"><Search size={15} /><input autoFocus value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Search customers" /></div><div className="cp-customer-options">{customersLoading ? <p><LoaderCircle className="cp-spin" size={16} /> Loading organization customers…</p> : filteredCustomers.length ? filteredCustomers.map((customer) => <button type="button" role="option" aria-selected={customer.id === selectedCustomerId} className={customer.id === selectedCustomerId ? 'selected' : ''} key={customer.id} onClick={() => { setSelectedCustomerId(customer.id); setCustomerMenuOpen(false); setCustomerSearch(''); }}><span><strong>{customer.name}</strong>{customer.legalName && customer.legalName !== customer.name ? <small>{customer.legalName}</small> : null}</span>{customer.id === selectedCustomerId ? <Check size={16} /> : null}</button>) : <p>No customers found in this organization.</p>}</div></div> : null}</div></label><label>Access profile<div className={`cp-customer-dropdown cp-access-dropdown${accessMenuOpen ? ' open' : ''}`} ref={accessDropdownRef}><button type="button" aria-haspopup="listbox" aria-expanded={accessMenuOpen} onClick={() => setAccessMenuOpen((open) => !open)}><span>{selectedAccessProfile.label}</span><ChevronDown size={16} /></button>{accessMenuOpen ? <div className="cp-customer-menu cp-access-menu" role="listbox"><div className="cp-customer-options">{accessProfiles.map((profile) => <button type="button" role="option" aria-selected={profile.value === accessProfile} className={profile.value === accessProfile ? 'selected' : ''} key={profile.value} onClick={() => { setAccessProfile(profile.value); setAccessMenuOpen(false); }}><span><strong>{profile.label}</strong><small>{profile.description}</small></span>{profile.value === accessProfile ? <Check size={16} /> : null}</button>)}</div></div> : null}</div></label>{message ? <div className="cp-form-message">{message}</div> : null}<button className="cp-primary" type="submit"><Mail size={17} /> Prepare invitation</button></form></div> : null}
      {delayOrder ? <div className="cp-modal-backdrop" role="presentation" onMouseDown={closeDelayModal}><form className="cp-modal cp-delay-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void submitDelayNotice(); }}><button className="cp-modal-close" type="button" onClick={closeDelayModal}>×</button><span className="cp-product-mark"><CalendarClock size={23} /></span><small>DELIVERY DELAY NOTICE</small><h2>Reschedule order {delayOrder.orderNumber}</h2><p>The customer portal will show the new date and this reason instead of the current expected delivery.</p><div className="cp-delay-current"><span><small>CURRENT EXPECTED DELIVERY</small><strong>{formatDay(delayOrder.dueDate)}</strong></span><span><small>CUSTOMER</small><strong>{delayOrder.customerName}</strong></span></div><label>New expected delivery<input type="date" value={delayDate} min={nextDay(delayOrder.dueDate)} onChange={(event) => setDelayDate(event.target.value)} required /></label><label>Reason shared with the customer<textarea rows={3} value={delayReason} onChange={(event) => setDelayReason(event.target.value)} placeholder="Explain why the delivery moves, in the words the customer will read." required /></label>{delayMessage ? <div className="cp-form-message error">{delayMessage}</div> : null}<button className="cp-primary" type="submit" disabled={delaySaving}>{delaySaving ? <><LoaderCircle className="cp-spin" size={16} /> Publishing notice…</> : <><Send size={16} /> Publish delay notice</>}</button></form></div> : null}
      {createdCredentials ? <div className="cp-credentials-backdrop"><section className="cp-credentials-card" role="dialog" aria-modal="true" aria-label="Temporary Customer Portal credentials"><span className="cp-product-mark"><ShieldCheck size={23} /></span><small>ACCESS CREATED</small><h2>Temporary login credentials</h2><p>This password is shown only once. Share it securely with the customer.</p><div><label>Email</label><strong>{createdCredentials.email}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(createdCredentials.email)}>Copy</button></div><div><label>Temporary password</label><code>{createdCredentials.password}</code><button type="button" onClick={() => void navigator.clipboard.writeText(createdCredentials.password)}>Copy</button></div><span className="cp-credential-customer"><Building2 size={15} /> Customer: <strong>{createdCredentials.customer}</strong></span><button className="cp-primary" type="button" onClick={() => { setCreatedCredentials(null); setInviteOpen(false); setSelectedCustomerId(''); setMessageState(''); }}>Done</button></section></div> : null}
    </main>
  );
}
