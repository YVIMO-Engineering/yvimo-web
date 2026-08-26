import React from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ClipboardList,
  FileText,
  Mail,
  Search,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { exportElementScreenshotToSinglePagePdf } from "../lib/screenshotPdfExport";
import "./productionTrackingWorkspace.css";
import "./productionTrackingViewport.css";

type Props = {
  onNavigate: (path: string) => void;
  organizationId: string;
  organizationName: string;
  organizationLogoUrl?: string;
};
type Customer = { id: string; customer_name: string };
type Order = {
  id: string;
  order_number: string;
  client_name: string | null;
  part_number: string;
  part_name: string;
  piece_type: string | null;
  status: string;
  planned_quantity: number;
  completed_quantity: number;
  scrap_quantity: number;
  assigned_work_center: string;
  assigned_station: string | null;
  created_at: string;
};
type Serial = {
  production_order_id: string;
  piece_sequence: number;
  tool_id: string | null;
  serial_number: string;
  assigned_station: string | null;
  before_height: number | null;
  before_notch: number | null;
  before_tooth_length: number | null;
  stock_to_remove: number | null;
  result: string | null;
  reported_at: string | null;
  traceability_id: string | null;
};
type Traceability = {
  id: string;
  payload: Record<string, unknown> | null;
  after_tooth_length: number | null;
};
type Row = {
  key: string;
  order: Order;
  serial: Serial | null;
  traceability: Traceability | null;
};
type Preset =
  | "this-month"
  | "last-month"
  | "this-week"
  | "last-week"
  | "this-year"
  | "custom";
