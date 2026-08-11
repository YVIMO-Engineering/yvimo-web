import React from "react";
import {
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  FilePenLine,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  calculateQuotationTotals,
  engineeringDefaults,
  recurringDefaults,
  serviceHistoryOptions,
  type QuotationItem,
  type ServiceHistory,
} from "./quotationV1";
type Props = {
  serviceHistory: ServiceHistory;
  onServiceHistory: (v: ServiceHistory) => void;
  items: QuotationItem[];
  onItems: (v: QuotationItem[]) => void;
  rate: number;
  program: {
    sharpeningProgramId: string;
    measurementProgramId: string;
    programRevision: string;
    programStatus: string;
  };
  onProgram: (v: Props["program"]) => void;
  expedite: { enabled: boolean; percent: string };
  onExpedite: (v: Props["expedite"]) => void;
  damageStep?: React.ReactNode;
};
const categoryMeta: Record<
  string,
  { step: string; title: string; description: string; optional?: boolean }
> = {
  one_time_engineering: {
    step: "03",
    title: "Engineering and program preparation",
    description:
      "Define the one-time work required to prepare or modify the process.",
  },
  recurring_service: {
    step: "04",
    title: "Sharpening service",
    description:
      "Review the work that will be charged each time this tool is serviced.",
  },
  addon: {
    step: "06",
    title: "Additional quotation items",
    description:
      "Add logistics, special services or other customer-requested concepts.",
    optional: true,
  },
};
const serviceScenarioContent: Record<
  ServiceHistory,
  {
    title: string;
    description: string;
    icon: React.ComponentType<{ size?: number }>;
  }
