import React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Download, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

// Helpers shared by the OTC registries (Purchase Orders, Remissions, Invoices) and their views.

export type Currency = 'USD' | 'MXN' | 'EUR';

export type StoredFile = { name: string; path: string; type: string };

export const documentsBucket = 'mes-order-to-cash-documents';
export const documentAccept = 'application/pdf,.pdf,image/*';
export const xmlAccept = 'application/xml,text/xml,.xml';
export const currencies: Currency[] = ['USD', 'MXN', 'EUR'];
export const signedUrlSeconds = 60 * 60;

const documentExtensions = /\.(?:pdf|jpe?g|png|webp|heic|heif|avif)$/i;
const documentMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']);
const rowPageSize = 1000;

// Order-to-Cash opens a registry on one record with ?focus=<id>; the registry selects it once
// its records load and then drops the parameter from the address.
const focusParam = 'focus';

export function registryFocusPath(path: string, id: string) {
  return `${path}?${focusParam}=${encodeURIComponent(id)}`;
}

export function readFocusParam() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(focusParam) ?? '';
}

export function clearFocusParam() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(focusParam)) return;
  url.searchParams.delete(focusParam);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function single<Row>(value: Row | Row[] | null): Row | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function isPdfFile(file: { fileType: string; fileName: string }) {
  return file.fileType === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf');
}

export function isAcceptedDocument(file: File) {
  return documentExtensions.test(file.name) || documentMimeTypes.has(file.type.toLowerCase());
}

export function isXmlFile(file: File) {
  return file.name.toLowerCase().endsWith('.xml') || file.type === 'application/xml' || file.type === 'text/xml';
}

export function getDocumentMimeType(file: File) {
  if (file.type && file.type !== 'application/octet-stream') return file.type.toLowerCase();
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'xml') return 'application/xml';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return extension ? `image/${extension}` : 'image/jpeg';
}

