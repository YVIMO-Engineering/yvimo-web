import React from "react";
import {
  ArrowLeft,
  Calculator,
  Check,
  ChevronDown,
  Plus,
  Search,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { exportElementScreenshotToSinglePagePdf } from "../lib/screenshotPdfExport";
import { QuotationV1Sections } from "./QuotationV1Sections";
import { QuotationV1Details } from "./QuotationV1Details";
import { QuotationAddonCatalogPicker } from "./QuotationAddonCatalogPicker";
import { QuotationAddonAdvancedFields } from "./QuotationAddonAdvancedFields";
import {
  QuotationDamageSurchargeStep,
  type DamagePricingMethod,
} from "./QuotationDamageSurchargeStep";
import {
  calculateQuotationTotals,
  engineeringDefaults,
  legacyRecurringItem,
  recurringDefaults,
  type QuotationItem,
  type ServiceHistory,
} from "./quotationV1";
import "./quotations.css";

type Props = {
  onNavigate: (path: string) => void;
  organizationId: string;
  organizationName: string;
  organizationLogoUrl?: string;
};
type QuotationStatus = "draft" | "sent" | "approved" | "declined";
type PartType = "Hob" | "Shaper" | "Shaper with shank" | "Shaver" | "Other";
type Customer = { id: string; customer_name: string };
type Quotation = {
  id: string;
  quotation_number: string;
  customer_id: string | null;
  client_name: string;
  part_type: PartType;
  tool_id: string;
  serial_number: string;
  length_mm: number;
  diameter_mm: number;
  damage_inches: number;
  measurement_unit: "in" | "mm";
  coating_type: string;
  design: string;
  work_center: string;
  machine_time_minutes: number;
  coating_price: number;
  machine_price: number;
  damage_surcharge: number;
  total_price: number;
  pricing_status: "calculated" | "manual-review";
  status: QuotationStatus;
  valid_until: string;
  created_at: string;
  service_history?: ServiceHistory | null;
  sharpening_program_id?: string | null;
  measurement_program_id?: string | null;
  program_revision?: string | null;
  program_status?: string | null;
};

const hobLengths = [
  12.7, 19.5, 25.4, 38.1, 50.8, 63.5, 76.2, 88.9, 114.3, 139.7, 152.4, 203.2,
  228.6, 254, 279.4, 304.8, 355.6, 406.4, 457.2, 508,
];
const hobDiameters = [76.2, 101.6, 114.3, 152.4, 203.2, 304.8];
const hobAlcrona = [
  [21.51, 21.51, 21.51, 21.51, 26.65, 36.36],
  [27.69, 29.94, 29.94, 33.79, 45.39, 64.84],
  [31.39, 34.84, 34.84, 38.61, 54.74, 79.95],
  [38.29, 41.58, 41.58, 47.44, 62.73, 101.3],
  [38.53, 41.9, 41.9, 54.1, 73.41, 119.4],
  [45.11, 49.12, 49.12, 63.81, 89.94, 147.84],
  [56.19, 61.49, 61.49, 80.19, 116.91, 193.73],
  [62.77, 68.79, 68.79, 90.14, 135.01, 222.75],
  [69.03, 75.45, 99.85, 99.85, 153.19, 252.85],
  [74.49, 75.45, 99.85, 99.85, 165.6, 278.13],
  [75.45, 75.45, 99.85, 99.85, 180.85, 322.68],
  [99.85, 99.85, 110.05, 110.05, 193.69, 367.63],
  [132.04, 132.04, 137.15, 137.15, 241.93, 436.46],
  [164.23, 164.23, 164.23, 164.23, 290.17, 505.29],
  [182.25, 261.68, 261.68, 345.16, 429.44, 598.01],
  [199.07, 293.79, 293.79, 388.5, 483.22, 674.26],
  [286.77, 398.14, 398.14, 469.58, 589.98, 816.74],
  [441.48, 494.46, 494.46, 581.95, 750.52, 1017.41],
  [550.65, 590.78, 590.78, 694.33, 911.06, 1218.09],
  [659.81, 687.1, 687.1, 806.71, 1071.59, 1418.76],
];
const hobEvo = [
  [33.29, 41.04, 41.04, 41.04, 99, 99],
  [33.29, 41.04, 41.04, 41.04, 99, 99],
  [33.29, 41.04, 41.04, 41.04, 99, 99],
  [40.93, 50.43, 50.43, 50.43, 99, 99],
  [40.93, 57.41, 57.41, 57.41, 146.04, 146.04],
  [47.92, 67.78, 67.78, 67.78, 180.64, 180.64],
  [59.7, 67.78, 67.78, 67.78, 180.64, 180.64],
  [73.35, 85.14, 85.14, 85.14, 236.96, 236.96],
  [79.13, 95.72, 95.72, 95.72, 313.69, 313.69],
  [79.13, 105.98, 105.98, 105.98, 313.69, 313.69],
  [80.11, 105.98, 105.98, 105.98, 400.57, 400.57],
  [105.98, 116.9, 116.9, 116.9, 456.02, 456.02],
  [140.25, 145.6, 145.6, 145.6, 536.13, 536.13],
  [193.52, 174.42, 174.42, 174.42, 615.37, 615.37],
  [193.52, 366.52, 366.52, 366.52, 724.52, 724.52],
  [211.42, 412.58, 412.58, 412.58, 818.28, 818.28],
  [227.14, 528.49, 528.49, 528.49, 1048.36, 1048.36],
  [497.71, 647.79, 647.79, 647.79, 1287.07, 1287.07],
  [613.74, 707.49, 707.49, 707.49, 1287.07, 1287.07],
  [613.74, 826.79, 826.79, 826.79, 1764.37, 1764.37],
];
const shaperDiameters = [
  79.37, 101.6, 127, 152.44, 177.8, 203.2, 254, 263, 266.7, 279.4, 292.1,
];
const shaperThicknesses = [44.45, 50.8, 76.2];
const shaperTables: Record<string, number[][]> = {
  "Alcrona Pro": [
    [38.17, 43.43, 61.33],
    [51.68, 51.68, 73.7],
    [56, 56, 80.19],
    [60.31, 60.31, 86.64],
    [87.14, 87.14, 127.57],
    [95.64, 95.64, 140.01],
    [106.26, 106.26, 155.57],
    [109.61, 0, 0],
  ],
  "A-TiN": [
    [17.94, 20.71, 30.12],
    [23.2, 25.98, 37.56],
    [26.41, 29.19, 41.9],
    [30.57, 33.35, 47.19],
    [60.37, 63.15, 89.08],
  ],
  "Alcrona EVO": [
    [52.17, 59.38, 83.85],
    [70.64, 70.64, 100.76],
    [76.55, 76.55, 109.61],
    [82.43, 82.43, 118.44],
    [145.25, 145.25, 212.67],
    [145.25, 174.31, 255.2],
    [145.25, 174.31, 255.2],
    [174.31, 209.16, 306.24],
  ],
};
const shankLengths = [
  50.8, 76.2, 101.6, 127, 152.4, 177.8, 203.2, 228.6, 254, 279.4, 304.8, 381,
  457.2, 533.4, 609.6,
];
const shankDiameters = [
  1.57, 3.17, 4.76, 6.35, 9.52, 12.7, 15.87, 19.05, 22.22, 25.4, 31.75, 34.92,
  50.8, 63.5, 76.2,
];
const shankAlcrona = [
  [
    2.12, 2.41, 2.75, 3.24, 3.74, 4.22, 4.91, 5.3, 5.95, 6.4, 6.88, 8.03, 9.25,
    10.4, 11.56,
  ],
  [
    2.41, 3.06, 3.7, 4.37, 5.2, 5.84, 6.42, 7.05, 7.84, 8.78, 14.74, 18.21,
    21.67, 25.01, 28.32,
  ],
  [
    3.06, 4.74, 5.53, 6.42, 7.74, 8.67, 9.82, 10.73, 11.85, 12.95, 21.67, 26.46,
    31.21, 35.99, 40.74,
  ],
  [
    4.74, 6.28, 7.38, 8.94, 10.4, 11.56, 13.16, 14.6, 15.89, 17.2, 28.47, 30.05,
    36.41, 43.63, 54.19,
  ],
  [
    6.8, 9.36, 12, 14.31, 16.34, 18.36, 23.27, 28.18, 33.39, 34.25, 35.41,
    40.03, 48.41, 58.08, 72.24,
  ],
  [
    8.36, 11.56, 15.03, 17.86, 21.09, 24.43, 30.63, 36.99, 41.61, 43.21, 44.94,
    62.13, 74.55, 89.87, 112.7,
  ],
  [
    9.98, 13.45, 16.76, 20.96, 24.85, 29.05, 35.25, 41.32, 47.68, 48.12, 49.28,
    68.35, 82.22, 101.29, 117.03,
  ],
  [
    12.29, 16.05, 19.8, 24.27, 28.76, 32.94, 39.3, 45.08, 51.3, 53.32, 56.06,
    74.55, 89.87, 112.7, 121.37,
  ],
  [
    14.6, 19.59, 24.5, 28.9, 33.1, 37.28, 42.92, 47.97, 53.32, 57.95, 62.57,
    80.2, 96.09, 117.03, 132.93,
  ],
  [
    16.91, 23.12, 29.19, 33.52, 37.43, 41.61, 46.52, 50.86, 55.35, 62.42, 69.06,
    85.69, 102.3, 121.37, 144.48,
  ],
  [
    29.05, 29.05, 36.28, 41.32, 46.68, 52.01, 60.68, 66.46, 69.06, 77.6, 86.4,
    102.3, 120.21, 138.13, 156.04,
  ],
  [
    45.23, 45.23, 56.5, 65.17, 73.4, 81.78, 90.45, 98.98, 107.65, 122.97,
    138.28, 150.26, 169.49, 187.83, 208.06,
  ],
  [
    61.42, 61.42, 76.73, 88.42, 101, 113.28, 129.9, 146.51, 162.98, 184.94,
    212.55, 239.84, 274.52, 309.2, 346.76,
  ],
  [
    82.91, 82.91, 103.64, 124.37, 145.1, 165.83, 186.56, 207.29, 228.02, 248.74,
    269.47, 290.2, 310.93, 331.66, 352.39,
  ],
  [
    111.93, 111.93, 139.92, 167.91, 195.9, 223.89, 251.88, 279.88, 307.87,
    335.86, 363.85, 391.84, 419.83, 447.83, 475.82,
  ],
];
const shankEvo = [
  [
    2.75, 3.13, 3.58, 4.21, 4.86, 5.48, 6.39, 6.89, 7.74, 8.31, 8.94, 10.44,
    12.02, 13.52, 15.03,
  ],
  [
    3.13, 3.98, 4.81, 5.68, 6.76, 7.59, 8.34, 9.17, 10.19, 11.42, 19.16, 23.67,
    28.17, 32.51, 36.81,
  ],
  [
    3.98, 6.16, 7.19, 8.34, 10.07, 11.27, 12.77, 13.95, 15.4, 16.83, 28.17,
    34.4, 40.57, 46.78, 52.97,
  ],
  [
    6.16, 8.16, 9.59, 11.62, 13.52, 15.03, 17.11, 18.98, 20.66, 22.36, 37.02,
    39.07, 47.33, 56.72, 70.45,
  ],
  [
    8.84, 12.17, 15.6, 18.61, 21.24, 23.87, 30.25, 36.64, 43.4, 44.53, 46.03,
    52.04, 62.94, 75.51, 93.92,
  ],
  [
    10.87, 15.03, 19.53, 23.22, 27.42, 31.76, 39.82, 48.08, 54.1, 56.17, 58.43,
    80.77, 96.92, 116.83, 146.51,
  ],
  [
    12.97, 17.48, 21.79, 27.25, 32.31, 37.77, 45.83, 53.72, 61.98, 62.56, 64.06,
    88.86, 106.89, 131.68, 152.14,
  ],
  [
    15.98, 20.86, 25.75, 31.56, 37.39, 42.83, 51.09, 58.6, 66.69, 69.32, 72.88,
    96.92, 116.83, 146.51, 157.78,
  ],
  [
    18.98, 25.47, 31.86, 37.57, 43.03, 48.46, 55.8, 62.36, 69.32, 75.33, 81.34,
    104.26, 124.92, 152.14, 172.8,
  ],
  [
    21.99, 30.05, 37.94, 43.58, 48.66, 54.1, 60.48, 66.12, 71.95, 81.14, 89.78,
    111.4, 132.98, 157.78, 187.83,
  ],
  [
    37.77, 37.77, 47.16, 53.72, 60.68, 67.62, 78.89, 86.4, 89.78, 100.88,
    112.32, 132.98, 156.27, 179.57, 202.86,
  ],
  [
    58.8, 58.8, 73.45, 84.72, 95.42, 106.31, 117.58, 128.68, 139.95, 159.86,
    179.77, 195.34, 220.34, 244.18, 270.48,
  ],
  [
    79.84, 79.84, 99.75, 114.95, 131.31, 147.26, 168.87, 190.46, 211.87, 240.42,
    276.31, 311.8, 356.88, 401.96, 450.79,
  ],
  [
    107.79, 107.79, 134.74, 161.68, 188.63, 215.58, 242.53, 269.47, 296.42,
    323.37, 350.32, 377.26, 404.21, 431.16, 458.1,
  ],
  [
    145.51, 145.51, 181.89, 218.28, 254.67, 291.06, 327.45, 363.84, 400.23,
    436.62, 473.01, 509.4, 545.78, 582.17, 618.56,
  ],
];

const findBracket = (value: number, limits: number[]) =>
  limits.findIndex((limit) => value <= limit);
function coatingPrice(
  partType: PartType,
  coating: string,
  length: number,
  diameter: number,
) {
  if (partType === "Hob") {
    const r = findBracket(length, hobLengths);
    const c = findBracket(diameter, hobDiameters);
    return r < 0 || c < 0
      ? null
      : (coating === "Strip & Alcrona EVO" ? hobEvo : hobAlcrona)[r][c];
  }
  if (partType === "Shaper") {
    const table = shaperTables[coating];
    const diameterBrackets =
      coating === "A-TiN"
        ? [79.37, 101.6, 127, 152.44, 254]
        : coating === "Alcrona EVO"
          ? [79.37, 101.6, 127, 152.44, 254, 266.7, 279.4, 292.1]
          : shaperDiameters.slice(0, table?.length);
    const r = findBracket(diameter, diameterBrackets);
    const c = findBracket(length, shaperThicknesses);
    const price = r < 0 || c < 0 ? 0 : table?.[r]?.[c];
    return price ? price : null;
  }
  if (partType === "Shaper with shank") {
    const r = findBracket(diameter, shankDiameters);
    const c = findBracket(length, shankLengths);
    return r < 0 || c < 0
      ? null
      : (coating === "Strip & EVO" ? shankEvo : shankAlcrona)[r][c];
  }
  return null;
}

type CoatingPriceSource = {
  price: number;
  table: string;
  row: string;
  column: string;
};
const hobDiameterLabels = [
  "76.20 mm or less",
  "79.37–101.60 mm",
  "104.77–114.30 mm",
  "117.47–152.40 mm",
  "155.57–203.20 mm",
  "215.90–304.80 mm",
];
function coatingPriceSource(
  partType: PartType,
  coating: string,
  length: number,
  diameter: number,
): CoatingPriceSource | null {
  const price = coatingPrice(partType, coating, length, diameter);
  if (price === null) return null;
  if (partType === "Hob") {
    const row = findBracket(length, hobLengths);
    const column = findBracket(diameter, hobDiameters);
    return {
      price,
      table: `Oerlikon · Lista de Precios Hobs 2026 · ${coating} Prices`,
      row: `Longitud Total: ${hobLengths[row]} mm`,
      column: `Diámetro Total: ${hobDiameterLabels[column]}`,
    };
  }
  if (partType === "Shaper") {
    const diameterBrackets =
      coating === "A-TiN"
        ? [79.37, 101.6, 127, 152.44, 254]
        : coating === "Alcrona EVO"
          ? [79.37, 101.6, 127, 152.44, 254, 266.7, 279.4, 292.1]
          : shaperDiameters.slice(0, shaperTables[coating]?.length);
    const row = findBracket(diameter, diameterBrackets);
    const column = findBracket(length, shaperThicknesses);
    return {
      price,
      table: `Oerlikon · Lista de Precios de Talladores 2026 · ${coating}`,
      row: `Diámetro: hasta ${diameterBrackets[row]} mm`,
      column: `Espesor: hasta ${shaperThicknesses[column]} mm`,
    };
  }
  if (partType === "Shaper with shank") {
    const row = findBracket(diameter, shankDiameters);
    const column = findBracket(length, shankLengths);
    return {
      price,
      table: `Oerlikon · Lista de Precios Talladores con Zanco 2026 · ${coating} Prices`,
      row: `Diámetro: ${shankDiameters[row]} mm o menor`,
      column: `Longitud: ${shankLengths[column]} mm`,
    };
  }
  return null;
}

const partTypes: PartType[] = [
  "Hob",
  "Shaper",
  "Shaper with shank",
  "Shaver",
  "Other",
];
const coatingsByPart: Record<PartType, string[]> = {
  Hob: ["Strip & Alcrona", "Strip & Alcrona EVO"],
  Shaper: ["Alcrona Pro", "A-TiN", "Alcrona EVO"],
  "Shaper with shank": ["Strip & Alcrona", "Strip & EVO"],
  Shaver: ["Standard"],
  Other: ["Standard"],
};
const designOptions = (part: PartType) =>
  part === "Hob"
    ? ["Straight", "Helical"]
    : part === "Shaper" || part === "Shaper with shank"
      ? ["Straight", "Stepped"]
      : ["Standard"];
const blankForm = {
  partType: "Hob" as PartType,
  measurementUnit: "mm" as "in" | "mm",
  customerId: "",
  toolId: "",
  serial: "",
  length: "",
  diameter: "",
  damage: "",
  coating: "Strip & Alcrona",
  design: "Straight",
  workCenter: "Gleason Norte",
  machineMinutes: "30",
  validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
};
const EXPEDITE_ORDER_ITEM = "Expedite Order surcharge";
const EXPEDITE_COATING_ITEM = "Expedite coating surcharge";
const quotationPdfFilename = (quotation: Quotation) => {
  const safe = (value: string) =>
    value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/\s+/g, " ");
  const now = new Date();
  const part = (value: number) => String(value).padStart(2, "0");
  const timestamp = `${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}${part(now.getSeconds())}`;
  return `${safe(quotation.quotation_number)} ${safe(quotation.client_name)} ${safe(quotation.tool_id)} ${safe(quotation.serial_number)} ${timestamp}.pdf`;
};

