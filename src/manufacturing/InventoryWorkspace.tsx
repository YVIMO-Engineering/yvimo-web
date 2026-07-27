import React from 'react';
import { AlertTriangle, ArrowLeft, Boxes, ChevronDown, ChevronUp, CircleX, ImagePlus, PackagePlus, Pencil, Plus, Trash2, Warehouse } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import './inventoryWorkspace.css';

type InventoryWorkspaceProps = {
  onNavigate: (path: string) => void;
  organizationId: string;
};

type InventorySection = {
  id: string;
  name: string;
  description: string;
  position: number;
};

type InventoryItem = {
  id: string;
  section_id: string;
  title: string;
  description: string;
  quantity: number;
  minimum_quantity: number;
  image_url: string | null;
};

type Station = { id: string; code: string; name: string; workCenterName: string };
type ItemStation = { inventory_item_id: string; station_id: string };

const emptyItemForm = { title: '', description: '', quantity: '0', minimumQuantity: '0', sectionId: '', stationIds: [] as string[] };

export function InventoryWorkspace({ onNavigate, organizationId }: InventoryWorkspaceProps) {
  const [sections, setSections] = React.useState<InventorySection[]>([]);
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [stations, setStations] = React.useState<Station[]>([]);
  const [itemStations, setItemStations] = React.useState<ItemStation[]>([]);
  const [collapsedSections, setCollapsedSections] = React.useState<Set<string>>(new Set());
  const [modal, setModal] = React.useState<'section' | 'item' | null>(null);
  const [sectionForm, setSectionForm] = React.useState({ name: '', description: '' });
  const [itemForm, setItemForm] = React.useState(emptyItemForm);
  const [itemImage, setItemImage] = React.useState<File | null>(null);
  const [itemImagePreview, setItemImagePreview] = React.useState('');
  const [editingItem, setEditingItem] = React.useState<InventoryItem | null>(null);
  const [deleteCandidate, setDeleteCandidate] = React.useState<InventoryItem | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const loadInventory = React.useCallback(async () => {
    setLoading(true);
    const [sectionsResponse, itemsResponse, itemStationsResponse, workCentersResponse, stationsResponse] = await Promise.all([
      supabase.from('mes_inventory_sections').select('id, name, description, position').eq('organization_id', organizationId).order('position'),
      supabase.from('mes_inventory_items').select('id, section_id, title, description, quantity, minimum_quantity, image_url').eq('organization_id', organizationId).order('created_at'),
      supabase.from('mes_inventory_item_stations').select('inventory_item_id, station_id').eq('organization_id', organizationId),
      supabase.from('mes_work_centers').select('id, name').eq('organization_id', organizationId),
      supabase.from('mes_work_center_stations').select('id, work_center_id, code, name').eq('organization_id', organizationId).order('name'),
    ]);
    const error = sectionsResponse.error || itemsResponse.error || itemStationsResponse.error || workCentersResponse.error || stationsResponse.error;
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }
    const workCenterNames = new Map((workCentersResponse.data ?? []).map((center) => [center.id, center.name]));
    setSections((sectionsResponse.data ?? []) as InventorySection[]);
    setItems((itemsResponse.data ?? []) as InventoryItem[]);
    setItemStations((itemStationsResponse.data ?? []) as ItemStation[]);
    setStations((stationsResponse.data ?? []).map((station) => ({
      id: station.id,
      code: station.code,
      name: station.name,
      workCenterName: workCenterNames.get(station.work_center_id) ?? '',
    })));
    setMessage('');
    setLoading(false);
  }, [organizationId]);

  React.useEffect(() => { void loadInventory(); }, [loadInventory]);
  React.useEffect(() => () => { if (itemImagePreview) URL.revokeObjectURL(itemImagePreview); }, [itemImagePreview]);

  const openItemModal = () => {
    setEditingItem(null);
    setItemForm({ ...emptyItemForm, sectionId: sections[0]?.id ?? '' });
    setItemImage(null);
    setItemImagePreview('');
    setMessage('');
    setModal('item');
  };

  const openEditItemModal = (item: InventoryItem) => {
    setEditingItem(item);
    setItemForm({
      title: item.title,
      description: item.description,
      quantity: String(item.quantity),
      minimumQuantity: String(item.minimum_quantity),
      sectionId: item.section_id,
      stationIds: itemStations.filter((link) => link.inventory_item_id === item.id).map((link) => link.station_id),
    });
    setItemImage(null);
    setItemImagePreview(item.image_url ?? '');
    setMessage('');
    setModal('item');
  };

  const saveSection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sectionForm.name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('mes_inventory_sections').insert({
      organization_id: organizationId,
      name: sectionForm.name.trim(),
      description: sectionForm.description.trim(),
      position: sections.length,
    });
    setSaving(false);
    if (error) return setMessage(error.message);
    setSectionForm({ name: '', description: '' });
    setModal(null);
    await loadInventory();
  };

  const saveItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!itemForm.title.trim() || !itemForm.sectionId) return;
    setSaving(true);
    setMessage('');
    let imageUrl: string | null = null;
    if (itemImage) {
      const extension = itemImage.name.split('.').pop() || 'jpg';
      const imagePath = `${organizationId}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage.from('mes-inventory-images').upload(imagePath, itemImage);
      if (upload.error) {
        setSaving(false);
        return setMessage(upload.error.message);
      }
      imageUrl = supabase.storage.from('mes-inventory-images').getPublicUrl(imagePath).data.publicUrl;
    }
    const itemPayload = {
      organization_id: organizationId,
      section_id: itemForm.sectionId,
      title: itemForm.title.trim(),
      description: itemForm.description.trim(),
      quantity: Math.max(0, Number(itemForm.quantity) || 0),
      minimum_quantity: Math.max(0, Number(itemForm.minimumQuantity) || 0),
      ...(imageUrl ? { image_url: imageUrl } : {}),
    };
    const itemRequest = editingItem
      ? supabase.from('mes_inventory_items').update(itemPayload).eq('id', editingItem.id).eq('organization_id', organizationId)
      : supabase.from('mes_inventory_items').insert({ ...itemPayload, image_url: imageUrl });
    const { data, error } = await itemRequest.select('id').single();
    if (error || !data) {
      setSaving(false);
      return setMessage(error?.message ?? 'Unable to create this inventory item.');
    }
    if (editingItem) {
      const clearStations = await supabase.from('mes_inventory_item_stations').delete()
        .eq('organization_id', organizationId).eq('inventory_item_id', editingItem.id);
      if (clearStations.error) {
        setSaving(false);
        return setMessage(clearStations.error.message);
      }
    }
    if (itemForm.stationIds.length) {
      const stationResult = await supabase.from('mes_inventory_item_stations').insert(itemForm.stationIds.map((stationId) => ({
        organization_id: organizationId,
        inventory_item_id: data.id,
        station_id: stationId,
      })));
      if (stationResult.error) {
        setSaving(false);
        return setMessage(stationResult.error.message);
      }
    }
    setSaving(false);
    setModal(null);
    await loadInventory();
  };

  const deleteItem = async () => {
    if (!deleteCandidate) return;
    setSaving(true);
    const { error } = await supabase.from('mes_inventory_items').delete()
      .eq('organization_id', organizationId).eq('id', deleteCandidate.id);
    setSaving(false);
    if (error) {
      setMessage(error.message);
      setDeleteCandidate(null);
      return;
    }
    setDeleteCandidate(null);
    await loadInventory();
  };

  const toggleStation = (stationId: string) => setItemForm((current) => ({
    ...current,
    stationIds: current.stationIds.includes(stationId)
      ? current.stationIds.filter((id) => id !== stationId)
      : [...current.stationIds, stationId],
  }));

  return (
    <section className="mes-workspace-panel inventory-workspace-panel">
      <div className="mes-screen-header inventory-screen-header">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes')}>
          <ArrowLeft size={16} /> MES Applications
        </button>
        <div className="mes-workspace-heading">
          <p className="eyebrow">MES / Inventory</p>
          <h2>Inventory</h2>
          <p>Track materials, components, work in progress, and finished goods across manufacturing locations.</p>
        </div>
        <div className="inventory-header-actions">
          <button type="button" onClick={() => { setSectionForm({ name: '', description: '' }); setMessage(''); setModal('section'); }}><Plus size={17} /> Add section</button>
          <button className="primary" type="button" disabled={!sections.length} onClick={openItemModal}><PackagePlus size={18} /> Add inventory item</button>
        </div>
      </div>

      <div className="inventory-content">
        {message && !modal ? <div className="inventory-message" role="alert">{message}</div> : null}
        {loading ? <div className="inventory-empty">Loading inventory...</div> : null}
        {!loading && !sections.length ? (
          <div className="inventory-empty">
            <Warehouse size={34} />
            <strong>Your inventory is ready to be organized.</strong>
            <span>Create the first section, then add inventory items to it.</span>
            <button type="button" onClick={() => setModal('section')}><Plus size={16} /> Create first section</button>
          </div>
        ) : null}
        {sections.map((section) => {
          const sectionItems = items.filter((item) => item.section_id === section.id);
          const collapsed = collapsedSections.has(section.id);
          return (
            <section className={['inventory-section', collapsed ? 'collapsed' : ''].join(' ')} key={section.id}>
              <div className="inventory-section-heading">
                <div>
                  <span className="inventory-section-icon"><Boxes size={19} /></span>
                  <span><strong>{section.name}</strong><small>{section.description || `${sectionItems.length} inventory items`}</small></span>
                </div>
                <button type="button" onClick={() => setCollapsedSections((current) => {
                  const next = new Set(current);
                  if (next.has(section.id)) next.delete(section.id); else next.add(section.id);
                  return next;
                })}>
                  {collapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
                  {collapsed ? 'Show' : 'Hide'}
                </button>
              </div>
              {!collapsed ? (
                <div className="inventory-card-grid">
                  {sectionItems.map((item) => {
                    const linkedStations = itemStations.filter((link) => link.inventory_item_id === item.id)
                      .map((link) => stations.find((station) => station.id === link.station_id)).filter(Boolean) as Station[];
                    return (
                      <article className="inventory-card" key={item.id}>
                        <div className="inventory-card-actions">
                          <button type="button" aria-label={`Edit ${item.title}`} onClick={() => openEditItemModal(item)}><Pencil size={15} /></button>
                          <button className="danger" type="button" aria-label={`Delete ${item.title}`} onClick={() => setDeleteCandidate(item)}><Trash2 size={15} /></button>
                        </div>
                        <div className="inventory-card-image">
                          {item.image_url ? <img src={item.image_url} alt="" /> : <Boxes size={42} />}
                        </div>
                        <div className="inventory-card-body">
                          <div className="inventory-card-title">
                            <h3>{item.title}</h3>
                            <span className={item.quantity < item.minimum_quantity ? 'low' : item.quantity === item.minimum_quantity ? 'minimum' : 'healthy'}>
                              <small>Quantity</small><strong>{item.quantity.toLocaleString()}</strong><em>Min. {item.minimum_quantity.toLocaleString()}</em>
                            </span>
                          </div>
                          <p>{item.description || 'No description provided.'}</p>
                          <div className="inventory-station-list">
                            <small>Used by stations</small>
                            <div>{linkedStations.length ? linkedStations.map((station) => <span key={station.id}>{station.code} · {station.name}</span>) : <em>No stations assigned</em>}</div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {!sectionItems.length ? <div className="inventory-section-empty">No items in this section yet.</div> : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {modal ? (
        <div className="mes-modal-backdrop inventory-modal-backdrop" role="presentation">
          <section className="mes-order-modal inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-modal-title">
            <div className="inventory-modal-heading">
              <div><p className="eyebrow">MES / Inventory</p><h3 id="inventory-modal-title">{modal === 'section' ? 'Add inventory section' : editingItem ? 'Edit inventory item' : 'Add inventory item'}</h3></div>
              <button type="button" aria-label="Close" onClick={() => setModal(null)}><CircleX size={19} /></button>
            </div>
            {modal === 'section' ? (
              <form onSubmit={saveSection}>
                <label>Section name<input value={sectionForm.name} onChange={(event) => setSectionForm((current) => ({ ...current, name: event.target.value }))} placeholder="Raw materials" required /></label>
                <label>Description<textarea value={sectionForm.description} onChange={(event) => setSectionForm((current) => ({ ...current, description: event.target.value }))} placeholder="Materials used during production." rows={3} /></label>
                {message ? <div className="inventory-message" role="alert">{message}</div> : null}
                <div className="mes-order-form-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add section'}</button></div>
              </form>
            ) : (
              <form onSubmit={saveItem}>
                <div className="inventory-item-form-grid">
                  <label className="inventory-image-picker">
                    Image
                    <span>{itemImagePreview ? <img src={itemImagePreview} alt="Selected inventory item" /> : <><ImagePlus size={28} /><small>Select a square image</small></>}</span>
                    <input type="file" accept="image/*" onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setItemImage(file);
                      setItemImagePreview(file ? URL.createObjectURL(file) : '');
                    }} />
                  </label>
                  <div className="inventory-item-fields">
                    <label>Title<input value={itemForm.title} onChange={(event) => setItemForm((current) => ({ ...current, title: event.target.value }))} placeholder="Carbide insert" required /></label>
                    <label>Section<select value={itemForm.sectionId} onChange={(event) => setItemForm((current) => ({ ...current, sectionId: event.target.value }))} required>{sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label>
                    <div className="inventory-quantity-fields">
                      <label>Quantity<input type="number" min="0" value={itemForm.quantity} onChange={(event) => setItemForm((current) => ({ ...current, quantity: event.target.value }))} required /></label>
                      <label>Minimum quantity<input type="number" min="0" value={itemForm.minimumQuantity} onChange={(event) => setItemForm((current) => ({ ...current, minimumQuantity: event.target.value }))} required /></label>
                    </div>
                  </div>
                </div>
                <label>Description<textarea value={itemForm.description} onChange={(event) => setItemForm((current) => ({ ...current, description: event.target.value }))} placeholder="Describe this item and its intended use." rows={3} /></label>
                <fieldset className="inventory-station-picker">
                  <legend>Machines / stations that use this item</legend>
                  <div>{stations.map((station) => <button className={itemForm.stationIds.includes(station.id) ? 'active' : ''} type="button" key={station.id} onClick={() => toggleStation(station.id)}><span>{station.code} · {station.name}</span><small>{station.workCenterName}</small></button>)}</div>
                  {!stations.length ? <small>No stations are configured yet.</small> : null}
                </fieldset>
                {message ? <div className="inventory-message" role="alert">{message}</div> : null}
                <div className="mes-order-form-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving...' : editingItem ? 'Save changes' : 'Add item'}</button></div>
              </form>
            )}
          </section>
        </div>
      ) : null}
      {deleteCandidate ? (
        <div className="mes-modal-backdrop inventory-modal-backdrop" role="presentation">
          <section className="mes-confirm-modal danger" role="dialog" aria-modal="true" aria-labelledby="inventory-delete-title">
            <span className="mes-confirm-icon"><AlertTriangle size={24} /></span>
            <h3 id="inventory-delete-title">Delete inventory item?</h3>
            <p><strong>{deleteCandidate.title}</strong> and its station associations will be permanently removed.</p>
            <div className="mes-confirm-actions">
              <button type="button" onClick={() => setDeleteCandidate(null)}>Cancel</button>
              <button className="danger" type="button" disabled={saving} onClick={() => { void deleteItem(); }}>{saving ? 'Deleting...' : 'Delete item'}</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
