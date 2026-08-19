import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ChevronDown, LoaderCircle, Plus, Search, UserPlus, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import './healthPatients.css';

type PatientRow = {
  id: string;
  organization_id: string;
  curp: string;
  medical_record_number: string;
  full_name: string;
  sex: 'Male' | 'Female';
  birth_date: string;
  created_at: string;
};

type Props = {
  organizationId: string;
  organizationName: string;
  onNavigate: (path: string) => void;
  t: (text: string) => string;
};

const emptyForm = { fullName: '', curp: '', medicalRecordNumber: '', sex: '' as '' | PatientRow['sex'] };

function getBirthDateFromCurp(curp: string): string | null {
  if (!/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(curp)) return null;
  const yearPart = Number(curp.slice(4, 6));
  const month = Number(curp.slice(6, 8));
  const day = Number(curp.slice(8, 10));
  const century = /[A-Z]/.test(curp.charAt(16)) ? 2000 : 1900;
  const year = century + yearPart;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getAgeFromBirthDate(birthDate: string, today = new Date()) {
  const [year, month, day] = birthDate.split('-').map(Number);
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  return age;
}

function HealthSexDropdown({ value, onChange, t }: { value: '' | PatientRow['sex']; onChange: (value: PatientRow['sex']) => void; t: (text: string) => string }) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ top: 0, left: 0, width: 0 });
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const options: PatientRow['sex'][] = ['Male', 'Female'];

  const toggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }
    setOpen((current) => !current);
  };

  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [open]);

  return <>
    <button ref={triggerRef} className={open ? 'health-sex-trigger open' : 'health-sex-trigger'} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={toggle}>
      <span className={value ? '' : 'placeholder'}>{value ? t(value) : t('Select sex')}</span><ChevronDown size={17} />
    </button>
    {open && typeof document !== 'undefined' ? createPortal(
      <div className="health-sex-portal" role="listbox" style={{ top: position.top, left: position.left, width: position.width }}>
        {options.map((option) => <button className={value === option ? 'active' : ''} type="button" role="option" aria-selected={value === option} key={option} onClick={() => { onChange(option); setOpen(false); }}><span>{t(option)}</span>{value === option ? <Check size={16} /> : null}</button>)}
      </div>, document.body) : null}
  </>;
}