function QuotationDropdown({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const selected = options.find((option) => option.value === value);
  return (
    <div className={`quotation-dropdown${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? "" : "placeholder"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={17} />
      </button>
      {open ? (
        <div className="quotation-dropdown-menu" role="listbox">
          {options.map((option) => (
            <button
              className={option.value === value ? "selected" : ""}
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check size={16} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function QuotationsWorkspace({
  onNavigate,
  organizationId,
  organizationName,
  organizationLogoUrl = "",
}: Props) {
  const [quotations, setQuotations] = React.useState<Quotation[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [search, setSearch] = React.useState("");
  const [view, setView] = React.useState<"all" | QuotationStatus>("all");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState("");
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [form, setForm] = React.useState(blankForm);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [pdfStatus, setPdfStatus] = React.useState<
    "idle" | "generating" | "generated" | "error"
  >("idle");
  const [itemsByQuotation, setItemsByQuotation] = React.useState<
    Record<string, QuotationItem[]>
  >({});
  const [quotationItems, setQuotationItems] = React.useState<QuotationItem[]>(
    () => recurringDefaults(65),
  );
  const [serviceHistory, setServiceHistory] =
    React.useState<ServiceHistory>("existing_program");
  const [damageMethod, setDamageMethod] =
    React.useState<DamagePricingMethod>("standard");
  const [damagePercent, setDamagePercent] = React.useState("25");
  const [damageFixedAmount, setDamageFixedAmount] = React.useState("0");
  const [damageNote, setDamageNote] = React.useState("");
  const [expedite, setExpedite] = React.useState({
    enabled: false,
    sharpeningEnabled: true,
    coatingEnabled: true,
    percent: "30",
  });
  const [program, setProgram] = React.useState({
    sharpeningProgramId: "",
    measurementProgramId: "",
    programRevision: "",
    programStatus: "Not created",
  });
  const quotationPdfRef = React.useRef<HTMLDivElement>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    const [quotationResult, customerResult, itemResult] = await Promise.all([
      supabase
        .from("mes_quotations")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("mes_customers")
        .select("id, customer_name")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .order("customer_name"),
      supabase
        .from("mes_quotation_items")
        .select("*")
        .eq("organization_id", organizationId)
        .order("sort_order"),
    ]);
    if (!quotationResult.error)
      setQuotations((quotationResult.data ?? []) as Quotation[]);
    else
      setMessage(
        `Unable to load quotations: ${quotationResult.error.message}. Apply SQL migration 096.`,
      );
    if (!customerResult.error)
      setCustomers((customerResult.data ?? []) as Customer[]);
    if (!itemResult.error) {
      const grouped: Record<string, QuotationItem[]> = {};
      for (const row of itemResult.data ?? []) {
        const r = row as Record<string, any>;
        const mapped: QuotationItem = {
          id: r.id,
          category: r.category,
          pricingType: r.pricing_type,
          name: r.name,
          description: r.description,
          quantity: Number(r.quantity),
          unit: r.unit,
          hours: Number(r.hours),
          unitPrice: Number(r.unit_price),
          hourlyRate: Number(r.hourly_rate),
          internalCost: Number(r.internal_cost),
          subtotal: Number(r.subtotal),
          sortOrder: r.sort_order,
          isOptional: r.is_optional,
          isSelected: r.is_selected,
          isRecurring: r.is_recurring,
          isCustomerVisible: r.is_customer_visible,
          notes: r.notes,
        };
        (grouped[r.quotation_id] ??= []).push(mapped);
      }
      setItemsByQuotation(grouped);
    }
    setLoading(false);
  }, [organizationId]);
  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const nextNumber = `Q-${String(Math.max(0, ...quotations.map((q) => Number(q.quotation_number.replace(/\D/g, "")) || 0)) + 1).padStart(4, "0")}`;
  const enteredLength = Number(form.length);
  const enteredDiameter = Number(form.diameter);
  const enteredDamage = Number(form.damage);
  const length =
    form.measurementUnit === "in" ? enteredLength * 25.4 : enteredLength;
  const diameter =
    form.measurementUnit === "in" ? enteredDiameter * 25.4 : enteredDiameter;
  const damage =
    form.measurementUnit === "mm" ? enteredDamage / 25.4 : enteredDamage;
  const hourlyRate = form.workCenter === "Gleason Queretaro" ? 75 : 65;
  const machinePrice = calculateQuotationTotals(
    quotationItems,
    0,
    0,
  ).recurringServiceSubtotal;
  const damagePricingValid =
    damageMethod === "percentage"
      ? damagePercent.trim() !== "" &&
        Number.isFinite(Number(damagePercent)) &&
        Number(damagePercent) >= 0
      : damageMethod === "fixed"
        ? damageFixedAmount.trim() !== "" &&
          Number.isFinite(Number(damageFixedAmount)) &&
          Number(damageFixedAmount) >= 0
        : true;
  const expeditePricingValid =
    !expedite.enabled ||
    ((expedite.sharpeningEnabled || expedite.coatingEnabled) &&
      (!expedite.sharpeningEnabled ||
        (expedite.percent.trim() !== "" &&
          Number.isFinite(Number(expedite.percent)) &&
          Number(expedite.percent) >= 0)));
  const formComplete = Boolean(
    form.customerId &&
    form.toolId.trim() &&
    form.serial.trim() &&
    form.coating &&
    form.design &&
    form.workCenter &&
    form.validUntil &&
    form.length.trim() &&
    form.diameter.trim() &&
    form.damage.trim() &&
    Number.isFinite(enteredLength) &&
    enteredLength > 0 &&
    Number.isFinite(enteredDiameter) &&
    enteredDiameter > 0 &&
    Number.isFinite(enteredDamage) &&
    enteredDamage >= 0 &&
    damagePricingValid &&
    expeditePricingValid,
  );
  const coatingSource = formComplete
    ? coatingPriceSource(form.partType, form.coating, length, diameter)
    : null;
  const coatPrice = coatingSource?.price ?? null;
  const damageSteps = damage > 0.02 ? Math.ceil((damage - 0.02) / 0.01) : 0;
  const suggestedSurcharge = machinePrice * damageSteps * 0.25;
  const surcharge =
    damageMethod === "standard"
      ? suggestedSurcharge
      : damageMethod === "percentage"
        ? (machinePrice *
            damageSteps *
            Math.max(0, Number(damagePercent) || 0)) /
          100
        : damageMethod === "fixed"
          ? Math.max(0, Number(damageFixedAmount) || 0)
          : 0;
  const totals = calculateQuotationTotals(
    quotationItems,
    coatPrice ?? 0,
    surcharge,
  );
  const expediteOrderSurcharge = expedite.enabled && expedite.sharpeningEnabled
    ? (totals.recurringServiceSubtotal *
        Math.max(0, Number(expedite.percent) || 0)) /
      100
    : 0;
  const expediteCoatingSurcharge = expedite.enabled && expedite.coatingEnabled
    ? (coatPrice ?? 0) * 0.5
    : 0;
  const totalServiceHours = quotationItems
    .filter(
      (item) =>
        item.pricingType === "hourly" && (!item.isOptional || item.isSelected),
    )
    .reduce((sum, item) => sum + item.hours, 0);
  const total = formComplete
    ? totals.quotationTotal + expediteOrderSurcharge + expediteCoatingSurcharge
    : 0;
  const manualReview = formComplete && coatPrice === null;
  const filtered = quotations.filter(
    (q) =>
      (view === "all" || q.status === view) &&
      `${q.quotation_number} ${q.client_name} ${q.part_type} ${q.tool_id} ${q.serial_number} ${q.status}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const selectedQuotation =
    quotations.find((quotation) => quotation.id === selectedId) ?? null;
  const selectedItems = selectedQuotation
    ? (itemsByQuotation[selectedQuotation.id] ?? [])
    : [];
  const selectedMeasurementUnit = selectedQuotation?.measurement_unit || "mm";
  const selectedLength = selectedQuotation
    ? selectedMeasurementUnit === "in"
      ? Number(selectedQuotation.length_mm) / 25.4
      : Number(selectedQuotation.length_mm)
    : 0;
  const selectedDiameter = selectedQuotation
    ? selectedMeasurementUnit === "in"
      ? Number(selectedQuotation.diameter_mm) / 25.4
      : Number(selectedQuotation.diameter_mm)
    : 0;
  const selectedDamage = selectedQuotation
    ? selectedMeasurementUnit === "mm"
      ? Number(selectedQuotation.damage_inches) * 25.4
      : Number(selectedQuotation.damage_inches)
    : 0;
  const selectedCoatingSource = selectedQuotation
    ? coatingPriceSource(
        selectedQuotation.part_type,
        selectedQuotation.coating_type,
        Number(selectedQuotation.length_mm),
        Number(selectedQuotation.diameter_mm),
      )
    : null;
  const selectedHourlyRate =
    selectedQuotation?.work_center === "Gleason Queretaro" ? 75 : 65;
  const selectedDamageSteps =
    selectedQuotation && Number(selectedQuotation.damage_inches) > 0.02
      ? Math.ceil((Number(selectedQuotation.damage_inches) - 0.02) / 0.01)
      : 0;

  const changePart = (partType: PartType) =>
    setForm((current) => ({
      ...current,
      partType,
      coating: coatingsByPart[partType][0],
      design: designOptions(partType)[0],
    }));
  const saveQuotation = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    const customer = customers.find((item) => item.id === form.customerId);
    if (!customer || !formComplete) {
      setMessage(
        "Complete all required tool, customer, dimension, coating and validity fields.",
      );
      return;
    }
    if (
      serviceHistory === "first_time" &&
      !quotationItems.some(
        (i) => i.category === "one_time_engineering" && i.hours > 0,
      ) &&
      !window.confirm(
        "This first-time quotation has no engineering hours. Save it anyway?",
      )
    )
      return;
    if (
      serviceHistory === "existing_program" &&
      !program.sharpeningProgramId &&
      !program.measurementProgramId &&
      !window.confirm(
        "No program reference was provided. Save this quotation anyway?",
      )
    )
      return;
    if (
      total === 0 &&
      !window.confirm("The quotation total is zero. Save it as a draft anyway?")
    )
      return;
    setSaving(true);
    const recurringHours = quotationItems
      .filter((i) => i.category === "recurring_service")
      .reduce((sum, item) => sum + item.hours, 0);
    const legacyMachineMinutes = Math.max(
      30,
      Math.round(recurringHours * 2) * 30,
    );
    const payload = {
      organization_id: organizationId,
      quotation_number: editingId
        ? (selectedQuotation?.quotation_number ?? nextNumber)
        : nextNumber,
      customer_id: customer.id,
      client_name: customer.customer_name,
      part_type: form.partType,
      tool_id: form.toolId.trim(),
      serial_number: form.serial.trim(),
      length_mm: length,
      diameter_mm: diameter,
      damage_inches: damage,
      measurement_unit: form.measurementUnit,
      coating_type: form.coating,
      design: form.design,
      work_center: form.workCenter,
      machine_time_minutes: legacyMachineMinutes,
      coating_price: coatPrice ?? 0,
      machine_price: machinePrice,
      damage_surcharge: surcharge,
      total_price: total,
      pricing_status: manualReview ? "manual-review" : "calculated",
      status: editingId ? (selectedQuotation?.status ?? "draft") : "draft",
      valid_until: form.validUntil,
      service_history: serviceHistory,
      sharpening_program_id: program.sharpeningProgramId || null,
      measurement_program_id: program.measurementProgramId || null,
      program_revision: program.programRevision || null,
      program_status: program.programStatus,
      currency: "USD",
      one_time_engineering_subtotal: totals.oneTimeEngineeringSubtotal,
      recurring_service_subtotal: totals.recurringServiceSubtotal,
      addons_subtotal: totals.addonsSubtotal,
      other_subtotal:
        totals.otherSubtotal +
        expediteOrderSurcharge +
        expediteCoatingSurcharge,
      estimated_future_repeat_price: totals.estimatedFutureRepeatPrice,
    };
    const result = editingId
      ? await supabase
          .from("mes_quotations")
          .update(payload)
          .eq("id", editingId)
          .eq("organization_id", organizationId)
          .select("id")
          .single()
      : await supabase
          .from("mes_quotations")
          .insert(payload)
          .select("id")
          .single();
    const { error } = result;
    if (error) {
      setSaving(false);
      setMessage(error.message);
      return;
    }
    const quotationId = result.data.id;
    await supabase
      .from("mes_quotation_items")
      .delete()
      .eq("quotation_id", quotationId)
      .eq("organization_id", organizationId);
    const damageItem: QuotationItem = {
      id: crypto.randomUUID(),
      category: "damage_surcharge",
      pricingType: "fixed",
      name: `Damage surcharge · ${damageMethod}`,
      description: damageNote,
      quantity: 1,
      unit: "service",
      hours: 0,
      unitPrice: surcharge,
      hourlyRate: 0,
      internalCost: 0,
      subtotal: surcharge,
      sortOrder: quotationItems.length,
      isOptional: false,
      isSelected: true,
      isRecurring: false,
      isCustomerVisible: true,
      notes: JSON.stringify({
        method: damageMethod,
        percent: damagePercent,
        fixedAmount: damageFixedAmount,
        note: damageNote,
        suggestedAmount: suggestedSurcharge,
      }),
    };
    const expediteItems: QuotationItem[] = expedite.enabled
      ? [
          ...(expedite.sharpeningEnabled ? [
          {
            id: crypto.randomUUID(),
            category: "other",
            pricingType: "fixed",
            name: EXPEDITE_ORDER_ITEM,
            description: `${expedite.percent}% of the sharpening-service subtotal`,
            quantity: 1,
            unit: "service",
            hours: 0,
            unitPrice: expediteOrderSurcharge,
            hourlyRate: 0,
            internalCost: 0,
            subtotal: expediteOrderSurcharge,
            sortOrder: quotationItems.length + 1,
            isOptional: false,
            isSelected: true,
            isRecurring: false,
            isCustomerVisible: true,
            notes: JSON.stringify({
              type: "expedite_order",
              percent: expedite.percent,
              base: "sharpening_service",
            }),
          }] : []),
          ...(expedite.coatingEnabled ? [
          {
            id: crypto.randomUUID(),
            category: "other",
            pricingType: "fixed",
            name: EXPEDITE_COATING_ITEM,
            description: "50% of the base coating cost",
            quantity: 1,
            unit: "service",
            hours: 0,
            unitPrice: expediteCoatingSurcharge,
            hourlyRate: 0,
            internalCost: 0,
            subtotal: expediteCoatingSurcharge,
            sortOrder: quotationItems.length + 2,
            isOptional: false,
            isSelected: true,
            isRecurring: false,
            isCustomerVisible: true,
            notes: JSON.stringify({ type: "expedite_coating", percent: 50 }),
          }] : []),
        ]
      : [];
    const persistedItems = [
      ...quotationItems.filter(
        (item) =>
          item.category !== "damage_surcharge" &&
          item.name !== EXPEDITE_ORDER_ITEM &&
          item.name !== EXPEDITE_COATING_ITEM,
      ),
      damageItem,
      ...expediteItems,
    ];
    if (persistedItems.length) {
      const { error: itemError } = await supabase
        .from("mes_quotation_items")
        .insert(
          persistedItems.map((i, index) => ({
            quotation_id: quotationId,
            organization_id: organizationId,
            category: i.category,
            pricing_type: i.pricingType,
            name: i.name,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            hours: i.hours,
            unit_price: i.unitPrice,
            hourly_rate: i.hourlyRate,
            internal_cost: i.internalCost,
            subtotal:
              i.pricingType === "hourly"
                ? i.hours * i.hourlyRate
                : i.quantity * i.unitPrice,
            sort_order: index,
            is_optional: i.isOptional,
            is_selected: i.isSelected,
            is_recurring: i.isRecurring,
            is_customer_visible: i.isCustomerVisible,
            notes: i.notes,
          })),
        );
      if (itemError) {
        setSaving(false);
        setMessage(itemError.message);
        return;
      }
    }
    setSaving(false);
    setModalOpen(false);
    setEditingId(null);
    setForm(blankForm);
    await loadData();
  };

  const openNewQuotation = () => {
    setMessage("");
    setEditingId(null);
    setForm(blankForm);
    setServiceHistory("existing_program");
    setDamageMethod("standard");
    setDamagePercent("25");
    setDamageFixedAmount("0");
    setDamageNote("");
    setExpedite({ enabled: false, sharpeningEnabled: true, coatingEnabled: true, percent: "30" });
    setProgram({
      sharpeningProgramId: "",
      measurementProgramId: "",
      programRevision: "",
      programStatus: "Not created",
    });
    setQuotationItems([
      ...recurringDefaults(65).filter((i) => i.name !== "Sharpening"),
      legacyRecurringItem(30, 65),
    ]);
    setModalOpen(true);
  };
  const openEditQuotation = () => {
    if (!selectedQuotation) return;
    const unit = selectedQuotation.measurement_unit || "mm";
    setForm({
      partType: selectedQuotation.part_type,
      measurementUnit: unit,
      customerId: selectedQuotation.customer_id ?? "",
      toolId: selectedQuotation.tool_id,
      serial: selectedQuotation.serial_number,
      length: String(
        unit === "in"
          ? selectedQuotation.length_mm / 25.4
          : selectedQuotation.length_mm,
      ),
      diameter: String(
        unit === "in"
          ? selectedQuotation.diameter_mm / 25.4
          : selectedQuotation.diameter_mm,
      ),
      damage: String(
        unit === "mm"
          ? selectedQuotation.damage_inches * 25.4
          : selectedQuotation.damage_inches,
      ),
      coating: selectedQuotation.coating_type,
      design: selectedQuotation.design,
      workCenter: selectedQuotation.work_center,
      machineMinutes: String(selectedQuotation.machine_time_minutes),
      validUntil: selectedQuotation.valid_until,
    });
    const history = selectedQuotation.service_history ?? "existing_program";
    const loadedItems = itemsByQuotation[selectedQuotation.id] ?? [];
    const savedDamage = loadedItems.find(
      (item) => item.category === "damage_surcharge",
    );
    const savedExpedite = loadedItems.find(
      (item) => item.name === EXPEDITE_ORDER_ITEM,
    );
    const savedExpediteCoating = loadedItems.find(
      (item) => item.name === EXPEDITE_COATING_ITEM,
    );
    let damageSettings: {
      method?: DamagePricingMethod;
      percent?: string;
      fixedAmount?: string;
      note?: string;
    } = {};
    let expediteSettings: { percent?: string } = {};
    try {
      damageSettings = savedDamage?.notes ? JSON.parse(savedDamage.notes) : {};
    } catch {
      damageSettings = {};
    }
    try {
      expediteSettings = savedExpedite?.notes
        ? JSON.parse(savedExpedite.notes)
        : {};
    } catch {
      expediteSettings = {};
    }
    setServiceHistory(history);
    setDamageMethod(
      damageSettings.method ?? (savedDamage ? "fixed" : "standard"),
    );
    setDamagePercent(String(damageSettings.percent ?? "25"));
    setDamageFixedAmount(
      String(damageSettings.fixedAmount ?? selectedQuotation.damage_surcharge),
    );
    setDamageNote(damageSettings.note ?? savedDamage?.description ?? "");
    setExpedite({
      enabled: Boolean(savedExpedite || savedExpediteCoating),
      sharpeningEnabled: Boolean(savedExpedite),
      coatingEnabled: Boolean(savedExpediteCoating),
      percent: String(expediteSettings.percent ?? "30"),
    });
    setProgram({
      sharpeningProgramId: selectedQuotation.sharpening_program_id ?? "",
      measurementProgramId: selectedQuotation.measurement_program_id ?? "",
      programRevision: selectedQuotation.program_revision ?? "",
      programStatus: selectedQuotation.program_status ?? "Not created",
    });
    setQuotationItems(
      loadedItems.length
        ? loadedItems.filter(
            (item) =>
              item.category !== "damage_surcharge" &&
              item.name !== EXPEDITE_ORDER_ITEM &&
              item.name !== EXPEDITE_COATING_ITEM,
          )
        : [
            legacyRecurringItem(
              selectedQuotation.machine_time_minutes,
              selectedHourlyRate,
            ),
          ],
    );
    setEditingId(selectedQuotation.id);
    setDetailsOpen(false);
    setMessage("");
    setModalOpen(true);
  };
  const deleteQuotation = async () => {
    if (!selectedQuotation) return;
    setSaving(true);
    const { error } = await supabase
      .from("mes_quotations")
      .delete()
      .eq("id", selectedQuotation.id)
      .eq("organization_id", organizationId);
    setSaving(false);
    if (error) {
      setMessage(error.message);
      setDeleteConfirmOpen(false);
      return;
    }
    setDeleteConfirmOpen(false);
    setDetailsOpen(false);
    setSelectedId("");
    await loadData();
  };
  const changeQuotationStatus = async (status: QuotationStatus) => {
    if (!selectedQuotation || saving) return;
    setSaving(true);
    setMessage("");
    const { error } = await supabase
      .from("mes_quotations")
      .update({ status })
      .eq("id", selectedQuotation.id)
      .eq("organization_id", organizationId);
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadData();
  };
  const downloadQuotationPdf = async () => {
    if (
      !selectedQuotation ||
      !quotationPdfRef.current ||
      pdfStatus === "generating"
    )
      return;
    setPdfStatus("generating");
    try {
      await exportElementScreenshotToSinglePagePdf(
        quotationPdfRef.current,
        quotationPdfFilename(selectedQuotation),
      );
      setPdfStatus("generated");
      window.setTimeout(() => setPdfStatus("idle"), 3000);
    } catch (error) {
      console.error("Unable to generate quotation PDF", error);
      setPdfStatus("error");
      window.setTimeout(() => setPdfStatus("idle"), 5000);
    }
  };

  return (
    <>
      {pdfStatus !== "idle" ? (
        <div
          className={`quotation-pdf-status ${pdfStatus}`}
          role="status"
          aria-live="polite"
        >
          <strong>
            {pdfStatus === "generating"
              ? "Generating PDF…"
              : pdfStatus === "generated"
                ? "PDF generated"
                : "PDF generation failed"}
          </strong>
          <span>
            {pdfStatus === "generating"
              ? "Preparing the quotation and organization image."
              : pdfStatus === "generated"
                ? "The quotation report has been downloaded."
                : "Please try again. If the problem continues, verify the organization image."}
          </span>
        </div>
      ) : null}
      <section className="mes-workspace-panel quotations-workspace">
        <div className="mes-screen-header">
          <button
            className="academy-back-button engineering-back-button mes-workspace-back"
            type="button"
            onClick={() => onNavigate("/workspace/manufacturing-ops/mes")}
          >
            <ArrowLeft size={16} /> MES Applications
          </button>
          <div className="mes-workspace-heading">
            <p className="eyebrow">MES / Quotations</p>
            <h2>Quotations</h2>
            <p>
              Create and manage customer quotations for manufacturing products
              and services.
            </p>
          </div>
        </div>
        <section className="quotations-toolbar">
          <div className="quotations-toolbar-actions">
            <button
              className="quotations-new-button"
              type="button"
              onClick={openNewQuotation}
            >
              <Plus size={18} /> New Quotation
            </button>
            {selectedQuotation ? (
              <>
                <button
                  className="quotations-details-button"
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                >
                  Quotation Details
                </button>
                {selectedQuotation.status === "draft" ? (
                  <button
                    className="quotation-status-action sent"
                    type="button"
                    disabled={saving}
                    onClick={() => void changeQuotationStatus("sent")}
                  >
                    Mark as Sent
                  </button>
                ) : null}
                {selectedQuotation.status === "sent" ? (
                  <>
                    <button
                      className="quotation-status-action approved"
                      type="button"
                      disabled={saving}
                      onClick={() => void changeQuotationStatus("approved")}
                    >
                      Approve
                    </button>
                    <button
                      className="quotation-status-action declined"
                      type="button"
                      disabled={saving}
                      onClick={() => void changeQuotationStatus("declined")}
                    >
                      Decline
                    </button>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
          <label className="production-orders-search production-orders-overview-search">
            <span>Search quotations</span>
            <div>
              <Search size={17} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Quotation, client, tool, serial, status"
              />
            </div>
          </label>
        </section>
        {message && !modalOpen ? (
          <div className="quotations-message" role="alert">
            {message}
          </div>
        ) : null}
        <section className="production-orders-main-panel quotations-table-panel">
          <div className="production-orders-panel-title">
            <div className="production-orders-panel-copy">
              <span>Quotation register</span>
              <strong>Customer quotation list</strong>
            </div>
            <div className="production-orders-view-toggle">
              {(["all", "draft", "sent", "approved", "declined"] as const).map(
                (item) => (
                  <button
                    className={view === item ? "active" : ""}
                    type="button"
                    key={item}
                    onClick={() => setView(item)}
                  >
                    {item[0].toUpperCase() + item.slice(1)}
                  </button>
                ),
              )}
            </div>
            <span>
              {filtered.length} showing / {quotations.length} total
            </span>
          </div>
          <div className="mes-table-wrap production-orders-table-wrap">
            <table className="mes-table production-orders-table quotations-table">
              <thead>
                <tr>
                  <th>Quotation</th>
                  <th>Client</th>
                  <th>Description</th>
                  <th>Serial</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Valid until</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? (
                  filtered.map((q) => (
                    <tr
                      className={q.id === selectedId ? "selected" : ""}
                      tabIndex={0}
                      aria-selected={q.id === selectedId}
                      key={q.id}
                      onClick={() => setSelectedId(q.id)}
                      onDoubleClick={() => {
                        setSelectedId(q.id);
                        setDetailsOpen(true);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(q.id);
                        }
                      }}
                    >
                      <td>
                        <strong>{q.quotation_number}</strong>
                      </td>
                      <td>
                        <strong>{q.client_name}</strong>
                      </td>
                      <td>
                        <strong>
                          {q.part_type} · {q.tool_id}
                        </strong>
                        <span>
                          {q.coating_type} · {q.design}
                        </span>
                      </td>
                      <td>
                        <strong>{q.serial_number}</strong>
                      </td>
                      <td>
                        <strong>
                          {q.pricing_status === "manual-review"
                            ? "Review"
                            : `$${Number(q.total_price).toFixed(2)} USD`}
                        </strong>
                      </td>
                      <td>
                        <span className={`quotation-status ${q.status}`}>
                          {q.status}
                        </span>
                      </td>
                      <td>{q.valid_until}</td>
                      <td>{new Date(q.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="production-orders-table-empty" colSpan={8}>
                      <div>
                        <span>Quotations</span>
                        <strong>
                          {loading
                            ? "Loading quotations..."
                            : search || view !== "all"
                              ? "No quotations match the selected filters."
                              : "No quotations have been created yet."}
                        </strong>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="production-orders-pagination quotations-pagination">
            <span>Page 1 of 1</span>
            <div>
              <button type="button" disabled>
                Previous
              </button>
              <button className="active" type="button">
                1
              </button>
              <button type="button" disabled>
                Next
              </button>
            </div>
          </div>
        </section>
        {selectedQuotation ? (
          <div className="quotation-pdf-stage" aria-hidden="true">
            <article className="quotation-pdf-document" ref={quotationPdfRef}>
              <header>
                <div>
                  <span>
                    {organizationName} · {selectedQuotation.work_center}
                  </span>
                  <h1>Quotation {selectedQuotation.quotation_number}</h1>
                  <p>Prepared for {selectedQuotation.client_name}</p>
                </div>
                <aside>
                  <strong
                    className={`quotation-status ${selectedQuotation.status}`}
                  >
                    {selectedQuotation.status}
                  </strong>
                  <span>
                    Created{" "}
                    {new Date(
                      selectedQuotation.created_at,
                    ).toLocaleDateString()}
                  </span>
                  <span>Valid until {selectedQuotation.valid_until}</span>
                </aside>
              </header>
              <section className="quotation-pdf-intro">
                <h2>Tool and service details</h2>
                <p>
                  Manufacturing service quotation based on the selected coating
                  price table, machine time, and removal requirements.
                </p>
              </section>
              <section className="quotation-pdf-content">
                <div className="quotation-pdf-data">
                  <div>
                    <span>Client</span>
                    <strong>{selectedQuotation.client_name}</strong>
                  </div>
                  <div>
                    <span>Part type</span>
                    <strong>{selectedQuotation.part_type}</strong>
                  </div>
                  <div>
                    <span>Tool ID</span>
                    <strong>{selectedQuotation.tool_id}</strong>
                  </div>
                  <div>
                    <span>Serial</span>
                    <strong>{selectedQuotation.serial_number}</strong>
                  </div>
                  <div>
                    <span>Measurement unit</span>
                    <strong>{selectedMeasurementUnit}</strong>
                  </div>
                  <div>
                    <span>Design</span>
                    <strong>{selectedQuotation.design}</strong>
                  </div>
                  <div>
                    <span>Length / thickness</span>
                    <strong>
                      {selectedLength.toFixed(3)} {selectedMeasurementUnit}
                    </strong>
                    <small>
                      {Number(selectedQuotation.length_mm).toFixed(2)} mm
                      normalized
                    </small>
                  </div>
                  <div>
                    <span>Diameter</span>
                    <strong>
                      {selectedDiameter.toFixed(3)} {selectedMeasurementUnit}
                    </strong>
                    <small>
                      {Number(selectedQuotation.diameter_mm).toFixed(2)} mm
                      normalized
                    </small>
                  </div>
                  <div>
                    <span>Damage to remove</span>
                    <strong>
                      {selectedDamage.toFixed(3)} {selectedMeasurementUnit}
                    </strong>
                    <small>
                      {Number(selectedQuotation.damage_inches).toFixed(3)} in
                      normalized
                    </small>
                  </div>
                  <div>
                    <span>Coating type</span>
                    <strong>{selectedQuotation.coating_type}</strong>
                  </div>
                  <div>
                    <span>Work center</span>
                    <strong>{selectedQuotation.work_center}</strong>
                    <small>${selectedHourlyRate} USD per hour</small>
                  </div>
                  <div>
                    <span>Machine time</span>
                    <strong>
                      {selectedQuotation.machine_time_minutes} minutes
                    </strong>
                    <small>
                      {(selectedQuotation.machine_time_minutes / 60).toFixed(1)}{" "}
                      machine hours
                    </small>
                  </div>
                </div>
                <aside className="quotation-pdf-price">
                  <h2>Price breakdown</h2>
                  <dl>
                    <dt>Coating</dt>
                    <dd>
                      ${Number(selectedQuotation.coating_price).toFixed(2)}
                    </dd>
                    <dt>Machine (${selectedHourlyRate}/hr)</dt>
                    <dd>
                      ${Number(selectedQuotation.machine_price).toFixed(2)}
                    </dd>
                    <dt>Damage surcharge</dt>
                    <dd>
                      ${Number(selectedQuotation.damage_surcharge).toFixed(2)}
                    </dd>
                    <dt>Total</dt>
                    <dd>
                      {selectedQuotation.pricing_status === "manual-review"
                        ? "Manual review"
                        : `$${Number(selectedQuotation.total_price).toFixed(2)} USD`}
                    </dd>
                  </dl>
                  {selectedCoatingSource ? (
                    <section>
                      <span>Coating price source</span>
                      <strong>{selectedCoatingSource.table}</strong>
                      <dl>
                        <dt>Input used</dt>
                        <dd>
                          {Number(selectedQuotation.length_mm).toFixed(2)} mm ×
                          Ø {Number(selectedQuotation.diameter_mm).toFixed(2)}{" "}
                          mm
                        </dd>
                        <dt>Selected row</dt>
                        <dd>{selectedCoatingSource.row}</dd>
                        <dt>Selected column</dt>
                        <dd>{selectedCoatingSource.column}</dd>
                        <dt>Cell value</dt>
                        <dd>${selectedCoatingSource.price.toFixed(2)} USD</dd>
                      </dl>
                    </section>
                  ) : (
                    <p>Coating dimensions require manual price review.</p>
                  )}
                  <p>
                    {selectedDamageSteps
                      ? `Damage rule: +${selectedDamageSteps * 25}% of machine cost because removal exceeds 0.020 in (0.508 mm).`
                      : "Damage rule: no surcharge; removal does not exceed 0.020 in (0.508 mm)."}
                  </p>
                </aside>
              </section>
              <footer>
                <span>Quotation {selectedQuotation.quotation_number}</span>
                <span>
                  Prices in USD. Coating pricing based on supplied Oerlikon 2026
                  price lists.
                </span>
              </footer>
            </article>
          </div>
        ) : null}
        {detailsOpen && selectedQuotation ? (
          <div
            className="quotation-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setDetailsOpen(false);
            }}
          >
            <section
              className="quotation-modal quotation-details-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="quotation-details-title"
            >
              <header>
                <div>
                  <span>Quotation details</span>
                  <h3 id="quotation-details-title">
                    {selectedQuotation.quotation_number} ·{" "}
                    {selectedQuotation.client_name}
                  </h3>
                  <p>
                    Created{" "}
                    {new Date(
                      selectedQuotation.created_at,
                    ).toLocaleDateString()}{" "}
                    · Valid until {selectedQuotation.valid_until}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setDetailsOpen(false)}
                >
                  <X size={20} />
                </button>
              </header>
              <div className="quotation-details-body">
                <section className="quotation-details-grid">
                  <div>
                    <span>Client</span>
                    <strong>{selectedQuotation.client_name}</strong>
                  </div>
                  <div>
                    <span>Part type</span>
                    <strong>{selectedQuotation.part_type}</strong>
                  </div>
                  <div>
                    <span>Tool ID</span>
                    <strong>{selectedQuotation.tool_id}</strong>
                  </div>
                  <div>
                    <span>Serial</span>
                    <strong>{selectedQuotation.serial_number}</strong>
                  </div>
                  <div>
                    <span>Measurement unit</span>
                    <strong>{selectedMeasurementUnit}</strong>
                  </div>
                  <div>
                    <span>Design</span>
                    <strong>{selectedQuotation.design}</strong>
                  </div>
                  <div>
                    <span>Length / thickness</span>
                    <strong>
                      {selectedLength.toFixed(3)} {selectedMeasurementUnit}
                    </strong>
                    <small>
                      {Number(selectedQuotation.length_mm).toFixed(2)} mm
                      normalized
                    </small>
                  </div>
                  <div>
                    <span>Diameter</span>
                    <strong>
                      {selectedDiameter.toFixed(3)} {selectedMeasurementUnit}
                    </strong>
                    <small>
                      {Number(selectedQuotation.diameter_mm).toFixed(2)} mm
                      normalized
                    </small>
                  </div>
                  <div>
                    <span>Damage to remove</span>
                    <strong>
                      {selectedDamage.toFixed(3)} {selectedMeasurementUnit}
                    </strong>
                    <small>
                      {Number(selectedQuotation.damage_inches).toFixed(3)} in
                      normalized
                    </small>
                  </div>
                  <div>
                    <span>Coating type</span>
                    <strong>{selectedQuotation.coating_type}</strong>
                  </div>
                  <div>
                    <span>Work center</span>
                    <strong>{selectedQuotation.work_center}</strong>
                    <small>${selectedHourlyRate} USD per hour</small>
                  </div>
                  <div>
                    <span>Machine time</span>
                    <strong>
                      {selectedQuotation.machine_time_minutes} minutes
                    </strong>
                    <small>
                      {(selectedQuotation.machine_time_minutes / 60).toFixed(1)}{" "}
                      machine hours
                    </small>
                  </div>
                  <div>
                    <span>Valid until</span>
                    <strong>{selectedQuotation.valid_until}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong
                      className={`quotation-status ${selectedQuotation.status}`}
                    >
                      {selectedQuotation.status}
                    </strong>
                  </div>
                </section>
                <aside className="quotation-details-price">
                  <span>Price breakdown</span>
                  <dl>
                    <dt>Coating</dt>
                    <dd>
                      ${Number(selectedQuotation.coating_price).toFixed(2)}
                    </dd>
                    <dt>Machine (${selectedHourlyRate}/hr)</dt>
                    <dd>
                      ${Number(selectedQuotation.machine_price).toFixed(2)}
                    </dd>
                    <dt>Damage surcharge</dt>
                    <dd>
                      ${Number(selectedQuotation.damage_surcharge).toFixed(2)}
                    </dd>
                    <dt>Total</dt>
                    <dd>
                      {selectedQuotation.pricing_status === "manual-review"
                        ? "Manual review"
                        : `$${Number(selectedQuotation.total_price).toFixed(2)} USD`}
                    </dd>
                  </dl>
                  {selectedCoatingSource ? (
                    <section className="quotation-price-source">
                      <span>Coating price source</span>
                      <strong>{selectedCoatingSource.table}</strong>
                      <dl>
                        <dt>Input used</dt>
                        <dd>
                          {Number(selectedQuotation.length_mm).toFixed(2)} mm ×
                          Ø {Number(selectedQuotation.diameter_mm).toFixed(2)}{" "}
                          mm
                        </dd>
                        <dt>Selected row</dt>
                        <dd>{selectedCoatingSource.row}</dd>
                        <dt>Selected column</dt>
                        <dd>{selectedCoatingSource.column}</dd>
                        <dt>Cell value</dt>
                        <dd>${selectedCoatingSource.price.toFixed(2)} USD</dd>
                      </dl>
                    </section>
                  ) : (
                    <p>Coating dimensions require manual price review.</p>
                  )}
                  {selectedDamageSteps ? (
                    <p>
                      Damage rule: +{selectedDamageSteps * 25}% of machine cost
                      because removal exceeds 0.020 in (0.508 mm).
                    </p>
                  ) : (
                    <p>
                      Damage rule: no surcharge; removal does not exceed 0.020
                      in (0.508 mm).
                    </p>
                  )}
                </aside>
              </div>
              <footer className="quotation-details-actions">
                <button
                  className="danger"
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  Delete
                </button>
                <span />
                <button type="button" onClick={openEditQuotation}>
                  Edit
                </button>
                <button
                  className="pdf"
                  type="button"
                  onClick={() => void downloadQuotationPdf()}
                >
                  Generate PDF
                </button>
              </footer>
            </section>
          </div>
        ) : null}
        {deleteConfirmOpen && selectedQuotation ? (
          <div className="quotation-confirm-backdrop">
            <section
              className="quotation-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-quotation-title"
            >
              <span>Delete quotation</span>
              <h3 id="delete-quotation-title">
                Delete {selectedQuotation.quotation_number}?
              </h3>
              <p>
                This permanently removes the quotation for{" "}
                <strong>{selectedQuotation.client_name}</strong>. This action
                cannot be undone.
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="danger"
                  type="button"
                  disabled={saving}
                  onClick={() => void deleteQuotation()}
                >
                  {saving ? "Deleting..." : "Delete Quotation"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {modalOpen ? (
          <div
            className="quotation-modal-backdrop"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setModalOpen(false);
            }}
          >
            <section
              className="quotation-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-quotation-title"
            >
              <header>
                <div>
                  <span>Quotation builder</span>
                  <h3 id="new-quotation-title">
                    {editingId ? "Edit" : "New"} Quotation ·{" "}
                    {editingId
                      ? selectedQuotation?.quotation_number
                      : nextNumber}
                  </h3>
                  <p>
                    Enter tool dimensions and production requirements to
                    calculate the price.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setModalOpen(false)}
                >
                  <X size={20} />
                </button>
              </header>
              <form onSubmit={saveQuotation}>
                <div className="quotation-form-grid">
                  <div className="quotation-step-heading">
                    <span>Step 01</span>
                    <div>
                      <strong>Identify the tool</strong>
                      <small>
                        Enter the customer, tool reference and dimensions used
                        to prepare the quotation.
                      </small>
                    </div>
                    <em>Required</em>
                  </div>
                  <label>
                    Part type
                    <QuotationDropdown
                      value={form.partType}
                      placeholder="Select part type"
                      options={partTypes.map((item) => ({
                        value: item,
                        label: item,
                      }))}
                      onChange={(value) => changePart(value as PartType)}
                    />
                  </label>
                  <label>
                    Client
                    <QuotationDropdown
                      value={form.customerId}
                      placeholder="Select client"
                      options={customers.map((c) => ({
                        value: c.id,
                        label: c.customer_name,
                      }))}
                      onChange={(value) =>
                        setForm({ ...form, customerId: value })
                      }
                    />
                  </label>
                  <label>
                    Tool ID
                    <input
                      required
                      value={form.toolId}
                      onChange={(e) =>
                        setForm({ ...form, toolId: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Serial
                    <input
                      required
                      value={form.serial}
                      onChange={(e) =>
                        setForm({ ...form, serial: e.target.value })
                      }
                    />
                  </label>
                  <fieldset className="quotation-unit-selector">
                    <legend>Measurement unit</legend>
                    <div>
                      <button
                        className={
                          form.measurementUnit === "in" ? "active" : ""
                        }
                        type="button"
                        onClick={() =>
                          setForm({ ...form, measurementUnit: "in" })
                        }
                      >
                        in
                      </button>
                      <button
                        className={
                          form.measurementUnit === "mm" ? "active" : ""
                        }
                        type="button"
                        onClick={() =>
                          setForm({ ...form, measurementUnit: "mm" })
                        }
                      >
                        mm
                      </button>
                    </div>
                  </fieldset>
                  <span className="quotation-unit-note">
                    All dimensions below use the selected unit.
                  </span>
                  <label>
                    Length / thickness ({form.measurementUnit})
                    <input
                      required
                      min="0.001"
                      step="0.001"
                      type="number"
                      value={form.length}
                      onChange={(e) =>
                        setForm({ ...form, length: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Diameter ({form.measurementUnit})
                    <input
                      required
                      min="0.001"
                      step="0.001"
                      type="number"
                      value={form.diameter}
                      onChange={(e) =>
                        setForm({ ...form, diameter: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Damage to remove ({form.measurementUnit})
                    <input
                      required
                      min="0"
                      step="0.001"
                      type="number"
                      value={form.damage}
                      onChange={(e) =>
                        setForm({ ...form, damage: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Coating type
                    <QuotationDropdown
                      value={form.coating}
                      placeholder="Select coating"
                      options={coatingsByPart[form.partType].map((item) => ({
                        value: item,
                        label: item,
                      }))}
                      onChange={(value) => setForm({ ...form, coating: value })}
                    />
                  </label>
                  <label>
                    Design
                    <QuotationDropdown
                      value={form.design}
                      placeholder="Select design"
                      options={designOptions(form.partType).map((item) => ({
                        value: item,
                        label: item,
                      }))}
                      onChange={(value) => setForm({ ...form, design: value })}
                    />
                  </label>
                  <label>
                    Work center
                    <QuotationDropdown
                      value={form.workCenter}
                      placeholder="Select work center"
                      options={["Gleason Norte", "Gleason Queretaro"].map(
                        (item) => ({ value: item, label: item }),
                      )}
                      onChange={(value) =>
                        setForm({ ...form, workCenter: value })
                      }
                    />
                  </label>
                  <label>
                    Valid until
                    <input
                      required
                      type="date"
                      value={form.validUntil}
                      onChange={(e) =>
                        setForm({ ...form, validUntil: e.target.value })
                      }
                    />
                  </label>
                  <span />
                  <QuotationV1Sections
                    serviceHistory={serviceHistory}
                    onServiceHistory={(history) => {
                      setServiceHistory(history);
                      if (history === "first_time")
                        setQuotationItems([
                          ...engineeringDefaults(hourlyRate),
                          ...recurringDefaults(hourlyRate),
                        ]);
                      else if (history === "existing_program")
                        setQuotationItems(recurringDefaults(hourlyRate));
                      else if (history === "program_modification")
                        setQuotationItems([
                          ...engineeringDefaults(hourlyRate),
                          ...recurringDefaults(hourlyRate),
                        ]);
                    }}
                    items={quotationItems}
                    onItems={setQuotationItems}
                    rate={hourlyRate}
                    program={program}
                    onProgram={setProgram}
                    expedite={expedite}
                    onExpedite={setExpedite}
                    damageStep={
                      <QuotationDamageSurchargeStep
                        method={damageMethod}
                        onMethod={setDamageMethod}
                        percent={damagePercent}
                        onPercent={setDamagePercent}
                        fixedAmount={damageFixedAmount}
                        onFixedAmount={setDamageFixedAmount}
                        note={damageNote}
                        onNote={setDamageNote}
                        suggestedAmount={suggestedSurcharge}
                        finalAmount={surcharge}
                        damageSteps={damageSteps}
                        damageInches={Number.isFinite(damage) ? damage : 0}
                        sharpeningSubtotal={machinePrice}
                      />
                    }
                  />
                  <QuotationAddonCatalogPicker
                    organizationId={organizationId}
                    onAdd={(item) =>
                      setQuotationItems((current) => [...current, item])
                    }
                  />
                  <QuotationAddonAdvancedFields
                    items={quotationItems}
                    onItems={setQuotationItems}
                  />
                </div>
                <aside
                  className={`quotation-calculation${formComplete ? "" : " incomplete"}`}
                >
                  <div>
                    <Calculator size={22} />
                    <span>Price calculation</span>
                  </div>
                  {formComplete ? (
                    <>
                      <dl>
                        {totals.oneTimeEngineeringSubtotal > 0 ? (
                          <>
                            <dt>Engineering & program preparation</dt>
                            <dd>
                              ${totals.oneTimeEngineeringSubtotal.toFixed(2)}
                            </dd>
                          </>
                        ) : null}
                        <dt>Sharpening service</dt>
                        <dd>${totals.recurringServiceSubtotal.toFixed(2)}</dd>
                        <dt>Coating</dt>
                        <dd>
                          {manualReview
                            ? "Manual review"
                            : `$${coatPrice?.toFixed(2)}`}
                        </dd>
                        <dt>Damage surcharge</dt>
                        <dd>${surcharge.toFixed(2)}</dd>
                        {totals.addonsSubtotal > 0 ? (
                          <>
                            <dt>Additional quotation items</dt>
                            <dd>${totals.addonsSubtotal.toFixed(2)}</dd>
                          </>
                        ) : null}
                        {totals.otherSubtotal > 0 ? (
                          <>
                            <dt>Other services</dt>
                            <dd>${totals.otherSubtotal.toFixed(2)}</dd>
                          </>
                        ) : null}
                        {expedite.enabled && (expedite.sharpeningEnabled || expedite.coatingEnabled) ? (
                          <>
                            {expedite.sharpeningEnabled ? <>
                            <dt>
                              Expedite Order ({Number(expedite.percent).toFixed(2)}% of sharpening)
                            </dt>
                            <dd>${expediteOrderSurcharge.toFixed(2)}</dd>
                            </> : null}
                            {expedite.coatingEnabled ? <>
                            <dt>Expedite coating (50%)</dt>
                            <dd>${expediteCoatingSurcharge.toFixed(2)}</dd>
                            </> : null}
                          </>
                        ) : null}
                        <dt className="quotation-hours-total">
                          Total service hours
                        </dt>
                        <dd className="quotation-hours-total">
                          {totalServiceHours.toFixed(2)} hrs
                        </dd>
                        <dt>Total</dt>
                        <dd>
                          {manualReview
                            ? "Pending review"
                            : `$${total.toFixed(2)} USD`}
                        </dd>
                      </dl>
                      {coatingSource ? (
                        <section className="quotation-price-source">
                          <span>Coating price source</span>
                          <strong>{coatingSource.table}</strong>
                          <dl>
                            <dt>Input used</dt>
                            <dd>
                              {length.toFixed(2)} mm × Ø {diameter.toFixed(2)}{" "}
                              mm
                            </dd>
                            <dt>Selected row</dt>
                            <dd>{coatingSource.row}</dd>
                            <dt>Selected column</dt>
                            <dd>{coatingSource.column}</dd>
                            <dt>Cell value</dt>
                            <dd>${coatingSource.price.toFixed(2)} USD</dd>
                          </dl>
                          {form.measurementUnit === "in" ? (
                            <small>
                              Converted from {form.length} in × Ø{" "}
                              {form.diameter} in before consulting the metric
                              table.
                            </small>
                          ) : null}
                        </section>
                      ) : null}
                      <p>
                        {damageMethod === "standard"
                          ? damageSteps
                            ? `Standard rule: ${damageSteps * 25}% of sharpening-service cost.`
                            : "Standard rule: no surcharge below the damage threshold."
                          : damageMethod === "percentage"
                            ? `Negotiated damage surcharge: ${Number(damagePercent).toFixed(2)}% per increment × ${damageSteps} increment${damageSteps === 1 ? "" : "s"}.`
                            : damageMethod === "fixed"
                              ? `Negotiated fixed damage surcharge: $${surcharge.toFixed(2)} USD.`
                              : "Damage surcharge waived for this quotation."}
                      </p>
                      {manualReview ? (
                        <p>
                          The selected dimensions or part type are outside the
                          supplied price tables.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="quotation-calculation-pending">
                      Complete every required field with valid values to
                      calculate a price.
                    </p>
                  )}
                </aside>
                {message ? (
                  <div className="quotations-message" role="alert">
                    {message}
                  </div>
                ) : null}
                <footer>
                  <button type="button" onClick={() => setModalOpen(false)}>
                    Cancel
                  </button>
                  <button
                    className="save"
                    type="submit"
                    disabled={saving || !formComplete}
                  >
                    {saving
                      ? "Saving..."
                      : editingId
                        ? "Save Changes"
                        : "Create Quotation"}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        ) : null}
      </section>
      {detailsOpen && selectedQuotation && selectedItems.length ? (
        <QuotationV1Details
          quote={selectedQuotation}
          items={selectedItems}
          organizationName={organizationName}
          organizationLogoUrl={organizationLogoUrl}
          coatingSource={selectedCoatingSource}
          onClose={() => setDetailsOpen(false)}
          onEdit={openEditQuotation}
          onDelete={() => setDeleteConfirmOpen(true)}
          onPdf={() => void downloadQuotationPdf()}
          pdfRef={quotationPdfRef}
        />
      ) : null}
    </>
  );
}