const toInput = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
const getRange = (preset: Exclude<Preset, "custom">) => {
  const now = new Date(),
    day = now.getDay() || 7;
  if (preset === "this-month")
    return {
      from: toInput(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: toInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  if (preset === "last-month")
    return {
      from: toInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: toInput(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  if (preset === "this-year")
    return {
      from: `${now.getFullYear()}-01-01`,
      to: `${now.getFullYear()}-12-31`,
    };
  const from = new Date(now);
  from.setDate(now.getDate() - day + 1 + (preset === "last-week" ? -7 : 0));
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  return { from: toInput(from), to: toInput(to) };
};
const parts = [
  ["all", "All parts"],
  ["hobs", "Hob"],
  ["shaper", "Shaper"],
  ["shavers", "Shaver"],
  ["skiving", "Skiving"],
  ["wheel", "Wheel"],
  ["other", "Other"],
];
const date = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
const number = (value?: number | null) =>
  value == null
    ? "—"
    : Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
const payloadValue = (traceability: Traceability | null, key: string) => {
  const value = traceability?.payload?.[key];
  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
};
const damageValue = (traceability: Traceability | null) =>
  traceability?.payload?.shaver_damage === true
    ? "Yes"
    : traceability?.payload?.shaver_damage === false
      ? "No"
      : "—";

function CustomerSearch({
  items,
  value,
  onChange,
}: {
  items: Customer[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false),
    [search, setSearch] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const selected = items.find((item) => item.id === value),
    visible = items.filter((item) =>
      item.customer_name.toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <div className="tracking-customer" ref={ref}>
      <button type="button" onClick={() => setOpen((current) => !current)}>
        <Search size={16} />
        <span>{selected?.customer_name || "Select a client"}</span>
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div className="tracking-customer-menu">
          <label>
            <Search size={14} />
            <input
              autoFocus
              placeholder="Search clients…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {visible.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => {
                onChange(item.id);
                setOpen(false);
                setSearch("");
              }}
            >
              <span>{item.customer_name}</span>
              {item.id === value ? <Check size={14} /> : null}
            </button>
          ))}
          {!visible.length ? <p>No clients found.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function ProductionTrackingWorkspace({
  onNavigate,
  organizationId,
  organizationName,
  organizationLogoUrl = "",
}: Props) {
  const initial = getRange("this-month");
  const pdfRef = React.useRef<HTMLElement>(null);
  const [customers, setCustomers] = React.useState<Customer[]>([]),
    [customerId, setCustomerId] = React.useState(""),
    [stationNames, setStationNames] = React.useState<Record<string, string>>(
      {},
    ),
    [range, setRange] = React.useState(initial),
    [preset, setPreset] = React.useState<Preset>("this-month"),
    [part, setPart] = React.useState("all"),
    [rows, setRows] = React.useState<Row[]>([]),
    [loading, setLoading] = React.useState(false),
    [error, setError] = React.useState("");
  const [pdfStatus, setPdfStatus] = React.useState<
    "idle" | "generating" | "generated" | "error"
  >("idle");
  React.useEffect(() => {
    void Promise.all([
      supabase
        .from("mes_customers")
        .select("id, customer_name")
        .eq("organization_id", organizationId)
        .order("customer_name"),
      supabase
        .from("mes_work_center_stations")
        .select("code, name")
        .eq("organization_id", organizationId),
    ]).then(([customerResult, stationResult]) => {
      if (customerResult.error || stationResult.error) {
        setError(
          (customerResult.error ?? stationResult.error)?.message ??
            "Unable to load filters",
        );
        return;
      }
      const next = (customerResult.data ?? []) as Customer[];
      setCustomers(next);
      setCustomerId((current) => current || next[0]?.id || "");
      setStationNames(
        Object.fromEntries(
          (stationResult.data ?? []).map((station) => [
            station.code,
            station.name,
          ]),
        ),
      );
    });
  }, [organizationId]);
  const load = React.useCallback(async () => {
    if (!customerId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError("");
    let query = supabase
      .from("mes_production_orders")
      .select(
        "id, order_number, client_name, part_number, part_name, piece_type, status, planned_quantity, completed_quantity, scrap_quantity, assigned_work_center, assigned_station, created_at",
      )
      .eq("organization_id", organizationId)
      .eq("customer_id", customerId)
      .eq("status", "completed")
      .gte("created_at", `${range.from}T00:00:00`)
      .lte("created_at", `${range.to}T23:59:59.999`)
      .order("created_at", { ascending: false });
    if (part !== "all") query = query.eq("piece_type", part);
    const { data, error: e } = await query;
    if (e) {
      setError(e.message);
      setRows([]);
      setLoading(false);
      return;
    }
    const orders = (data ?? []) as Order[];
    if (!orders.length) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data: serialData, error: se } = await supabase
      .from("mes_production_serials")
      .select(
        "production_order_id, piece_sequence, tool_id, serial_number, assigned_station, before_height, before_notch, before_tooth_length, stock_to_remove, result, reported_at, traceability_id",
      )
      .eq("organization_id", organizationId)
      .in(
        "production_order_id",
        orders.map((order) => order.id),
      )
      .order("piece_sequence");
    if (se) {
      setError(se.message);
      setRows([]);
      setLoading(false);
      return;
    }
    const serials = (serialData ?? []) as Serial[],
      traceabilityIds = serials
        .map((serial) => serial.traceability_id)
        .filter((id): id is string => Boolean(id));
    let traceabilityById = new Map<string, Traceability>();
    if (traceabilityIds.length) {
      const { data: traceabilityData, error: te } = await supabase
        .from("mes_operator_terminal_traceability")
        .select("id, payload, after_tooth_length")
        .eq("organization_id", organizationId)
        .in("id", traceabilityIds);
      if (te) {
        setError(te.message);
        setRows([]);
        setLoading(false);
        return;
      }
      traceabilityById = new Map(
        ((traceabilityData ?? []) as Traceability[]).map((record) => [
          record.id,
          record,
        ]),
      );
    }
    const grouped = new Map<string, Serial[]>();
    serials.forEach((serial) => {
      const named = {
        ...serial,
        assigned_station: serial.assigned_station
          ? stationNames[serial.assigned_station] || serial.assigned_station
          : null,
      };
      grouped.set(serial.production_order_id, [
        ...(grouped.get(serial.production_order_id) ?? []),
        named,
      ]);
    });
    setRows(
      orders.flatMap((order) => {
        const namedOrder = {
          ...order,
          assigned_station: order.assigned_station
            ? stationNames[order.assigned_station] || order.assigned_station
            : null,
        };
        const orderSerials = grouped.get(order.id) ?? [];
        return orderSerials.length
          ? orderSerials.map((serial) => ({
              key: `${order.id}:${serial.piece_sequence}`,
              order: namedOrder,
              serial,
              traceability: serial.traceability_id
                ? (traceabilityById.get(serial.traceability_id) ?? null)
                : null,
            }))
          : [
              {
                key: order.id,
                order: namedOrder,
                serial: null,
                traceability: null,
              },
            ];
      }),
    );
    setLoading(false);
  }, [customerId, organizationId, part, range.from, range.to, stationNames]);
  React.useEffect(() => {
    void load();
  }, [load]);
  const quick = (next: Exclude<Preset, "custom">) => {
    setPreset(next);
    setRange(getRange(next));
  };
  const orderCount = new Set(rows.map((row) => row.order.id)).size,
    good = rows.filter((row) => row.serial?.result === "good").length,
    scrap = rows.filter((row) => row.serial?.result === "scrap").length,
    isShaver = part === "shavers",
    isShaper = part === "shaper",
    isAllParts = part === "all";

  const processData = (row: Row) => {
    const pieceType = (row.order.piece_type ?? "").toLowerCase();
    const values = pieceType.includes("shaver")
      ? [
          [
            "No. Afilado",
            payloadValue(row.traceability, "shaver_sharpening_number"),
          ],
          ["Diameter", payloadValue(row.traceability, "shaver_diameter")],
          ["Span", payloadValue(row.traceability, "shaver_span")],
          ["Teeth", payloadValue(row.traceability, "shaver_teeth")],
          ["Damage", damageValue(row.traceability)],
        ]
      : pieceType.includes("shaper") || pieceType.includes("tallador")
        ? [
            ["Before height", payloadValue(row.traceability, "before_height")],
            ["Stock to remove", number(row.serial?.stock_to_remove)],
            ["After height", payloadValue(row.traceability, "after_height")],
          ]
        : [
            ["Before notch", number(row.serial?.before_notch)],
            ["Before tooth length", number(row.serial?.before_tooth_length)],
            ["Stock to remove", number(row.serial?.stock_to_remove)],
            [
              "After tooth length",
              number(row.traceability?.after_tooth_length),
            ],
          ];
    return (
      <div className="tracking-process-data">
        {values.map(([label, value]) => (
          <span key={label}>
            <small>{label}</small>
            <b>{value}</b>
          </span>
        ))}
      </div>
    );
  };
  const selectedCustomer =
    customers.find((customer) => customer.id === customerId)?.customer_name ??
    "Client";
  const groupedPdfRows = [
    ...rows.reduce((groups, row) => {
      const key = row.order.piece_type || "other";
      groups.set(key, [...(groups.get(key) ?? []), row]);
      return groups;
    }, new Map<string, Row[]>()),
  ].sort(([left], [right]) => left.localeCompare(right));
  const generatePdf = async () => {
    if (!pdfRef.current || pdfStatus === "generating" || !rows.length) return;
    setPdfStatus("generating");
    try {
      const safeClient = selectedCustomer.replace(
        /[<>:"/\\|?*\u0000-\u001f]+/g,
        "-",
      );
      await exportElementScreenshotToSinglePagePdf(
        pdfRef.current,
        `Production Tracking - ${safeClient} - ${range.from} to ${range.to}.pdf`,
      );
      setPdfStatus("generated");
      window.setTimeout(() => setPdfStatus("idle"), 3000);
    } catch (pdfError) {
      console.error("Unable to generate production tracking PDF", pdfError);
      setPdfStatus("error");
      window.setTimeout(() => setPdfStatus("idle"), 5000);
    }
  };
  return (
    <section className="production-tracking">
      <header>
        <button
          type="button"
          onClick={() =>
            onNavigate("/workspace/manufacturing-ops/intelligence")
          }
        >
          <ArrowLeft size={16} /> Ops Intelligence
        </button>
        <div>
          <span>OPS INTELLIGENCE / ANALYSIS TOOL</span>
          <h1>Production Tracking</h1>
          <p>
            Historical production records by customer, order and serialized
            piece
          </p>
        </div>
        <div className="tracking-header-actions">
          <button
            type="button"
            onClick={() => void generatePdf()}
            disabled={loading || !rows.length || pdfStatus === "generating"}
          >
            <FileText size={16} />
            {pdfStatus === "generating"
              ? "Generating…"
              : pdfStatus === "generated"
                ? "PDF generated"
                : pdfStatus === "error"
                  ? "Try Generate PDF"
                  : "Generate PDF"}
          </button>
          <button type="button" disabled title="Coming soon">
            <Mail size={16} /> Email Reporting
          </button>
        </div>
      </header>
      <section className="tracking-filters">
        <label>
          <span>Client</span>
          <CustomerSearch
            items={customers}
            value={customerId}
            onChange={setCustomerId}
          />
        </label>
        <label>
          <span>Part type</span>
          <select
            value={part}
            onChange={(event) => setPart(event.target.value)}
          >
            {parts.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="tracking-range">
          <nav>
            {(
              [
                "this-month",
                "last-month",
                "this-week",
                "last-week",
                "this-year",
              ] as const
            ).map((item) => (
              <button
                type="button"
                className={preset === item ? "active" : ""}
                onClick={() => quick(item)}
                key={item}
              >
                {item
                  .split("-")
                  .map((word) => word[0].toUpperCase() + word.slice(1))
                  .join(" ")}
              </button>
            ))}
          </nav>
          <label>
            <span>From</span>
            <input
              type="date"
              value={range.from}
              onChange={(event) => {
                setPreset("custom");
                setRange((current) => ({
                  ...current,
                  from: event.target.value,
                }));
              }}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={range.to}
              onChange={(event) => {
                setPreset("custom");
                setRange((current) => ({ ...current, to: event.target.value }));
              }}
            />
          </label>
        </div>
      </section>
      {error ? <div className="tracking-error">{error}</div> : null}
      <section className="tracking-kpis">
        <article>
          <span>Production orders</span>
          <strong>{orderCount}</strong>
        </article>
        <article>
          <span>Tracked pieces</span>
          <strong>{rows.filter((row) => row.serial).length}</strong>
        </article>
        <article className="good">
          <span>Completed good</span>
          <strong>{good}</strong>
        </article>
        <article className="scrap">
          <span>Scrap pieces</span>
          <strong>{scrap}</strong>
        </article>
      </section>
      <section className="tracking-table">
        <header>
          <div>
            <span>PRODUCTION HISTORY</span>
            <h2>Customer order detail</h2>
            <p>
              Structure based on the MAGNA tracking workbook; values come
              directly from MES records.
            </p>
          </div>
          <strong>
            <ClipboardList size={16} />
            {rows.length} records
          </strong>
        </header>
        <div>
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Received</th>
                <th>Customer</th>
                <th>Part type</th>
                <th>Part number</th>
                <th>Tool ID</th>
                <th>Serial number</th>
                {isAllParts ? (
                  <th>Process data</th>
                ) : isShaver ? (
                  <>
                    <th>No. Afilado</th>
                    <th>Diameter</th>
                    <th>Span</th>
                    <th>Teeth</th>
                    <th>Damage</th>
                  </>
                ) : isShaper ? (
                  <>
                    <th>Before height</th>
                    <th>Stock to remove</th>
                    <th>After height</th>
                  </>
                ) : (
                  <>
                    <th>Before notch</th>
                    <th>Before tooth length</th>
                    <th>Stock to remove</th>
                    <th>After tooth length</th>
                  </>
                )}
                <th>Machine</th>
                <th>Reported</th>
                <th>Result</th>
                <th className="tracking-status-column">Status</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const { key, order, serial, traceability } = row;
                return (
                  <tr key={key}>
                    <td>
                      <strong>#{order.order_number}</strong>
                    </td>
                    <td>{date(order.created_at)}</td>
                    <td>{order.client_name || "—"}</td>
                    <td>
                      <span className="part-badge">
                        {order.piece_type || "other"}
                      </span>
                    </td>
                    <td>{order.part_number || order.part_name || "—"}</td>
                    <td>{serial?.tool_id || "—"}</td>
                    <td>{serial?.serial_number || "—"}</td>
                    {isAllParts ? (
                      <td>{processData(row)}</td>
                    ) : isShaver ? (
                      <>
                        <td>
                          {payloadValue(
                            traceability,
                            "shaver_sharpening_number",
                          )}
                        </td>
                        <td>{payloadValue(traceability, "shaver_diameter")}</td>
                        <td>{payloadValue(traceability, "shaver_span")}</td>
                        <td>{payloadValue(traceability, "shaver_teeth")}</td>
                        <td>{damageValue(traceability)}</td>
                      </>
                    ) : isShaper ? (
                      <>
                        <td>{payloadValue(traceability, "before_height")}</td>
                        <td>{number(serial?.stock_to_remove)}</td>
                        <td>{payloadValue(traceability, "after_height")}</td>
                      </>
                    ) : (
                      <>
                        <td>{number(serial?.before_notch)}</td>
                        <td>{number(serial?.before_tooth_length)}</td>
                        <td>{number(serial?.stock_to_remove)}</td>
                        <td>{number(traceability?.after_tooth_length)}</td>
                      </>
                    )}
                    <td>
                      {serial?.assigned_station ||
                        order.assigned_station ||
                        order.assigned_work_center ||
                        "—"}
                    </td>
                    <td>{date(serial?.reported_at)}</td>
                    <td>
                      <b className={`result ${serial?.result || "pending"}`}>
                        {serial?.result || "pending"}
                      </b>
                    </td>
                    <td className="tracking-status-column">{order.status}</td>
                    <td>
                      {order.completed_quantity + order.scrap_quantity} /{" "}
                      {order.planned_quantity}
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td
                    className="empty"
                    colSpan={
                      isAllParts ? 13 : isShaver ? 17 : isShaper ? 15 : 16
                    }
                  >
                    {loading
                      ? "Loading production history…"
                      : "No production records match the selected filters."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <div className="tracking-pdf-stage" aria-hidden="true">
        <article className="tracking-pdf-document" ref={pdfRef}>
          <header>
            <div>
              <span>{organizationName} · PRODUCTION REPORT</span>
              <h1>Production Tracking</h1>
              <p>{selectedCustomer}</p>
            </div>
            <div className="tracking-pdf-brand">
              {organizationLogoUrl ? (
                <div className="tracking-pdf-logo">
                  <img
                    crossOrigin="anonymous"
                    src={organizationLogoUrl}
                    alt={organizationName}
                  />
                </div>
              ) : (
                <div className="tracking-pdf-logo tracking-pdf-logo-fallback">
                  {organizationName.trim().charAt(0).toUpperCase() || "Y"}
                </div>
              )}
              <aside>
                <strong>
                  {range.from} — {range.to}
                </strong>
                <span>Generated {new Date().toLocaleDateString()}</span>
              </aside>
            </div>
          </header>
          <section className="tracking-pdf-summary">
            <span>
              <small>Production orders</small>
              <b>{orderCount}</b>
            </span>
            <span>
              <small>Tracked pieces</small>
              <b>{rows.filter((row) => row.serial).length}</b>
            </span>
            <span>
              <small>Completed good</small>
              <b>{good}</b>
            </span>
            <span>
              <small>Scrap pieces</small>
              <b>{scrap}</b>
            </span>
          </section>
          {groupedPdfRows.map(([pieceType, partRows]) => (
            <section className="tracking-pdf-part" key={pieceType}>
              <header>
                <div>
                  <span>PART TYPE</span>
                  <h2>
                    {parts.find(([value]) => value === pieceType)?.[1] ??
                      pieceType}
                  </h2>
                </div>
                <strong>{partRows.length} records</strong>
              </header>
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Received</th>
                    <th>Part number</th>
                    <th>Tool ID</th>
                    <th>Serial number</th>
                    <th>Process data</th>
                    <th>Machine</th>
                    <th>Reported</th>
                    <th>Result</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {partRows.map((row) => (
                    <tr key={`pdf:${row.key}`}>
                      <td>#{row.order.order_number}</td>
                      <td>{date(row.order.created_at)}</td>
                      <td>
                        {row.order.part_number || row.order.part_name || "—"}
                      </td>
                      <td>{row.serial?.tool_id || "—"}</td>
                      <td>{row.serial?.serial_number || "—"}</td>
                      <td>{processData(row)}</td>
                      <td>
                        {row.serial?.assigned_station ||
                          row.order.assigned_station ||
                          row.order.assigned_work_center ||
                          "—"}
                      </td>
                      <td>{date(row.serial?.reported_at)}</td>
                      <td>{row.serial?.result || "pending"}</td>
                      <td>
                        {row.order.completed_quantity +
                          row.order.scrap_quantity}{" "}
                        / {row.order.planned_quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          <footer>
            Filtered production history · {selectedCustomer} · {range.from} to{" "}
            {range.to}
          </footer>
        </article>
      </div>
    </section>
  );
}