// Registry dates are calendar days; parsing them as local dates keeps them from shifting a day.
export function formatCalendarDate(value: string) {
  if (!value) return 'Not specified';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatMoney(value: number, currency: string) {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatQuantity(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

// Amounts in several currencies are never added together; each currency is listed apart.
export function formatMoneyByCurrency(amounts: Map<string, number>) {
  const entries = Array.from(amounts.entries()).filter(([, value]) => Math.abs(value) >= 0.005);
  return entries.length ? entries.map(([currency, value]) => formatMoney(value, currency)).join(' · ') : '—';
}

export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function parseNumber(value: string) {
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return fallback;
}

export async function fetchAllRows<Row>(request: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>) {
  const rows: Row[] = [];
  for (let from = 0; ; from += rowPageSize) {
    const { data, error } = await request(from, from + rowPageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < rowPageSize) return rows;
  }
}

// Registry files live under <organization_id>/<folder>/<record_id>/.
export async function uploadRegistryFile(organizationId: string, folder: string, recordId: string, file: File): Promise<StoredFile> {
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `${organizationId}/${folder}/${recordId}/${Date.now()}-${safeFileName}`;
  const type = getDocumentMimeType(file);
  const { error } = await supabase.storage.from(documentsBucket).upload(path, file, { contentType: type });
  if (error) throw error;
  return { name: file.name, path, type };
}

export async function removeRegistryFiles(paths: string[]) {
  const existing = paths.filter(Boolean);
  if (existing.length) await supabase.storage.from(documentsBucket).remove(existing);
}

// Signed URL of a stored file. `key` identifies the record, so switching records never shows
// the previous record's document while the new URL loads.
export function useSignedDocumentUrl(key: string, filePath: string) {
  const [state, setState] = React.useState<{ key: string; filePath: string; url: string; error: string }>({ key: '', filePath: '', url: '', error: '' });

  React.useEffect(() => {
    if (!key || !filePath) {
      setState({ key: '', filePath: '', url: '', error: '' });
      return;
    }
    let cancelled = false;
    void supabase.storage.from(documentsBucket).createSignedUrl(filePath, signedUrlSeconds).then(({ data, error }) => {
      if (cancelled) return;
      setState(error || !data?.signedUrl
        ? { key, filePath, url: '', error: error?.message || 'This document could not be opened.' }
        : { key, filePath, url: data.signedUrl, error: '' });
    });
    return () => { cancelled = true; };
  }, [key, filePath]);

  const current = state.key === key && state.filePath === filePath;
  return { url: current ? state.url : '', error: current ? state.error : '' };
}

export async function openSignedFile(filePath: string) {
  const { data, error } = await supabase.storage.from(documentsBucket).createSignedUrl(filePath, signedUrlSeconds);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'This file could not be opened.');
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

export function DocumentFrame({ url, title, isPdf }: { url: string; title: string; isPdf: boolean }) {
  return isPdf
    ? <iframe src={`${url}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`} title={title} />
    : <img src={url} alt={title} draggable={false} />;
}

type DocumentPreviewModalProps = { subtitle: string; title: string; url: string; isPdf: boolean; onClose: () => void };

export function DocumentPreviewModal({ subtitle, title, url, isPdf, onClose }: DocumentPreviewModalProps) {
  const titleId = React.useId();
  return createPortal((
    <div className="supplier-modal-backdrop otc-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="supplier-modal production-order-preview-modal otc-preview-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button className="supplier-modal-close" type="button" onClick={onClose} aria-label="Close document preview"><X size={18} /></button>
        <div>
          <div className="supplier-modal-header">
            <span>{subtitle}</span>
            <strong id={titleId}>{title}</strong>
          </div>
          <div className={`supplier-document-preview production-order-preview-frame ${isPdf ? 'pdf' : 'image'}`}>
            <DocumentFrame url={url} title={`Preview ${title}`} isPdf={isPdf} />
          </div>
          <div className="supplier-modal-actions">
            <a className="otc-preview-download" href={url} target="_blank" rel="noreferrer"><Download size={15} /> Open in new tab</a>
            <button type="button" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}

export type SearchSelectGroup<Item> = { id: string; label?: string; items: Item[] };

type SearchSelectProps<Item extends { id: string }> = {
  groups: Array<SearchSelectGroup<Item>>;
  currentId: string;
  placeholder: string;
  emptyText: string;
  disabled: boolean;
  // Text of the picked item, shown in the box while the list is closed.
  selectedLabel: (item: Item) => string;
  searchValues: (item: Item, group: SearchSelectGroup<Item>) => string[];
  renderItem: (item: Item) => React.ReactNode;
  onPick: (id: string) => void;
};

// yvimo search dropdown of the OTC forms: type to filter, arrows and Enter to pick. The list
// floats under the box so it does not push the rest of the form.
export function SearchSelect<Item extends { id: string }>({ groups, currentId, placeholder, emptyText, disabled, selectedLabel, searchValues, renderItem, onPick }: SearchSelectProps<Item>) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listId = React.useId();

  const current = React.useMemo(() => groups.flatMap((group) => group.items).find((item) => item.id === currentId) ?? null, [groups, currentId]);
  const matchingGroups = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups.filter((group) => group.items.length);
    return groups
      .map((group) => ({ ...group, items: group.items.filter((item) => searchValues(item, group).some((value) => value.toLowerCase().includes(needle))) }))
      .filter((group) => group.items.length);
  }, [groups, query, searchValues]);
  const matches = React.useMemo(() => matchingGroups.flatMap((group) => group.items), [matchingGroups]);

  React.useEffect(() => { setActiveIndex(0); }, [query]);

  const pick = (item: Item) => {
    setOpen(false);
    setQuery('');
    onPick(item.id);
  };

  const currentLabel = current ? selectedLabel(current) : '';
  let optionIndex = -1;
  return (
    <div className={`otc-po-picker floating${open ? ' open' : ''}`}>
      <div className="otc-po-picker-input">
        <Search size={15} />
        <input
          value={open ? query : currentLabel}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { setOpen(false); setQuery(''); }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter' && open && matches[activeIndex]) {
              event.preventDefault();
              pick(matches[activeIndex]);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder={currentLabel || placeholder}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        <ChevronDown size={15} />
      </div>
      {open ? (
        <ul id={listId} role="listbox" className="otc-po-picker-list">
          {matchingGroups.map((group) => (
            <React.Fragment key={group.id}>
              {group.label ? <li className="otc-po-picker-group" role="presentation">{group.label}</li> : null}
              {group.items.map((item) => {
                optionIndex += 1;
                const index = optionIndex;
                return (
                  <li
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`${index === activeIndex ? 'active' : ''}${item.id === currentId ? ' current' : ''}`}
                    key={item.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pick(item)}
                  >
                    {renderItem(item)}
                    {item.id === currentId ? <Check size={15} /> : null}
                  </li>
                );
              })}
            </React.Fragment>
          ))}
          {!matches.length ? <li className="otc-po-picker-empty">{query.trim() ? `Nothing matches "${query.trim()}".` : emptyText}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
