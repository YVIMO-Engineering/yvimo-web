import React from 'react';
import { AlertTriangle, BellRing, CalendarClock, Check, LoaderCircle } from 'lucide-react';
import type { PortalNotification } from './useCustomerPortalNotifications';

type Props = {
  notifications: PortalNotification[];
  unread: number;
  loading: boolean;
  error: string;
  onAcknowledge: (key: string) => void | Promise<void>;
};

function eventStamp(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function CustomerPortalNotifications({ notifications, unread, loading, error, onAcknowledge }: Props) {
  const [filter, setFilter] = React.useState<'all' | 'unread'>('all');
  const visible = filter === 'unread' ? notifications.filter((notification) => !notification.acknowledged) : notifications;

  if (loading) return <div className="cp-dashboard-state"><LoaderCircle className="cp-spin" size={25} /><strong>Loading your notifications…</strong></div>;

  return <div className="cp-notifications-page">
    <section className="cp-notifications-heading">
      <div><small>CUSTOMER PORTAL</small><h1>Notifications</h1><p>Delivery reschedules and scrapped pieces reported on your orders.</p></div>
      <div className="cp-notifications-kpis"><span className="unread"><strong>{unread}</strong><small>NEEDS ATTENTION</small></span><span><strong>{notifications.length}</strong><small>TOTAL EVENTS</small></span></div>
    </section>
    {error ? <div className="cp-dashboard-warning">{error}</div> : null}
    <section className="cp-notifications-card">
      <header>
        <div><h2>Notification history</h2><p>Highlighted rows stay marked until you acknowledge them</p></div>
        <div className="cp-notifications-filter"><button className={filter === 'all' ? 'active' : ''} type="button" onClick={() => setFilter('all')}>All</button><button className={filter === 'unread' ? 'active' : ''} type="button" onClick={() => setFilter('unread')}>Unacknowledged{unread ? ` (${unread})` : ''}</button></div>
      </header>
      <div className="cp-notification-head"><span>Event</span><span>Order</span><span>Details</span><span>Received</span><span /></div>
      {visible.length ? visible.map((notification) => <article className={notification.acknowledged ? '' : 'unread'} key={notification.key}>
        <span className={`cp-notification-kind ${notification.kind}`}><i>{notification.kind === 'delay' ? <CalendarClock size={16} /> : <AlertTriangle size={16} />}</i><span><strong>{notification.title}</strong><small>{notification.meta}</small></span></span>
        <span className="cp-notification-order"><small>ORDER</small><strong>{notification.orderNumber}</strong></span>
        <span className="cp-notification-detail"><small>DETAILS</small><em>{notification.detail}</em></span>
        <span className="cp-notification-when"><small>RECEIVED</small><strong>{eventStamp(notification.at)}</strong></span>
        <span className="cp-notification-action">{notification.acknowledged ? <em><Check size={13} /> Acknowledged</em> : <button type="button" onClick={() => void onAcknowledge(notification.key)}>Acknowledge</button>}</span>
      </article>) : <div className="cp-notifications-empty"><span><BellRing size={24} /></span><strong>{filter === 'unread' ? 'Everything is acknowledged' : 'No notifications yet'}</strong><p>{filter === 'unread' ? 'New delivery reschedules and scrap reports will show up here.' : 'Delivery reschedules and scrap reports on your orders will appear here.'}</p></div>}
    </section>
  </div>;
}
