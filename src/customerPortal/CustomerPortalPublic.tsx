import React from 'react';
import { Bell, Box, Building2, ChevronRight, ClipboardList, Clock3, FileCheck2, FileText, Gauge, HelpCircle, LayoutDashboard, LoaderCircle, LogOut, Menu, PackageCheck, Search, Settings, ShieldCheck, Truck, UserRound, Wrench, X } from 'lucide-react';
import '../manufacturing/customerPortal.css';
import './customerPortalBrand.css';
import { supabase } from '../lib/supabaseClient';

type User = { id: string; name: string; email: string; company?: string; avatarUrl?: string };
type SupplierOrganization = { name: string; logoUrl?: string } | null;
type Props = { user: User; supplierOrganization: SupplierOrganization; onSignOut: () => void };

const navigation = [
  { label: 'Dashboard', icon: LayoutDashboard }, { label: 'My Orders', icon: ClipboardList }, { label: 'Tools', icon: Wrench },
  { label: 'Documents', icon: FileText }, { label: 'Shipments', icon: Truck }, { label: 'Notifications', icon: Bell }, { label: 'Profile', icon: UserRound },
];

export function CustomerPortalPublic({ user, supplierOrganization, onSignOut }: Props) {
  const [active, setActive] = React.useState('Dashboard');
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [portalContext, setPortalContext] = React.useState<{ supplier: SupplierOrganization; customerName: string; customerId: string } | null>(null);
  const [contextLoading, setContextLoading] = React.useState(true);
  const initials = user.name.split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'CP';
  const customerAccount = portalContext?.customerName || user.company?.trim() || user.email;
  const resolvedSupplier = portalContext?.supplier ?? supplierOrganization;
  const supplierName = resolvedSupplier?.name || 'Manufacturing organization';

  React.useEffect(() => {
    let activeRequest = true;
    void supabase.from('customer_portal_accesses').select('customer_id, status, manufacturing_organizations(name, logo_url), mes_customers(customer_name)').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle().then(({ data, error }) => {
      if (!activeRequest) return;
      if (error) console.error('[customer-portal] unable to load portal access context', error);
      if (data) {
        const organization = Array.isArray(data.manufacturing_organizations) ? data.manufacturing_organizations[0] : data.manufacturing_organizations;
        const customer = Array.isArray(data.mes_customers) ? data.mes_customers[0] : data.mes_customers;
        setPortalContext({ supplier: organization ? { name: String(organization.name), logoUrl: String(organization.logo_url ?? '') } : null, customerName: String(customer?.customer_name ?? user.company ?? ''), customerId: String(data.customer_id) });
      }
      setContextLoading(false);
    });
    return () => { activeRequest = false; };
  }, [user.company, user.id]);

  if (contextLoading) return <main className="cp-portal-access-state"><LoaderCircle className="cp-spin" size={28} /><strong>Loading your customer access…</strong></main>;
  if (!portalContext) return <main className="cp-portal-access-state"><ShieldCheck size={34} /><strong>Customer Portal access required</strong><p>This login is valid, but it is not assigned to an active customer account.</p><button onClick={onSignOut}>Sign out</button></main>;
  supplierOrganization = resolvedSupplier;
  return <main className="cp-public-shell">
    <aside className={mobileOpen ? 'open' : ''}><div className="cp-public-brand"><img src="/assets/workspace/manufacturing-ops-logo.png" alt="YVIMO Manufacturing Ops" /><div><strong>Customer Portal</strong><small>MANUFACTURING OPS</small></div><button onClick={() => setMobileOpen(false)}><X size={18} /></button></div><div className="cp-customer-identity"><div className="cp-supplier-organization"><span>{supplierOrganization?.logoUrl ? <img src={supplierOrganization.logoUrl} alt="" /> : <Building2 size={18} />}</span><span><small>ORGANIZATION</small><strong>{supplierName}</strong></span></div><div className="cp-account-profile"><span>{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials}</span><span><small>CUSTOMER ACCOUNT</small><strong>{user.name}</strong><b>{customerAccount}</b></span></div></div><nav>{navigation.map((item) => <button className={active === item.label ? 'active' : ''} key={item.label} onClick={() => { setActive(item.label); setMobileOpen(false); }}><item.icon size={18} /><span>{item.label}</span>{item.label === 'Notifications' ? <em>3</em> : null}</button>)}</nav><div className="cp-public-help"><HelpCircle size={19} /><span><strong>Need help?</strong><small>Contact your supplier</small></span><ChevronRight size={16} /></div></aside>
    <section className="cp-public-main"><header><button className="cp-mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div><small>FRIDAY, AUGUST 28</small><strong>Good morning, {user.name.split(' ')[0]}</strong></div><div className="cp-public-header-actions"><button><Search size={19} /></button><button className="has-alert"><Bell size={19} /></button><button onClick={onSignOut} title="Sign out"><LogOut size={18} /></button></div></header>
      {active === 'Dashboard' ? <div className="cp-dashboard"><section className="cp-welcome"><div><span><ShieldCheck size={16} /> Secure customer view</span><h1>Your work, clearly in view.</h1><p>Track orders, tools, documents, and upcoming deliveries from {supplierName}.</p></div><div className="cp-welcome-art"><Gauge size={56} /><span>LIVE</span></div></section><div className="cp-kpis"><article><span className="blue"><ClipboardList size={20} /></span><div><small>ACTIVE ORDERS</small><strong>8</strong><em>2 updated today</em></div></article><article><span className="orange"><Wrench size={20} /></span><div><small>TOOLS IN PROCESS</small><strong>14</strong><em>Across 8 orders</em></div></article><article><span className="green"><Truck size={20} /></span><div><small>UPCOMING DELIVERIES</small><strong>3</strong><em>Next: Sep 02</em></div></article><article><span className="red"><Bell size={20} /></span><div><small>REQUIRES ATTENTION</small><strong>1</strong><em>Review requested</em></div></article></div><div className="cp-dashboard-grid"><section className="cp-orders-card"><header><div><h2>Active orders</h2><p>Latest progress across your current work</p></div><button onClick={() => setActive('My Orders')}>View all <ChevronRight size={16} /></button></header>{[['PO-45821','SRV-2026-0842','In process','68%','Sep 04'],['PO-45836','SRV-2026-0851','Quality check','92%','Sep 02'],['PO-45902','SRV-2026-0867','Received','12%','Sep 11']].map((order, i) => <article key={order[0]}><span className={`cp-order-icon order-${i}`}><Box size={19} /></span><span><small>CUSTOMER PO</small><strong>{order[0]}</strong><em>{order[1]}</em></span><span><b>{order[2]}</b><i><em style={{width: order[3]}} /></i><small>{order[3]} complete</small></span><span><small>EXPECTED DELIVERY</small><strong>{order[4]}</strong></span><ChevronRight size={17} /></article>)}</section><aside className="cp-activity-card"><header><div><h2>Recent activity</h2><p>Your latest updates</p></div><Clock3 size={19} /></header>{[[FileCheck2,'Certificate available','PO-45812 · 18 min ago'],[PackageCheck,'Quality check completed','PO-45836 · 2 hours ago'],[Truck,'Shipment dispatched','PO-45794 · Yesterday'],[Wrench,'Tool entered grinding','Tool MX-1048 · Yesterday']].map(([Icon,title,meta]) => <article key={String(title)}><span><Icon size={17} /></span><div><strong>{String(title)}</strong><small>{String(meta)}</small></div></article>)}</aside></div></div> : <div className="cp-section-placeholder"><span><Settings size={28} /></span><small>CUSTOMER PORTAL</small><h1>{active}</h1><p>This section is ready in the portal navigation. Its operational content and permissions will be connected in the next phase.</p><button onClick={() => setActive('Dashboard')}>Return to dashboard</button></div>}
    </section>
  </main>;
}

