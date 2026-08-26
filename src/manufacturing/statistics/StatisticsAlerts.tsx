import React from 'react';
import { AlertTriangle, BellRing, Check, CheckCheck, ChevronLeft, ChevronRight, CircleX, Clock3, PackageX, Plus, Siren, Volume2, VolumeX, Wrench, X } from 'lucide-react';
import type { StatisticsAlert, StatisticsAlertType } from './statisticsAlerts';

const alertMeta: Record<StatisticsAlertType, { label: string; icon: typeof AlertTriangle }> = {
  downtime: { label: 'Downtime', icon: Wrench },
  scrap: { label: 'Scrap', icon: CircleX },
  inventory: { label: 'Critical inventory', icon: PackageX },
  overdue: { label: 'Overdue risk', icon: AlertTriangle },
  overtime: { label: 'Serial overtime', icon: Clock3 },
  manual: { label: 'Manual trigger', icon: Siren },
};

const playSoftAlertTone = (context: AudioContext) => {
  [0, .28].forEach((delay, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(index ? 720 : 570, context.currentTime + delay);
    gain.gain.setValueAtTime(.0001, context.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(.065, context.currentTime + delay + .04);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + delay + .34);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(context.currentTime + delay);
    oscillator.stop(context.currentTime + delay + .36);
  });
};