export function HealthPatientsWorkspace({ organizationId, organizationName, onNavigate, t }: Props) {
  const [patients, setPatients] = React.useState<PatientRow[]>([]);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const [formError, setFormError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const loadPatients = React.useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('health_patients')
      .select('id, organization_id, curp, medical_record_number, full_name, sex, birth_date, created_at')
      .eq('organization_id', organizationId)
      .order('full_name', { ascending: true });
    if (error) {
      console.warn('Unable to load patients', error);
      setLoadError('Patients could not be loaded. Confirm that migration 121 has been applied.');
      setPatients([]);
    } else {
      setPatients((data ?? []) as PatientRow[]);
    }
    setLoading(false);
  }, [organizationId]);

  React.useEffect(() => { void loadPatients(); }, [loadPatients]);

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const visiblePatients = normalizedSearch
    ? patients.filter((patient) => [patient.full_name, patient.curp, patient.medical_record_number]
      .some((value) => value.toLocaleLowerCase().includes(normalizedSearch)))
    : patients;

  const openCreateDialog = () => {
    setForm(emptyForm);
    setFormError('');
    setDialogOpen(true);
  };

  const createPatient = async (event: React.FormEvent) => {
    event.preventDefault();
    const fullName = form.fullName.trim().replace(/\s+/g, ' ');
    const curp = form.curp.trim().toUpperCase();
    const medicalRecordNumber = form.medicalRecordNumber.trim().toUpperCase();
    const birthDate = getBirthDateFromCurp(curp);
    if (!fullName || !curp || !medicalRecordNumber || !form.sex) {
      setFormError('Full name, CURP, medical record number, and sex are required.');
      return;
    }
    if (curp.length !== 18) {
      setFormError('CURP must contain exactly 18 characters.');
      return;
    }
    if (!birthDate || getAgeFromBirthDate(birthDate) < 0 || getAgeFromBirthDate(birthDate) > 130) {
      setFormError('CURP does not contain a valid birth date.');
      return;
    }
    setSaving(true);
    setFormError('');
    const { data, error } = await supabase
      .from('health_patients')
      .insert({ organization_id: organizationId, full_name: fullName, curp, medical_record_number: medicalRecordNumber, sex: form.sex, birth_date: birthDate })
      .select('id, organization_id, curp, medical_record_number, full_name, sex, birth_date, created_at')
      .single();
    if (error) {
      console.warn('Unable to create patient', error);
      setFormError(error.code === '23505' ? 'This CURP or medical record number is already registered in this organization.' : 'The patient could not be registered.');
    } else {
      setPatients((current) => [...current, data as PatientRow].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setDialogOpen(false);
      setForm(emptyForm);
    }
    setSaving(false);
  };

  const derivedBirthDate = getBirthDateFromCurp(form.curp);
  const derivedAge = derivedBirthDate ? getAgeFromBirthDate(derivedBirthDate) : null;

  return (
    <div className="health-patients-page">
      <header className="health-patients-header">
        <button className="health-patients-back" type="button" onClick={() => onNavigate('/workspace/health-apps')}><ArrowLeft size={17} /> {t('Health Apps')}</button>
        <div>
          <span>YVIMO HEALTH / PATIENTS</span>
          <h1>{t('Patients')}</h1>
          <p>{t('Organization patient directory and medical record index.')}</p>
        </div>
        <button className="health-patients-add" type="button" onClick={openCreateDialog}><Plus size={18} /> {t('Add patient')}</button>
      </header>

      <section className="health-patients-toolbar">
        <label className="health-patients-search">
          <span>{t('Search patients')}</span>
          <span><Search size={19} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={t('Name, CURP, or medical record number')} /></span>
        </label>
      </section>

      <section className="health-patients-register">
        <div className="health-patients-register-heading">
          <div><span>{t('Patient register')}</span><h2>{t('Registered patients')}</h2></div>
          <strong>{visiblePatients.length} {t('showing')} / {patients.length} {t('total')}</strong>
        </div>
        {loading ? <div className="health-patients-state"><LoaderCircle className="spin" size={25} /> {t('Loading patients...')}</div>
          : loadError ? <div className="health-patients-state error">{t(loadError)}<button type="button" onClick={() => void loadPatients()}>{t('Try again')}</button></div>
            : visiblePatients.length === 0 ? (
              <div className="health-patients-state"><Users size={34} /><strong>{t(patients.length ? 'No patients match your search.' : 'No patients registered yet.')}</strong><p>{t(patients.length ? 'Try a different name, CURP, or record number.' : 'Add the first patient to this organization.')}</p>{!patients.length ? <button type="button" onClick={openCreateDialog}><UserPlus size={17} /> {t('Add patient')}</button> : null}</div>
            ) : (
              <div className="health-patients-table-wrap"><table><thead><tr><th>{t('Full name')}</th><th>CURP</th><th>{t('Medical record no.')}</th><th>{t('Sex')}</th><th>{t('Birth date')}</th><th>{t('Age')}</th><th>{t('Registered')}</th></tr></thead><tbody>{visiblePatients.map((patient) => <tr key={patient.id}><td><span className="health-patient-avatar">{patient.full_name.slice(0, 1).toUpperCase()}</span><strong>{patient.full_name}</strong></td><td><code>{patient.curp}</code></td><td><strong>{patient.medical_record_number}</strong></td><td>{t(patient.sex)}</td><td>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${patient.birth_date}T00:00:00Z`))}</td><td>{getAgeFromBirthDate(patient.birth_date)}</td><td>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(patient.created_at))}</td></tr>)}</tbody></table></div>
            )}
      </section>

      {dialogOpen ? <div className="health-patient-dialog-backdrop" onMouseDown={() => !saving && setDialogOpen(false)}><section className="health-patient-dialog" role="dialog" aria-modal="true" aria-labelledby="new-patient-title" onMouseDown={(event) => event.stopPropagation()}><button className="health-patient-dialog-close" type="button" aria-label={t('Close')} onClick={() => setDialogOpen(false)} disabled={saving}><X size={18} /></button><div className="health-patient-dialog-heading"><span><UserPlus size={23} /></span><div><small>YVIMO HEALTH</small><h2 id="new-patient-title">{t('Register new patient')}</h2><p>{t('The patient will belong to')} {organizationName}.</p></div></div><form onSubmit={createPatient}><label><span>{t('Full name')}</span><input autoFocus value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder={t('First name and surnames')} maxLength={180} /></label><label><span>CURP</span><input value={form.curp} onChange={(event) => setForm((current) => ({ ...current, curp: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18) }))} placeholder={t('18-character CURP')} maxLength={18} /><small>{form.curp.length}/18 {t('characters')}</small></label><label><span>{t('Medical record number')}</span><input value={form.medicalRecordNumber} onChange={(event) => setForm((current) => ({ ...current, medicalRecordNumber: event.target.value }))} placeholder="e.g. EXP-000123" maxLength={60} /></label><div className="health-patient-form-row"><label><span>{t('Sex')}</span><HealthSexDropdown value={form.sex} onChange={(sex) => setForm((current) => ({ ...current, sex }))} t={t} /></label><label><span>{t('Birth date')}</span><input className="health-derived-input" readOnly value={derivedBirthDate ?? ''} placeholder={t('Calculated from CURP')} /></label><label><span>{t('Age')}</span><input className="health-derived-input" readOnly value={derivedAge ?? ''} placeholder={t('Calculated')} /></label></div>{formError ? <p className="health-patient-form-error">{t(formError)}</p> : null}<div className="health-patient-dialog-actions"><button type="button" onClick={() => setDialogOpen(false)} disabled={saving}>{t('Cancel')}</button><button type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}{t(saving ? 'Registering...' : 'Register patient')}</button></div></form></section></div> : null}
    </div>
  );
}
