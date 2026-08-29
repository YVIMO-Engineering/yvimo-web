import React from 'react';
import { Bell, Building2, ChevronRight, ClipboardList, FileText, HelpCircle, LayoutDashboard, LoaderCircle, LogOut, Menu, Search, Settings, ShieldCheck, Truck, UserRound, Wrench, X } from 'lucide-react';
import { customerPortalSupabase as supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import { CustomerPortalDashboard } from './CustomerPortalDashboard';
import '../manufacturing/customerPortal.css';
import './customerPortalBrand.css';

type User = { id: string; name: string; email: string; company?: string; avatarUrl?: string };
type SupplierOrganization = { name: string; logoUrl?: string } | null;
type Props = { user: User; supplierOrganization: SupplierOrganization; onSignOut: () => void };

const navigation = [
  { label: 'Dashboard', icon: LayoutDashboard }, { label: 'My Active Orders', icon: ClipboardList }, { label: 'Tools', icon: Wrench },
  { label: 'Documents', icon: FileText }, { label: 'Shipments', icon: Truck }, { label: 'Notifications', icon: Bell }, { label: 'Profile', icon: UserRound },
];

export function CustomerPortalPublic({ user, supplierOrganization, onSignOut }: Props) {
  const [active, setActive] = React.useState('Dashboard');
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [portalContext, setPortalContext] = React.useState<{ organizationId: string; supplier: SupplierOrganization; customerName: string; customerId: string } | null>(null);
  const [contextLoading, setContextLoading] = React.useState(true);
  const initials = user.name.split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'CP';
  const customerAccount = portalContext?.customerName || user.company?.trim() || user.email;
  const resolvedSupplier = portalContext?.supplier ?? supplierOrganization;
  const supplierName = resolvedSupplier?.name || 'Manufacturing organization';

  const loadPortalContext = React.useCallback(async () => {
    const { data, error } = await supabase.from('customer_portal_accesses').select('organization_id, customer_id, status, manufacturing_organizations(name, logo_url), mes_customers(customer_name)').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
      if (error) console.error('[customer-portal] unable to load portal access context', error);
      if (data) {
        const organization = Array.isArray(data.manufacturing_organizations) ? data.manufacturing_organizations[0] : data.manufacturing_organizations;
        const customer = Array.isArray(data.mes_customers) ? data.mes_customers[0] : data.mes_customers;
        setPortalContext({ organizationId: String(data.organization_id), supplier: organization ? { name: String(organization.name), logoUrl: String(organization.logo_url ?? '') } : null, customerName: String(customer?.customer_name ?? user.company ?? ''), customerId: String(data.customer_id) });
      } else setPortalContext(null);
    setContextLoading(false);
  }, [user.company, user.id]);

  React.useEffect(() => { void loadPortalContext(); }, [loadPortalContext]);

  const contextRealtimeTables = React.useMemo(() => [
    { table: 'customer_portal_accesses', filter: `user_id=eq.${user.id}` },
    { table: 'manufacturing_organizations' },
    { table: 'mes_customers' },
  ], [user.id]);

  useSupabaseRealtimeRefresh({ client: supabase, channelName: `customer-portal-context:${user.id}`, tables: contextRealtimeTables, onRefresh: loadPortalContext, debounceMs: 150 });

  if (contextLoading) return <main className="cp-portal-access-state"><LoaderCircle className="cp-spin" size={28} /><strong>Loading your customer access…</strong></main>;
  if (!portalContext) return <main className="cp-portal-access-state"><ShieldCheck size={34} /><strong>Customer Portal access required</strong><p>This login is valid, but it is not assigned to an active customer account.</p><button onClick={onSignOut}>Sign out</button></main>;

  return <main className="cp-public-shell">
    <aside className={mobileOpen ? 'open' : ''}>
      <div className="cp-public-brand"><img src="/assets/workspace/manufacturing-ops-logo.png" alt="YVIMO Manufacturing Ops" /><div><strong>Customer Portal</strong><small>MANUFACTURING OPS</small></div><button onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <div className="cp-customer-identity"><div className="cp-supplier-organization"><span>{resolvedSupplier?.logoUrl ? <img src={resolvedSupplier.logoUrl} alt="" /> : <Building2 size={18} />}</span><span><small>ORGANIZATION</small><strong>{supplierName}</strong></span></div><div className="cp-account-profile"><span>{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials}</span><span><small>CUSTOMER ACCOUNT</small><strong>{user.name}</strong><b>{customerAccount}</b></span></div></div>
      <nav>{navigation.map((item) => <button className={active === item.label ? 'active' : ''} key={item.label} onClick={() => { setActive(item.label); setMobileOpen(false); }}><item.icon size={18} /><span>{item.label}</span>{item.label === 'Notifications' ? <em>0</em> : null}</button>)}</nav>
      <div className="cp-public-help"><HelpCircle size={19} /><span><strong>Need help?</strong><small>Contact your supplier</small></span><ChevronRight size={16} /></div>
    </aside>
    <section className="cp-public-main">
      <header><button className="cp-mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div><small>{new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: '2-digit' }).format(new Date()).toUpperCase()}</small><strong>Good morning, {user.name.split(' ')[0]}</strong></div><div className="cp-public-header-actions"><button><Search size={19} /></button><button><Bell size={19} /></button><button onClick={onSignOut} title="Sign out"><LogOut size={18} /></button></div></header>
      {active === 'Dashboard' ? <CustomerPortalDashboard organizationId={portalContext.organizationId} customerId={portalContext.customerId} supplierName={supplierName} onOpenOrders={() => setActive('My Active Orders')} /> : active === 'My Active Orders' ? <CustomerPortalDashboard view="orders" organizationId={portalContext.organizationId} customerId={portalContext.customerId} supplierName={supplierName} onOpenOrders={() => undefined} /> : <div className="cp-section-placeholder"><span><Settings size={28} /></span><small>CUSTOMER PORTAL</small><h1>{active}</h1><p>This section is ready in the portal navigation. Its operational content and permissions will be connected in the next phase.</p><button onClick={() => setActive('Dashboard')}>Return to dashboard</button></div>}
    </section>
  </main>;
}

type LoginProps = { onSignIn: (email: string, password: string) => Promise<string | null>; onMicrosoft: () => Promise<string | null>; onGoogle: () => Promise<string | null>; onHome: () => void };
export function CustomerPortalLogin({ onSignIn, onMicrosoft, onGoogle, onHome }: LoginProps) {
  const [busy, setBusy] = React.useState(false); const [message, setMessage] = React.useState<string | null>(null);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setMessage(await onSignIn(String(data.get('email')), String(data.get('password')))); setBusy(false); };
  const oauth = async (fn: () => Promise<string | null>) => { setBusy(true); setMessage(await fn()); setBusy(false); };
  return <main className="cp-login">
    <section className="cp-login-story"><div className="cp-login-logo cp-login-product-badge"><img src="/assets/workspace/manufacturing-ops-logo.png" alt="YVIMO Manufacturing Ops" /><span><strong>Customer Portal</strong><small>MANUFACTURING OPS</small></span></div><div><small>CUSTOMER PORTAL</small><h1>Everything you need to know about your work.</h1><p>Secure, direct visibility into your orders, tools, documents, and shipments.</p><div><span><ClipboardList size={20} /> Real-time order status</span><span><Wrench size={20} /> Complete tool traceability</span><span><FileText size={20} /> Documents in one place</span></div></div><footer>Powered by YVIMO Manufacturing Ops</footer></section>
    <section className="cp-login-form-wrap"><button className="cp-login-close" onClick={onHome}><X size={18} /></button><form onSubmit={submit}><div className="cp-login-form-logo"><div><strong>Welcome back</strong><small>Sign in to your customer portal</small></div></div><label>Email address<div><UserRound size={18} /><input name="email" type="email" autoComplete="email" placeholder="you@company.com" required /></div></label><label>Password<div><ShieldCheck size={18} /><input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required /></div></label><button className="cp-login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'} <ChevronRight size={17} /></button>{message ? <p className="cp-login-message">{message}</p> : null}<div className="cp-login-divider"><span>or continue with</span></div><div className="cp-login-oauth"><button type="button" disabled={busy} onClick={() => void oauth(onMicrosoft)}>Microsoft</button><button type="button" disabled={busy} onClick={() => void oauth(onGoogle)}>Google</button></div><p className="cp-login-assistance">Access is invitation-only. Contact your supplier if you need an account.</p></form></section>
  </main>;
}
