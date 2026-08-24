import React from 'react';
import { AlertTriangle, ArrowLeft, Boxes, ChevronDown, ChevronUp, CircleX, Download, Eye, EyeOff, ImagePlus, PackagePlus, Pencil, Plus, Search, Trash2, Warehouse, ZoomIn } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import './inventoryWorkspace.css';

type InventoryWorkspaceProps = {
  onNavigate: (path: string) => void;
  organizationId: string;
  organizationName: string;
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
  work_center_id: string;
  title: string;
  item_key: string;
  supplier_key: string;
  application_alias: string;
  supplier: string;
  description: string;
  quantity: number;
  minimum_quantity: number;
  image_url: string | null;
};

type WorkCenter = { id: string; code: string; name: string };
type Station = { id: string; code: string; name: string; workCenterId: string; workCenterName: string };
type ItemStation = { inventory_item_id: string; station_id: string };

const emptyItemForm = {
  title: '',
  itemKey: '',
  supplierKey: '',
  applicationAlias: '',
  supplier: '',
  description: '',
  quantity: '0',
  minimumQuantity: '0',
  sectionId: '',
  workCenterId: '',
  stationIds: [] as string[],
};

export function InventoryWorkspace({ onNavigate, organizationId, organizationName }: InventoryWorkspaceProps) {
  const [sections, setSections] = React.useState<InventorySection[]>([]);
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [stations, setStations] = React.useState<Station[]>([]);
  const [workCenters, setWorkCenters] = React.useState<WorkCenter[]>([]);
  const [selectedWorkCenterId, setSelectedWorkCenterId] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [itemStations, setItemStations] = React.useState<ItemStation[]>([]);
  const [collapsedSections, setCollapsedSections] = React.useState<Set<string>>(new Set());
  const [modal, setModal] = React.useState<'section' | 'item' | null>(null);
  const [sectionForm, setSectionForm] = React.useState({ name: '', description: '' });
  const [itemForm, setItemForm] = React.useState(emptyItemForm);
  const [itemImage, setItemImage] = React.useState<File | null>(null);
  const [itemImagePreview, setItemImagePreview] = React.useState('');
  const [editingItem, setEditingItem] = React.useState<InventoryItem | null>(null);
  const [deleteCandidate, setDeleteCandidate] = React.useState<InventoryItem | null>(null);
  const [imagePreviewItem, setImagePreviewItem] = React.useState<InventoryItem | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [reportGenerating, setReportGenerating] = React.useState<'inventory' | 'urgent' | null>(null);
  const [adjustingItemIds, setAdjustingItemIds] = React.useState<Set<string>>(new Set());
  const [message, setMessage] = React.useState('');

  const loadInventory = React.useCallback(async () => {
    setLoading(true);
    const [sectionsResponse, itemsResponse, itemStationsResponse, workCentersResponse, stationsResponse] = await Promise.all([
      supabase.from('mes_inventory_sections').select('id, name, description, position').eq('organization_id', organizationId).order('position'),
      supabase.from('mes_inventory_items').select('id, section_id, work_center_id, title, item_key, supplier_key, application_alias, supplier, description, quantity, minimum_quantity, image_url').eq('organization_id', organizationId).order('created_at'),
      supabase.from('mes_inventory_item_stations').select('inventory_item_id, station_id').eq('organization_id', organizationId),
      supabase.from('mes_work_centers').select('id, code, name').eq('organization_id', organizationId).order('name'),
      supabase.from('mes_work_center_stations').select('id, work_center_id, code, name').eq('organization_id', organizationId).order('name'),
    ]);
    const error = sectionsResponse.error || itemsResponse.error || itemStationsResponse.error || workCentersResponse.error || stationsResponse.error;
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }
    const nextWorkCenters = (workCentersResponse.data ?? []) as WorkCenter[];
    const workCenterNames = new Map(nextWorkCenters.map((center) => [center.id, center.name]));
    setWorkCenters(nextWorkCenters);
    setSelectedWorkCenterId((current) => current && nextWorkCenters.some((center) => center.id === current)
      ? current
      : nextWorkCenters.find((center) => /gleason norte/i.test(center.name))?.id ?? nextWorkCenters[0]?.id ?? '');
    setSections((sectionsResponse.data ?? []) as InventorySection[]);
    setItems((itemsResponse.data ?? []) as InventoryItem[]);
    setItemStations((itemStationsResponse.data ?? []) as ItemStation[]);
    setStations((stationsResponse.data ?? []).map((station) => ({
      id: station.id,
      code: station.code,
      name: station.name,
      workCenterId: station.work_center_id,
      workCenterName: workCenterNames.get(station.work_center_id) ?? '',
    })));
    setMessage('');
    setLoading(false);
  }, [organizationId]);

  React.useEffect(() => { void loadInventory(); }, [loadInventory]);
  React.useEffect(() => () => { if (itemImagePreview) URL.revokeObjectURL(itemImagePreview); }, [itemImagePreview]);

  const openItemModal = () => {
    setEditingItem(null);
    setItemForm({ ...emptyItemForm, sectionId: sections[0]?.id ?? '', workCenterId: selectedWorkCenterId });
    setItemImage(null);
    setItemImagePreview('');
    setMessage('');
    setModal('item');
  };

  const openEditItemModal = (item: InventoryItem) => {
    setEditingItem(item);
    setItemForm({
      title: item.title,
      itemKey: item.item_key,
      supplierKey: item.supplier_key,
      applicationAlias: item.application_alias,
      supplier: item.supplier,
      description: item.description,
      quantity: String(item.quantity),
      minimumQuantity: String(item.minimum_quantity),
      sectionId: item.section_id,
      workCenterId: item.work_center_id,
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
    if (!itemForm.title.trim() || !itemForm.itemKey.trim() || !itemForm.supplier.trim()
      || !itemForm.sectionId || !itemForm.workCenterId) return;
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
      work_center_id: itemForm.workCenterId,
      title: itemForm.title.trim(),
      item_key: itemForm.itemKey.trim(),
      supplier_key: itemForm.supplierKey.trim(),
      application_alias: itemForm.applicationAlias.trim(),
      supplier: itemForm.supplier.trim(),
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

  const adjustInventoryQuantity = async (item: InventoryItem, delta: 1 | -1) => {
    if (adjustingItemIds.has(item.id) || (delta < 0 && item.quantity <= 0)) return;
    setAdjustingItemIds((current) => new Set(current).add(item.id));
    setMessage('');
    const { data, error } = await supabase.rpc('mes_adjust_inventory_quantity', {
      p_inventory_item_id: item.id,
      p_organization_id: organizationId,
      p_delta: delta,
    });
    setAdjustingItemIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    const nextQuantity = Number(data);
    setItems((current) => current.map((candidate) => candidate.id === item.id
      ? { ...candidate, quantity: Number.isFinite(nextQuantity) ? nextQuantity : candidate.quantity + delta }
      : candidate));
  };

  const downloadInventoryReport = async (urgentOnly = false) => {
    if (reportGenerating) return;
    setReportGenerating(urgentOnly ? 'urgent' : 'inventory');
    setMessage('');
    try {
      const reportItems = urgentOnly
        ? visibleItems.filter((item) => item.quantity < item.minimum_quantity)
        : visibleItems;
      const reportSections = sections.filter((section) => reportItems.some((item) => item.section_id === section.id));
      if (urgentOnly && !reportItems.length) {
        setMessage('There are no below-minimum inventory items to include in the urgent purchase report.');
        return;
      }
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
      const margin = 38;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidth = pageWidth - (margin * 2);
      const generatedAt = new Date();
      let cursorY = margin;
      const lowStockCount = reportItems.filter((item) => item.quantity < item.minimum_quantity).length;
      const atMinimumCount = reportItems.filter((item) => item.quantity === item.minimum_quantity).length;
      const totalQuantity = reportItems.reduce((total, item) => total + Number(item.quantity), 0);

      const drawPageHeader = (continued = false) => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(230, 102, 0);
        pdf.text(`Organization: ${organizationName}`, margin, 27);
        pdf.setTextColor(71, 85, 105);
        pdf.text(`Work Center: ${selectedWorkCenter?.name ?? 'Not selected'}`, pageWidth - margin, 27, { align: 'right' });
        if (continued) {
          pdf.setTextColor(100, 116, 139);
          pdf.setFontSize(7);
          pdf.text(`${urgentOnly ? 'URGENT PURCHASE REPORT' : 'INVENTORY REPORT'} · CONTINUED`, pageWidth - margin, 39, { align: 'right' });
        }
        cursorY = 48;
      };
      const addPage = () => {
        pdf.addPage();
        drawPageHeader(true);
      };
      drawPageHeader();
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.setTextColor(7, 17, 28);
      pdf.text(urgentOnly ? 'Urgent Purchase Report' : 'Inventory Report', margin, cursorY);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(82, 98, 115);
      pdf.text(`Generated ${generatedAt.toLocaleString('en-US')}`, pageWidth - margin, cursorY, { align: 'right' });
      cursorY += 26;

      const summaries = [
        { label: 'SECTIONS', value: reportSections.length, detail: 'inventory categories', fill: [239, 246, 255], border: [59, 130, 246], text: [29, 78, 216] },
        { label: 'ITEMS', value: reportItems.length, detail: urgentOnly ? 'urgent purchase items' : 'unique inventory items', fill: [245, 243, 255], border: [139, 92, 246], text: [109, 40, 217] },
        { label: 'TOTAL QUANTITY', value: totalQuantity, detail: 'units currently recorded', fill: [236, 253, 245], border: [16, 185, 129], text: [4, 120, 87] },
        { label: 'AT MINIMUM', value: atMinimumCount, detail: 'items require attention', fill: [255, 251, 235], border: [245, 158, 11], text: [161, 98, 7] },
        { label: 'BELOW MINIMUM', value: lowStockCount, detail: 'items need replenishment', fill: [255, 241, 242], border: [239, 68, 68], text: [185, 28, 28] },
      ] as const;
      const summaryGap = 8;
      const summaryWidth = (contentWidth - summaryGap * (summaries.length - 1)) / summaries.length;
      summaries.forEach((summary, index) => {
        const x = margin + index * (summaryWidth + summaryGap);
        pdf.setFillColor(...summary.fill);
        pdf.setDrawColor(...summary.border);
        pdf.roundedRect(x, cursorY, summaryWidth, 57, 5, 5, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(...summary.text);
        pdf.text(summary.label, x + 10, cursorY + 15);
        pdf.setFontSize(16);
        pdf.text(Number(summary.value).toLocaleString(), x + 10, cursorY + 35);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.text(summary.detail, x + 10, cursorY + 49);
      });
      cursorY += 76;

      reportSections.forEach((section, sectionIndex) => {
        if (sectionIndex > 0) addPage();
        const sectionItems = reportItems.filter((item) => item.section_id === section.id);
        pdf.setFillColor(255, 247, 237);
        pdf.setDrawColor(255, 138, 31);
        pdf.roundedRect(margin, cursorY, contentWidth, 28, 5, 5, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(194, 65, 12);
        pdf.text(section.name, margin + 11, cursorY + 18);
        pdf.setFontSize(8);
        pdf.text(`${sectionItems.length} item${sectionItems.length === 1 ? '' : 's'}`, pageWidth - margin - 11, cursorY + 18, { align: 'right' });
        cursorY += 32;

        const columns = [margin + 8, margin + 116, margin + 184, margin + 254, margin + 334, margin + 424, margin + 457, margin + 490, margin + 568];
        const drawTableHeader = () => {
          pdf.setFillColor(241, 245, 249);
          pdf.rect(margin, cursorY, contentWidth, 21, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7);
          pdf.setTextColor(82, 97, 117);
          ['ITEM', 'KEY', 'SUPPLIER KEY', 'APPLICATION / ALIAS', 'SUPPLIER', 'QTY.', 'MIN.', 'STATUS', 'STATIONS'].forEach((label, index) => {
            if (index === 2) {
              pdf.text(label, columns[index] + 35, cursorY + 14, { align: 'center' });
            } else {
              pdf.text(label, columns[index], cursorY + 14);
            }
          });
          cursorY += 21;
        };
        drawTableHeader();
        if (!sectionItems.length) {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(8);
          pdf.setTextColor(100, 116, 139);
          pdf.text('No inventory items in this section.', margin + 8, cursorY + 16);
          cursorY += 30;
        }
        sectionItems.forEach((item, index) => {
          const linkedStations = itemStations.filter((link) => link.inventory_item_id === item.id)
            .map((link) => stations.find((station) => station.id === link.station_id))
            .filter(Boolean) as Station[];
          const status = item.quantity < item.minimum_quantity
            ? { label: 'Below minimum', fill: [255, 241, 242] as const, border: [239, 68, 68] as const, text: [185, 28, 28] as const }
            : item.quantity === item.minimum_quantity
              ? { label: 'At minimum', fill: [255, 248, 219] as const, border: [246, 194, 73] as const, text: [161, 98, 7] as const }
              : { label: 'In stock', fill: [236, 249, 240] as const, border: [82, 190, 121] as const, text: [22, 128, 68] as const };
          const itemLines = pdf.splitTextToSize(item.title, 100) as string[];
          const keyLines = pdf.splitTextToSize(item.item_key, 60) as string[];
          const supplierKeyLines = pdf.splitTextToSize(item.supplier_key || 'Unknown', 62) as string[];
          const applicationLines = pdf.splitTextToSize(item.application_alias || 'Unknown', 72) as string[];
          const supplierLines = pdf.splitTextToSize(item.supplier, 82) as string[];
          const descriptionLines = pdf.splitTextToSize(item.description || 'No description provided.', contentWidth - 91) as string[];
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(6.5);
          const stationPills: Array<{ label: string; x: number; y: number; width: number }> = [];
          const stationColumnWidth = pageWidth - margin - columns[8] - 8;
          let pillX = 0;
          let pillY = 0;
          (linkedStations.length ? linkedStations.map((station) => `${station.code} · ${station.name}`) : ['No stations assigned']).forEach((label) => {
            const pillWidth = Math.min(stationColumnWidth, pdf.getTextWidth(label) + 10);
            if (pillX > 0 && pillX + pillWidth > stationColumnWidth) {
              pillX = 0;
              pillY += 15;
            }
            stationPills.push({ label, x: pillX, y: pillY, width: pillWidth });
            pillX += pillWidth + 4;
          });
          const stationHeight = pillY + 14;
          const primaryRowHeight = Math.max(31, Math.max(itemLines.length, keyLines.length, supplierKeyLines.length, applicationLines.length, supplierLines.length) * 9 + 12, stationHeight + 10);
          const descriptionRowHeight = Math.max(25, descriptionLines.length * 8 + 12);
          const itemBlockHeight = primaryRowHeight + descriptionRowHeight;
          if (cursorY + itemBlockHeight > pageHeight - 34) {
            addPage();
            drawTableHeader();
          }
          const textGroupY = (lineCount: number) => cursorY + ((primaryRowHeight - (((lineCount - 1) * 9) + 8)) / 2) + 7;
          const singleLineY = textGroupY(1);
          const stationGroupHeight = pillY + 12;
          const stationGroupTop = cursorY + ((primaryRowHeight - stationGroupHeight) / 2);
          if (index % 2 === 1) {
            pdf.setFillColor(250, 252, 253);
            pdf.rect(margin, cursorY, contentWidth, itemBlockHeight, 'F');
          }
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(23, 32, 42);
          pdf.text(itemLines, columns[0], textGroupY(itemLines.length));
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(230, 102, 0);
          pdf.text(keyLines, columns[1], textGroupY(keyLines.length));
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(23, 32, 42);
          pdf.text(supplierKeyLines, columns[2] + 35, textGroupY(supplierKeyLines.length), { align: 'center' });
          pdf.text(applicationLines, columns[3], textGroupY(applicationLines.length));
          pdf.text(supplierLines, columns[4], textGroupY(supplierLines.length));
          pdf.text(Number(item.quantity).toLocaleString(), columns[5], singleLineY);
          pdf.text(Number(item.minimum_quantity).toLocaleString(), columns[6], singleLineY);
          pdf.setFillColor(...status.fill);
          pdf.setDrawColor(...status.border);
          const statusY = cursorY + ((primaryRowHeight - 15) / 2);
          pdf.roundedRect(columns[7], statusY, 70, 15, 4, 4, 'FD');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(6.2);
          pdf.setTextColor(...status.text);
          pdf.text(status.label, columns[7] + 35, statusY + 10, { align: 'center' });
          stationPills.forEach((pill) => {
            pdf.setFillColor(245, 248, 251);
            pdf.setDrawColor(207, 220, 234);
            pdf.roundedRect(columns[8] + pill.x, stationGroupTop + pill.y, pill.width, 12, 5, 5, 'FD');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(6.5);
            pdf.setTextColor(64, 84, 106);
            pdf.text(pill.label, columns[8] + pill.x + 5, stationGroupTop + 8 + pill.y, { maxWidth: pill.width - 9 });
          });
          const descriptionY = cursorY + primaryRowHeight;
          pdf.setDrawColor(226, 232, 240);
          pdf.line(margin + 8, descriptionY, pageWidth - margin - 8, descriptionY);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(6.5);
          pdf.setTextColor(100, 116, 139);
          pdf.text('DESCRIPTION', margin + 8, descriptionY + 14);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7.5);
          pdf.setTextColor(71, 85, 105);
          pdf.text(descriptionLines, margin + 79, descriptionY + 14);
          pdf.setDrawColor(244, 181, 120);
          pdf.setLineWidth(0.45);
          pdf.line(margin, cursorY + itemBlockHeight - 0.75, pageWidth - margin, cursorY + itemBlockHeight - 0.75);
          pdf.setLineWidth(0.2);
          cursorY += itemBlockHeight;
        });
        cursorY += 15;
      });

      const pageCount = pdf.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(130, 143, 157);
        pdf.text(`${organizationName} · ${selectedWorkCenter?.name ?? 'Inventory'} · ${generatedAt.toISOString().slice(0, 10)}`, margin, pageHeight - 17);
        pdf.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 17, { align: 'right' });
      }
      pdf.save(`${urgentOnly ? 'urgent-purchase-report' : 'inventory-report'}-${generatedAt.toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('Unable to generate Inventory report PDF', error);
      setMessage(`The ${urgentOnly ? 'urgent purchase' : 'Inventory'} report could not be generated. Try again.`);
    } finally {
      setReportGenerating(null);
    }
  };

  const toggleStation = (stationId: string) => setItemForm((current) => ({
    ...current,
    stationIds: current.stationIds.includes(stationId)
      ? current.stationIds.filter((id) => id !== stationId)
      : [...current.stationIds, stationId],
  }));

  const visibleItems = items.filter((item) => item.work_center_id === selectedWorkCenterId);
  const selectedWorkCenter = workCenters.find((workCenter) => workCenter.id === selectedWorkCenterId) ?? null;
  const availableItemStations = stations.filter((station) => station.workCenterId === itemForm.workCenterId);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const getSectionSearchItems = (section: InventorySection) => {
    const sectionItems = visibleItems.filter((item) => item.section_id === section.id);
    if (!normalizedSearch) return sectionItems;
    if (`${section.name} ${section.description}`.toLowerCase().includes(normalizedSearch)) return sectionItems;
    return sectionItems.filter((item) => {
      const stationText = itemStations.filter((link) => link.inventory_item_id === item.id)
        .map((link) => stations.find((station) => station.id === link.station_id))
        .filter(Boolean)
        .map((station) => `${station!.code} ${station!.name}`)
        .join(' ');
      return `${item.title} ${item.item_key} ${item.supplier_key} ${item.application_alias} ${item.supplier} ${item.description} ${item.quantity} ${item.minimum_quantity} ${stationText}`
        .toLowerCase().includes(normalizedSearch);
    });
  };

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
          <button className="inventory-report-action" type="button" disabled={loading || Boolean(reportGenerating)} onClick={() => { void downloadInventoryReport(); }}>
            <Download size={17} /> {reportGenerating === 'inventory' ? 'Generating inventory report...' : 'Generate inventory PDF report'}
          </button>
          <button className="inventory-report-action urgent" type="button" disabled={loading || Boolean(reportGenerating)} onClick={() => { void downloadInventoryReport(true); }}>
            <AlertTriangle size={17} /> {reportGenerating === 'urgent' ? 'Generating urgent report...' : 'Generate urgent purchase PDF'}
          </button>
        </div>
      </div>

      <div className="inventory-content">
        <div className="inventory-work-center-filter">
          <div className="inventory-work-center-control">
            <label htmlFor="inventory-work-center">Inventory Work Center</label>
            <select id="inventory-work-center" value={selectedWorkCenterId} onChange={(event) => setSelectedWorkCenterId(event.target.value)}>
              {workCenters.map((workCenter) => <option value={workCenter.id} key={workCenter.id}>{workCenter.code} · {workCenter.name}</option>)}
            </select>
          </div>
          <label className="inventory-search-control">
            <Search size={17} />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search inventory..." />
          </label>
          <div className="inventory-collapse-actions">
            <button type="button" onClick={() => setCollapsedSections(new Set(sections.map((section) => section.id)))}><EyeOff size={16} /> Hide all sections</button>
            <button type="button" onClick={() => setCollapsedSections(new Set())}><Eye size={16} /> Show all sections</button>
          </div>
          <span className="inventory-location-count">{visibleItems.length} item{visibleItems.length === 1 ? '' : 's'} at this location</span>
        </div>
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
          const sectionItems = getSectionSearchItems(section);
          const collapsed = normalizedSearch ? sectionItems.length === 0 : collapsedSections.has(section.id);
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
                          <button type="button" disabled={!item.image_url} aria-label={`View image for ${item.title}`} onClick={() => setImagePreviewItem(item)}><ZoomIn size={15} /></button>
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
                          <dl className="inventory-card-details">
                            <div><dt>Key</dt><dd>{item.item_key}</dd></div>
                            <div><dt>Supplier key</dt><dd>{item.supplier_key || 'Unknown'}</dd></div>
                            <div><dt>Application / alias</dt><dd>{item.application_alias || 'Unknown'}</dd></div>
                            <div><dt>Supplier</dt><dd>{item.supplier}</dd></div>
                          </dl>
                          <p>{item.description || 'No description provided.'}</p>
                          <div className="inventory-quick-adjust">
                            <span><small>Quick update</small><strong>{adjustingItemIds.has(item.id) ? 'Updating...' : 'Adjust stock by one unit'}</strong></span>
                            <div>
                              <button type="button" disabled={adjustingItemIds.has(item.id) || item.quantity <= 0} aria-label={`Remove one ${item.title}`} onClick={() => { void adjustInventoryQuantity(item, -1); }}>−</button>
                              <button className="add" type="button" disabled={adjustingItemIds.has(item.id)} aria-label={`Add one ${item.title}`} onClick={() => { void adjustInventoryQuantity(item, 1); }}>+</button>
                            </div>
                          </div>
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
                    <div className="inventory-identity-fields">
                      <label>Key<input value={itemForm.itemKey} onChange={(event) => setItemForm((current) => ({ ...current, itemKey: event.target.value }))} placeholder="GMEXCON-002" required /></label>
                      <label>Supplier key (optional)<input value={itemForm.supplierKey} onChange={(event) => setItemForm((current) => ({ ...current, supplierKey: event.target.value }))} placeholder="Supplier part number" /></label>
                    </div>
                    <div className="inventory-identity-fields">
                      <label>Application / alias (optional)<input value={itemForm.applicationAlias} onChange={(event) => setItemForm((current) => ({ ...current, applicationAlias: event.target.value }))} placeholder="Gleason CBN" /></label>
                      <label>Supplier<input value={itemForm.supplier} onChange={(event) => setItemForm((current) => ({ ...current, supplier: event.target.value }))} placeholder="Supplier name" required /></label>
                    </div>
                    <label>Section<select value={itemForm.sectionId} onChange={(event) => setItemForm((current) => ({ ...current, sectionId: event.target.value }))} required>{sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label>
                    <label>Work center<select value={itemForm.workCenterId} onChange={(event) => setItemForm((current) => ({ ...current, workCenterId: event.target.value, stationIds: [] }))} required>{workCenters.map((workCenter) => <option value={workCenter.id} key={workCenter.id}>{workCenter.code} · {workCenter.name}</option>)}</select></label>
                    <div className="inventory-quantity-fields">
                      <label>Quantity<input type="number" min="0" value={itemForm.quantity} onChange={(event) => setItemForm((current) => ({ ...current, quantity: event.target.value }))} required /></label>
                      <label>Minimum quantity<input type="number" min="0" value={itemForm.minimumQuantity} onChange={(event) => setItemForm((current) => ({ ...current, minimumQuantity: event.target.value }))} required /></label>
                    </div>
                  </div>
                </div>
                <label>Description<textarea value={itemForm.description} onChange={(event) => setItemForm((current) => ({ ...current, description: event.target.value }))} placeholder="Describe this item and its intended use." rows={3} /></label>
                <fieldset className="inventory-station-picker">
                  <legend>Machines / stations that use this item</legend>
                  <div>{availableItemStations.map((station) => <button className={itemForm.stationIds.includes(station.id) ? 'active' : ''} type="button" key={station.id} onClick={() => toggleStation(station.id)}><span>{station.code} · {station.name}</span><small>{station.workCenterName}</small></button>)}</div>
                  {!availableItemStations.length ? <small>No stations are configured for this Work Center yet.</small> : null}
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
      {imagePreviewItem?.image_url ? (
        <div className="mes-modal-backdrop inventory-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setImagePreviewItem(null);
        }}>
          <section className="inventory-image-preview-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-image-preview-title">
            <div className="inventory-modal-heading">
              <div><p className="eyebrow">Inventory Item</p><h3 id="inventory-image-preview-title">{imagePreviewItem.title}</h3></div>
              <button type="button" aria-label="Close image preview" onClick={() => setImagePreviewItem(null)}><CircleX size={19} /></button>
            </div>
            <div className="inventory-image-preview-stage">
              <img src={imagePreviewItem.image_url} alt={imagePreviewItem.title} />
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