export function StatisticsAlertSlider({ alerts, onAcknowledge, onAcknowledgeAll }: { alerts: StatisticsAlert[]; onAcknowledge: (id: string) => void; onAcknowledgeAll: () => void }) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [dismissing, setDismissing] = React.useState(false);
  const [soundEnabled, setSoundEnabled] = React.useState(true);
  const lastSoundedAlert = React.useRef('');
  const soundInterval = React.useRef<number | null>(null);
  const audioContext = React.useRef<AudioContext | null>(null);
  React.useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, alerts.length - 1)));
  }, [alerts.length]);
  const stopAlertSound = React.useCallback(() => {
    if (soundInterval.current !== null) window.clearInterval(soundInterval.current);
    soundInterval.current = null;
    if (audioContext.current) void audioContext.current.close();
    audioContext.current = null;
  }, []);
  const startAlertSound = React.useCallback(() => {
    stopAlertSound();
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    audioContext.current = context;
    void context.resume().then(() => {
      playSoftAlertTone(context);
      soundInterval.current = window.setInterval(() => playSoftAlertTone(context), 1300);
    }).catch(stopAlertSound);
  }, [stopAlertSound]);
  React.useEffect(() => {
    const newestId = alerts[0]?.id ?? '';
    if (!newestId || !soundEnabled) {
      stopAlertSound();
      return undefined;
    }
    lastSoundedAlert.current = newestId;
    startAlertSound();
    return stopAlertSound;
  }, [alerts, soundEnabled, startAlertSound, stopAlertSound]);
  React.useEffect(() => {
    if (alerts.length < 2) return undefined;
    const intervalId = window.setInterval(() => setActiveIndex((current) => (current + 1) % alerts.length), 7000);
    return () => window.clearInterval(intervalId);
  }, [alerts.length]);
  if (!alerts.length) return <section className="statistics-alert-slider empty"><BellRing size={20} /><strong>No active critical notifications</strong><span>Production monitoring is live.</span></section>;
  const alert = alerts[activeIndex];
  const MetaIcon = alertMeta[alert.type].icon;
  const acknowledgeCurrent = () => {
    if (dismissing) return;
    stopAlertSound();
    setDismissing(true);
    window.setTimeout(() => {
      onAcknowledge(alert.id);
      setActiveIndex(0);
      setDismissing(false);
    }, 260);
  };
  const acknowledgeAll = () => {
    if (dismissing) return;
    stopAlertSound();
    setDismissing(true);
    window.setTimeout(() => {
      onAcknowledgeAll();
      setActiveIndex(0);
      setDismissing(false);
    }, 260);
  };
  return (
    <section className={`statistics-alert-slider ${alert.severity}${dismissing ? ' dismissing' : ''}`} aria-live="polite">
      <span className="statistics-alert-icon"><MetaIcon size={32} strokeWidth={2.2} /></span>
      <div><small>{alertMeta[alert.type].label} · {new Date(alert.createdAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</small><strong>{alert.title}</strong><p>{alert.message}</p></div>
      <span className="statistics-alert-source">{alert.source}</span>
      <div className="statistics-alert-actions">
        <button className={`sound${soundEnabled ? ' enabled' : ' muted'}`} type="button" aria-label={soundEnabled ? 'Mute alarm sound' : 'Enable alarm sound'} aria-pressed={soundEnabled} onClick={() => setSoundEnabled((enabled) => !enabled)}>{soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
        {alerts.length > 1 ? <nav aria-label="Critical notifications"><button type="button" onClick={() => setActiveIndex((activeIndex - 1 + alerts.length) % alerts.length)}><ChevronLeft size={18} /></button><b>{activeIndex + 1} / {alerts.length}</b><button type="button" onClick={() => setActiveIndex((activeIndex + 1) % alerts.length)}><ChevronRight size={18} /></button></nav> : null}
        <button className="acknowledge" type="button" disabled={dismissing} onClick={acknowledgeCurrent}><Check size={17} /> Acknowledge</button>
        <button className="acknowledge-all" type="button" disabled={dismissing} onClick={acknowledgeAll}><CheckCheck size={17} /> Acknowledge all</button>
      </div>
    </section>
  );
}

export function StatisticsAlertHistory({ alerts, onOpenManual }: { alerts: StatisticsAlert[]; onOpenManual: () => void }) {
  return (
    <section className="statistics-alert-history">
      <header><div><span><BellRing size={21} /></span><div><small>Critical monitoring</small><h3>Alarm history</h3><p>Automatic and manually triggered production alerts.</p></div></div><button type="button" onClick={onOpenManual}><Plus size={17} /> Test manual trigger</button></header>
      <div className="statistics-alert-table-wrap">
        <table><thead><tr><th>Date / time</th><th>Type</th><th>Alert</th><th>Source</th><th>Severity</th></tr></thead>
          <tbody>{alerts.length ? alerts.map((alert) => {
            const MetaIcon = alertMeta[alert.type].icon;
            return <tr key={alert.id}><td>{new Date(alert.createdAt).toLocaleString()}</td><td><span className={`statistics-alert-type ${alert.type}`}><MetaIcon size={15} />{alertMeta[alert.type].label}</span></td><td><strong>{alert.title}</strong><small>{alert.message}</small></td><td>{alert.source}</td><td><b className={`statistics-alert-severity ${alert.severity}`}>{alert.severity}</b></td></tr>;
          }) : <tr><td className="statistics-alert-empty" colSpan={5}>No alarms have been recorded.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  );
}

export function ManualAlertDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (type: StatisticsAlertType, title: string, message: string) => void }) {
  const [type, setType] = React.useState<StatisticsAlertType>('manual');
  const [title, setTitle] = React.useState('Manual production alert');
  const [message, setMessage] = React.useState('Test notification generated from Statistics.');
  return <div className="statistics-target-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="statistics-target-modal statistics-manual-alert-modal" onSubmit={(event) => { event.preventDefault(); onCreate(type, title.trim(), message.trim()); }}>
    <button className="statistics-target-modal-close" type="button" aria-label="Close" onClick={onClose}><X size={20} /></button><span className="statistics-target-modal-icon"><Siren size={24} /></span><p className="eyebrow">Alarm testing</p><h3>Send manual trigger</h3><p>Generate a notification immediately to test the Statistics alarm slider.</p>
    <label><span>Alarm type</span><select value={type} onChange={(event) => setType(event.target.value as StatisticsAlertType)}>{Object.entries(alertMeta).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}</select></label>
    <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label><span>Message</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} required /></label>
    <div><button type="button" onClick={onClose}>Cancel</button><button type="submit">Send trigger</button></div>
  </form></div>;
}