type LoginProps = { onSignIn: (email: string, password: string) => Promise<string | null>; onMicrosoft: () => Promise<string | null>; onGoogle: () => Promise<string | null>; onHome: () => void };
export function CustomerPortalLogin({ onSignIn, onMicrosoft, onGoogle, onHome }: LoginProps) {
  const [busy, setBusy] = React.useState(false); const [message, setMessage] = React.useState<string | null>(null);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setMessage(await onSignIn(String(data.get('email')), String(data.get('password')))); setBusy(false); };
  const oauth = async (fn: () => Promise<string | null>) => { setBusy(true); setMessage(await fn()); setBusy(false); };
  return <main className="cp-login"><section className="cp-login-story"><div className="cp-login-logo"><span>Y</span><strong>YVIMO</strong></div><div><small>CUSTOMER PORTAL</small><h1>Everything you need to know about your work.</h1><p>Secure, direct visibility into your orders, tools, documents, and shipments.</p><div><span><ClipboardList size={20} /> Real-time order status</span><span><Wrench size={20} /> Complete tool traceability</span><span><FileText size={20} /> Documents in one place</span></div></div><footer>Powered by YVIMO Manufacturing Ops</footer></section><section className="cp-login-form-wrap"><button className="cp-login-close" onClick={onHome}><X size={18} /></button><form onSubmit={submit}><div className="cp-login-form-logo"><span>Y</span><div><strong>Welcome back</strong><small>Sign in to your customer portal</small></div></div><label>Email address<div><UserRound size={18} /><input name="email" type="email" autoComplete="email" placeholder="you@company.com" required /></div></label><label>Password<div><ShieldCheck size={18} /><input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required /></div></label><button className="cp-login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'} <ChevronRight size={17} /></button>{message ? <p className="cp-login-message">{message}</p> : null}<div className="cp-login-divider"><span>or continue with</span></div><div className="cp-login-oauth"><button type="button" disabled={busy} onClick={() => void oauth(onMicrosoft)}>Microsoft</button><button type="button" disabled={busy} onClick={() => void oauth(onGoogle)}>Google</button></div><p className="cp-login-assistance">Access is invitation-only. Contact your supplier if you need an account.</p></form></section></main>;
}