> = {
  first_time: {
    title: "New tool or first service",
    description: "No validated sharpening program exists yet.",
    icon: Sparkles,
  },
  existing_program: {
    title: "Ready to sharpen",
    description: "Use an existing, validated program without changes.",
    icon: BadgeCheck,
  },
  program_modification: {
    title: "Program needs changes",
    description: "An existing program must be adjusted for this service.",
    icon: FilePenLine,
  },
  inspection_required: {
    title: "Inspect before quoting",
    description: "Tool condition must be reviewed before confirming a price.",
    icon: Search,
  },
};
export function QuotationV1Sections(p: Props) {
  const categories = [
    "one_time_engineering",
    "recurring_service",
    "addon",
  ] as const;
  const update = (id: string, patch: Partial<QuotationItem>) =>
    p.onItems(p.items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const add = (category: QuotationItem["category"]) =>
    p.onItems([
      ...p.items,
      {
        id: crypto.randomUUID(),
        category,
        pricingType: category === "addon" ? "quantity" : "hourly",
        name: category === "addon" ? "Custom item" : "New concept",
        description: "",
        quantity: 1,
        unit: category === "addon" ? "piece" : "hour",
        hours: 0,
        unitPrice: 0,
        hourlyRate: p.rate,
        internalCost: 0,
        subtotal: 0,
        sortOrder: p.items.length,
        isOptional: false,
        isSelected: true,
        isRecurring: category === "recurring_service",
        isCustomerVisible: true,
        notes: "",
      },
    ]);
  const reset = () =>
    p.onItems([
      ...(p.serviceHistory === "first_time" ||
      p.serviceHistory === "program_modification"
        ? engineeringDefaults(p.rate)
        : []),
      ...recurringDefaults(p.rate),
    ]);
  return (
    <div className="quotation-v1-sections">
      <details open>
        <summary className="quotation-step-summary">
          <b>Step 02</b>
          <span>
            <strong>Select the service scenario</strong>
            <small>
              Choose the option that best describes the tool and its existing
              programs.
            </small>
          </span>
          <em>Required</em>
        </summary>
        <div
          className="quotation-service-history"
          role="radiogroup"
          aria-label="Current service scenario"
        >
          {serviceHistoryOptions.map((o) => {
            const content = serviceScenarioContent[o.value];
            const Icon = content.icon;
            return (
              <button
                className={p.serviceHistory === o.value ? "active" : ""}
                type="button"
                role="radio"
                aria-checked={p.serviceHistory === o.value}
                key={o.value}
                onClick={() => p.onServiceHistory(o.value)}
              >
                <span className="quotation-service-history-icon">
                  <Icon size={21} />
                </span>
                <span>
                  <strong>{content.title}</strong>
                  <small>{content.description}</small>
                </span>
                {p.serviceHistory === o.value ? (
                  <BadgeCheck
                    className="quotation-service-history-check"
                    size={18}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        <div
          className={`quotation-expedite-order${p.expedite.enabled ? " active" : ""}`}
        >
          <label>
            <input
              type="checkbox"
              checked={p.expedite.enabled}
              onChange={(e) =>
                p.onExpedite({ ...p.expedite, enabled: e.target.checked })
              }
            />
            <span>
              <strong>Expedite Order</strong>
              <small>Apply priority-order and expedited coating charges.</small>
            </span>
          </label>
          <label>
            Extra charge
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={!p.expedite.enabled}
              value={p.expedite.percent}
              onChange={(e) =>
                p.onExpedite({ ...p.expedite, percent: e.target.value })
              }
            />
            <span>%</span>
          </label>
        </div>
        {p.serviceHistory !== "first_time" ? (
          <div className="quotation-program-grid">
            <label>
              Sharpening program ID
              <input
                value={p.program.sharpeningProgramId}
                onChange={(e) =>
                  p.onProgram({
                    ...p.program,
                    sharpeningProgramId: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Measurement program ID
              <input
                value={p.program.measurementProgramId}
                onChange={(e) =>
                  p.onProgram({
                    ...p.program,
                    measurementProgramId: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Program revision
              <input
                value={p.program.programRevision}
                onChange={(e) =>
                  p.onProgram({ ...p.program, programRevision: e.target.value })
                }
              />
            </label>
            <label>
              Program status
              <select
                value={p.program.programStatus}
                onChange={(e) =>
                  p.onProgram({ ...p.program, programStatus: e.target.value })
                }
              >
                {[
                  "Not created",
                  "In development",
                  "Validated",
                  "Requires review",
                  "Obsolete",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </details>
      {categories.map((category) => {
        if (
          category === "one_time_engineering" &&
          !["first_time", "program_modification"].includes(p.serviceHistory)
        )
          return null;
        const rows = p.items.filter((i) => i.category === category);
        const meta = categoryMeta[category];
        const includedRows = rows.filter((i) => !i.isOptional || i.isSelected);
        const sectionHours = includedRows
          .filter((i) => i.pricingType === "hourly")
          .reduce((sum, item) => sum + item.hours, 0);
        const sectionSubtotal = includedRows.reduce(
          (sum, item) =>
            sum +
            (item.pricingType === "hourly"
              ? item.hours * item.hourlyRate
              : item.quantity * item.unitPrice),
          0,
        );
        return (
          <React.Fragment key={category}>
            {category === "addon" ? p.damageStep : null}
            <details open>
              <summary className="quotation-step-summary">
                <b>Step {meta.step}</b>
                <span>
                  <strong>{meta.title}</strong>
                  <small>{meta.description}</small>
                </span>
                {meta.optional ? <i>Optional</i> : <em>Required</em>}
              </summary>
              <div className="quotation-item-list">
                <div className="quotation-item-head">
                  <span>Concept</span>
                  <span>{category === "addon" ? "Qty" : "Hours"}</span>
                  <span>Rate / price</span>
                  <span>Subtotal</span>
                  <span>Options</span>
                </div>
                {rows.map((row) => {
                  const index = p.items.findIndex((i) => i.id === row.id);
                  const subtotal =
                    row.pricingType === "hourly"
                      ? row.hours * row.hourlyRate
                      : row.quantity * row.unitPrice;
                  return (
                    <div className="quotation-item-row" key={row.id}>
                      <input
                        value={row.name}
                        onChange={(e) =>
                          update(row.id, {
                            name: e.target.value,
                            description: e.target.value,
                          })
                        }
                      />
                      <input
                        min="0"
                        step="0.25"
                        type="number"
                        value={
                          row.pricingType === "hourly"
                            ? row.hours
                            : row.quantity
                        }
                        onChange={(e) =>
                          update(
                            row.id,
                            row.pricingType === "hourly"
                              ? { hours: Number(e.target.value) }
                              : { quantity: Number(e.target.value) },
                          )
                        }
                      />
                      <input
                        min="0"
                        step="0.01"
                        type="number"
                        value={
                          row.pricingType === "hourly"
                            ? row.hourlyRate
                            : row.unitPrice
                        }
                        onChange={(e) =>
                          update(
                            row.id,
                            row.pricingType === "hourly"
                              ? { hourlyRate: Number(e.target.value) }
                              : { unitPrice: Number(e.target.value) },
                          )
                        }
                      />
                      <strong>${subtotal.toFixed(2)}</strong>
                      <div>
                        <label title="Visible in PDF">
                          <input
                            type="checkbox"
                            checked={row.isCustomerVisible}
                            onChange={(e) =>
                              update(row.id, {
                                isCustomerVisible: e.target.checked,
                              })
                            }
                          />
                          PDF
                        </label>
                        {category === "addon" ? (
                          <>
                            <label>
                              <input
                                type="checkbox"
                                checked={row.isOptional}
                                onChange={(e) =>
                                  update(row.id, {
                                    isOptional: e.target.checked,
                                  })
                                }
                              />
                              Optional
                            </label>
                            {row.isOptional ? (
                              <label>
                                <input
                                  type="checkbox"
                                  checked={row.isSelected}
                                  onChange={(e) =>
                                    update(row.id, {
                                      isSelected: e.target.checked,
                                    })
                                  }
                                />
                                Included
                              </label>
                            ) : null}
                            <label>
                              <input
                                type="checkbox"
                                checked={row.isRecurring}
                                onChange={(e) =>
                                  update(row.id, {
                                    isRecurring: e.target.checked,
                                  })
                                }
                              />
                              Recurring
                            </label>
                          </>
                        ) : null}
                        <button
                          type="button"
                          title="Move up"
                          disabled={index === 0}
                          onClick={() => {
                            const a = [...p.items];
                            [a[index - 1], a[index]] = [a[index], a[index - 1]];
                            p.onItems(a);
                          }}
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          title="Move down"
                          disabled={index === p.items.length - 1}
                          onClick={() => {
                            const a = [...p.items];
                            [a[index + 1], a[index]] = [a[index], a[index + 1]];
                            p.onItems(a);
                          }}
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          type="button"
                          title="Duplicate"
                          onClick={() =>
                            p.onItems([
                              ...p.items,
                              { ...row, id: crypto.randomUUID() },
                            ])
                          }
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() =>
                            p.onItems(p.items.filter((i) => i.id !== row.id))
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="quotation-section-subtotal">
                  {category !== "addon" ? (
                    <span>
                      <b>{sectionHours.toFixed(2)}</b> total hours
                    </span>
                  ) : null}
                  <span>Section subtotal</span>
                  <strong>${sectionSubtotal.toFixed(2)} USD</strong>
                </div>
              </div>
              <button
                className="quotation-add-concept"
                type="button"
                onClick={() => add(category)}
              >
                <Plus size={14} /> Add{" "}
                {category === "addon" ? "item" : "concept"}
              </button>
            </details>
          </React.Fragment>
        );
      })}
      <button
        className="quotation-restore-defaults"
        type="button"
        onClick={reset}
      >
        <RotateCcw size={14} /> Restore defaults
      </button>
    </div>
  );
}

export function QuotationItemsBreakdown({
  items,
  coating,
  damage,
  customerOnly = false,
}: {
  items: QuotationItem[];
  coating: number;
  damage: number;
  customerOnly?: boolean;
}) {
  const visible = items.filter((i) => !customerOnly || i.isCustomerVisible);
  const groups = [
    ["one_time_engineering", "One-time engineering"],
    ["recurring_service", "Recurring sharpening service"],
    ["addon", "Additional items"],
  ] as const;
  const totals = calculateQuotationTotals(items, coating, damage);
  return (
    <div className="quotation-v1-breakdown">
      {groups.map(([category, title]) => {
        const rows = visible.filter(
          (i) => i.category === category && (!i.isOptional || i.isSelected),
        );
        return rows.length ? (
          <section key={category}>
            <strong>{title}</strong>
            {rows.map((i) => (
              <div key={i.id}>
                <span>{i.name}</span>
                <em>
                  $
                  {(i.pricingType === "hourly"
                    ? i.hours * i.hourlyRate
                    : i.quantity * i.unitPrice
                  ).toFixed(2)}
                </em>
              </div>
            ))}
          </section>
        ) : null;
      })}
      <section>
        <div>
          <span>Coating</span>
          <em>${coating.toFixed(2)}</em>
        </div>
        <div>
          <span>Damage surcharge</span>
          <em>${damage.toFixed(2)}</em>
        </div>
      </section>
      {visible.some((i) => i.isOptional && !i.isSelected) ? (
        <section>
          <strong>Optional items · not included</strong>
          {visible
            .filter((i) => i.isOptional && !i.isSelected)
            .map((i) => (
              <div key={i.id}>
                <span>{i.name}</span>
                <em>${(i.quantity * i.unitPrice).toFixed(2)}</em>
              </div>
            ))}
        </section>
      ) : null}
      <footer>
        <span>Total</span>
        <strong>${totals.quotationTotal.toFixed(2)} USD</strong>
      </footer>
      <aside>
        <span>Estimated future repeat service</span>
        <strong>${totals.estimatedFutureRepeatPrice.toFixed(2)} USD</strong>
        <small>
          Estimate only. Final price remains subject to tool condition, coating
          prices, required material removal and process changes.
        </small>
      </aside>
    </div>
  );
}
