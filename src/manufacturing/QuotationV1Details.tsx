import React from "react";
import { X } from "lucide-react";
import {
  calculateQuotationTotals,
  type QuotationItem,
  type ServiceHistory,
} from "./quotationV1";
import type { DamagePricingMethod } from "./QuotationDamageSurchargeStep";

type Quote = {
  quotation_number: string;
  client_name: string;
  part_type: string;
  tool_id: string;
  serial_number: string;
  measurement_unit: "in" | "mm";
  length_mm: number;
  diameter_mm: number;
  damage_inches: number;
  coating_type: string;
  coating_provider?: "Balzers" | "Voestalpine" | null;
  design: string;
  work_center: string;
  valid_until: string;
  created_at: string;
  status: string;
  coating_price: number;
  damage_surcharge: number;
  service_history?: ServiceHistory | null;
  sharpening_program_id?: string | null;
  measurement_program_id?: string | null;
  program_revision?: string | null;
  program_status?: string | null;
};
type CoatingSource = {
  table: string;
  row: string;
  column: string;
  price: number;
} | null;
type DamageSettings = {
  method: DamagePricingMethod;
  percent: string;
  fixedAmount: string;
  note: string;
  suggestedAmount: number;
};
const history: Record<string, string> = {
  first_time: "New tool or first service",
  existing_program: "Ready to sharpen · validated program",
  program_modification: "Existing program requires modification",
  inspection_required: "Inspection required before final quotation",
};
const methodLabel: Record<DamagePricingMethod, string> = {
  standard: "Recommended standard rule",
  percentage: "Negotiated percentage",
  fixed: "Negotiated fixed surcharge",
  waived: "Surcharge waived",
};

function readDamageSettings(
  items: QuotationItem[],
  fallback: number,
): DamageSettings {
  const item = items.find((value) => value.category === "damage_surcharge");
  try {
    const saved = JSON.parse(item?.notes || "{}");
    return {
      method: saved.method ?? "fixed",
      percent: String(saved.percent ?? "0"),
      fixedAmount: String(saved.fixedAmount ?? fallback),
      note: saved.note ?? item?.description ?? "",
      suggestedAmount: Number(saved.suggestedAmount ?? fallback),
    };
  } catch {
    return {
      method: "fixed",
      percent: "0",
      fixedAmount: String(fallback),
      note: item?.description ?? "",
      suggestedAmount: fallback,
    };
  }
}
const money = (value: number) => `$${Number(value).toFixed(2)}`;

function StepTitle({
  step,
  title,
  description,
  optional = false,
}: {
  step: string;
  title: string;
  description: string;
  optional?: boolean;
}) {
  return (
    <header className="quotation-detail-step-title">
      <b>Step {step}</b>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <em>{optional ? "Optional" : "Required"}</em>
    </header>
  );
}

function ServiceSection({
  step,
  title,
  description,
  items,
}: {
  step: string;
  title: string;
  description: string;
  items: QuotationItem[];
}) {
  const hours = items.reduce(
      (sum, item) => sum + (item.pricingType === "hourly" ? item.hours : 0),
      0,
    ),
    subtotal = items.reduce(
      (sum, item) =>
        sum +
        (item.pricingType === "hourly"
          ? item.hours * item.hourlyRate
          : item.quantity * item.unitPrice),
      0,
    );
  return (
    <section className="quotation-detail-step">
      <StepTitle step={step} title={title} description={description} />
      <div className="quotation-detail-items">
        <div className="quotation-detail-item-head">
          <span>Concept</span>
          <span>
            {items.some((item) => item.pricingType === "hourly")
              ? "Hours"
              : "Qty"}
          </span>
          <span>Rate / price</span>
          <span>Subtotal</span>
        </div>
        {items.map((item) => (
          <div className="quotation-detail-item" key={item.id}>
            <span>{item.name}</span>
            <span>
              {item.pricingType === "hourly"
                ? item.hours.toFixed(2)
                : item.quantity.toFixed(2)}
            </span>
            <span>
              {money(
                item.pricingType === "hourly"
                  ? item.hourlyRate
                  : item.unitPrice,
              )}
            </span>
            <strong>
              {money(
                item.pricingType === "hourly"
                  ? item.hours * item.hourlyRate
                  : item.quantity * item.unitPrice,
              )}
            </strong>
          </div>
        ))}
      </div>
      <footer>
        {items.some((item) => item.pricingType === "hourly") ? (
          <span>
            <b>{hours.toFixed(2)}</b> total hours
          </span>
        ) : (
          <span />
        )}
        <span>
          Section subtotal <strong>{money(subtotal)} USD</strong>
        </span>
      </footer>
    </section>
  );
}

function DetailContent({
  quote,
  items,
  coatingSource,
  customerOnly = false,
}: {
  quote: Quote;
  items: QuotationItem[];
  coatingSource: CoatingSource;
  customerOnly?: boolean;
}) {
  const unit = quote.measurement_unit || "mm",
    length =
      unit === "in" ? Number(quote.length_mm) / 25.4 : Number(quote.length_mm),
    diameter =
      unit === "in"
        ? Number(quote.diameter_mm) / 25.4
        : Number(quote.diameter_mm),
    damage =
      unit === "mm"
        ? Number(quote.damage_inches) * 25.4
        : Number(quote.damage_inches),
    displayItems = items.filter(
      (item) => !customerOnly || item.isCustomerVisible,
    ),
    engineering = displayItems.filter(
      (item) => item.category === "one_time_engineering",
    ),
    recurring = displayItems.filter(
      (item) => item.category === "recurring_service",
    ),
    addons = displayItems.filter(
      (item) =>
        item.category === "addon" && (!item.isOptional || item.isSelected),
    ),
    damageSettings = readDamageSettings(items, Number(quote.damage_surcharge)),
    expediteOrderItem = items.find(
      (item) => item.name === "Expedite Order surcharge",
    ),
    expediteCoatingItem = items.find(
      (item) => item.name === "Expedite coating surcharge",
    ),
    expeditePercent = (() => {
      try {
        return Number(JSON.parse(expediteOrderItem?.notes || "{}").percent || 30);
      } catch {
        return 30;
      }
    })(),
    damageSteps =
      Number(quote.damage_inches) > 0.02
        ? Math.ceil((Number(quote.damage_inches) - 0.02) / 0.01)
        : 0,
    totals = calculateQuotationTotals(
      items.filter((item) => item.category !== "damage_surcharge"),
      Number(quote.coating_price),
      Number(quote.damage_surcharge),
    ),
    totalHours = displayItems
      .filter(
        (item) =>
          item.pricingType === "hourly" && item.category !== "damage_surcharge",
      )
      .reduce((sum, item) => sum + item.hours, 0),
    hasEngineeringNote =
      quote.service_history === "first_time" &&
      totals.oneTimeEngineeringSubtotal > 0,
    hasDamageNote =
      Number(quote.damage_inches) > 0.02 && Number(quote.damage_surcharge) > 0,
    engineeringNoteNumber = hasEngineeringNote ? 1 : null,
    damageNoteNumber = hasDamageNote ? (hasEngineeringNote ? 2 : 1) : null;
  return (
    <div className="quotation-detail-content">
      <section className="quotation-detail-step">
        <StepTitle
          step="01"
          title="Tool identification"
          description="Customer, tool references and dimensions used for this quotation."
        />
        <div className="quotation-v1-tech">
          <div>
            <span>Client</span>
            <strong>{quote.client_name}</strong>
          </div>
          <div>
            <span>Part type</span>
            <strong>{quote.part_type}</strong>
          </div>
          <div>
            <span>Tool ID</span>
            <strong>{quote.tool_id}</strong>
          </div>
          <div>
            <span>Serial</span>
            <strong>{quote.serial_number}</strong>
          </div>
          <div>
            <span>Measurement unit</span>
            <strong>{unit}</strong>
          </div>
          <div>
            <span>Design</span>
            <strong>{quote.design}</strong>
          </div>
          <div>
            <span>Length / thickness</span>
            <strong>
              {length.toFixed(3)} {unit}
            </strong>
            <small>{Number(quote.length_mm).toFixed(2)} mm normalized</small>
          </div>
          <div>
            <span>Diameter</span>
            <strong>
              {diameter.toFixed(3)} {unit}
            </strong>
            <small>{Number(quote.diameter_mm).toFixed(2)} mm normalized</small>
          </div>
          <div>
            <span>Damage to remove</span>
            <strong>
              {damage.toFixed(3)} {unit}
            </strong>
            <small>
              {Number(quote.damage_inches).toFixed(3)} in normalized
            </small>
          </div>
          <div>
            <span>Coating provider</span>
            <strong>{quote.coating_provider ?? "Balzers"}</strong>
          </div>
          <div>
            <span>Coating</span>
            <strong>{quote.coating_type}</strong>
          </div>
          <div>
            <span>Work center</span>
            <strong>{quote.work_center}</strong>
          </div>
          <div>
            <span>Valid until</span>
            <strong>{quote.valid_until}</strong>
          </div>
        </div>
      </section>
      <section className="quotation-detail-step">
        <StepTitle
          step="02"
          title="Service scenario"
          description="Tool context and existing program references."
        />
        <div className="quotation-detail-scenario">
          <strong>
            {history[quote.service_history ?? ""] ?? "Legacy quotation"}
          </strong>
          <div>
            <span>Expedite Order</span>
            <b>
              {expediteOrderItem && expediteCoatingItem
                ? `Sharpening ${expeditePercent.toFixed(2)}% + coating 50%`
                : expediteOrderItem
                  ? `Sharpening ${expeditePercent.toFixed(2)}%`
                  : expediteCoatingItem
                    ? "Coating 50%"
                    : "No"}
            </b>
          </div>
          <div>
            <span>Sharpening program</span>
            <b>{quote.sharpening_program_id || "Not referenced"}</b>
          </div>
          <div>
            <span>Measurement program</span>
            <b>{quote.measurement_program_id || "Not referenced"}</b>
          </div>
          <div>
            <span>Revision</span>
            <b>{quote.program_revision || "No revision"}</b>
          </div>
          <div>
            <span>Program status</span>
            <b>{quote.program_status || "Not created"}</b>
          </div>
        </div>
      </section>
      {engineering.length ? (
        <ServiceSection
          step="03"
          title="Engineering and program preparation"
          description="One-time work required to prepare or modify the process."
          items={engineering}
        />
      ) : null}
      <ServiceSection
        step="04"
        title="Sharpening service"
        description="Work charged for the recurring sharpening service."
        items={recurring}
      />
      <section className="quotation-detail-step">
        <StepTitle
          step="05"
          title="Damage surcharge"
          description="Applied commercial adjustment and its calculation context."
        />
        <div className="quotation-detail-damage">
          <div>
            <span>Method</span>
            <strong>{methodLabel[damageSettings.method]}</strong>
          </div>
          <div>
            <span>Recommended</span>
            <strong>{money(damageSettings.suggestedAmount)} USD</strong>
          </div>
          <div>
            <span>Applied</span>
            <strong>{money(Number(quote.damage_surcharge))} USD</strong>
          </div>
          <div>
            <span>{damageSettings.method === "percentage" ? "Custom rule" : "Standard rule"}</span>
            <strong>
              {damageSettings.method === "percentage" ? Number(damageSettings.percent).toFixed(2) : "25.00"}% × {damageSteps} increment{damageSteps === 1 ? "" : "s"}
            </strong>
          </div>
          <p>
            Threshold: 0.020 in · Each additional 0.010 in counts as one
            chargeable increment.
          </p>
          {damageSettings.note ? (
            <p>
              <b>Negotiation note:</b> {damageSettings.note}
            </p>
          ) : null}
        </div>
      </section>
      {addons.length ? (
        <ServiceSection
          step="06"
          title="Additional quotation items"
          description="Additional included services and customer-requested concepts."
          items={addons}
        />
      ) : null}
      <section className="quotation-detail-summary">
        <h3>Price calculation</h3>
        <dl>
          {totals.oneTimeEngineeringSubtotal > 0 ? (
            <>
              <dt>
                Engineering & program preparation
                {engineeringNoteNumber ? (
                  <sup>{engineeringNoteNumber}</sup>
                ) : null}
              </dt>
              <dd>{money(totals.oneTimeEngineeringSubtotal)}</dd>
            </>
          ) : null}
          <dt>Sharpening service</dt>
          <dd>{money(totals.recurringServiceSubtotal)}</dd>
          <dt>Coating</dt>
          <dd>{money(Number(quote.coating_price))}</dd>
          <dt>
            Damage surcharge
            {damageNoteNumber ? <sup>{damageNoteNumber}</sup> : null}
          </dt>
          <dd>{money(Number(quote.damage_surcharge))}</dd>
          {totals.addonsSubtotal > 0 ? (
            <>
              <dt>Additional quotation items</dt>
              <dd>{money(totals.addonsSubtotal)}</dd>
            </>
          ) : null}
          {expediteOrderItem ? (
            <>
              <dt>
                Expedite Order ({expeditePercent.toFixed(2)}% of sharpening)
              </dt>
              <dd>{money(expediteOrderItem.subtotal)}</dd>
            </>
          ) : null}
          {expediteCoatingItem ? (
            <>
              <dt>Expedite coating (50%)</dt>
              <dd>{money(expediteCoatingItem.subtotal)}</dd>
            </>
          ) : null}
          <dt>Total service hours</dt>
          <dd>{totalHours.toFixed(2)} hrs</dd>
          <dt>Total</dt>
          <dd>{money(totals.quotationTotal)} USD</dd>
        </dl>
        {coatingSource ? (
          <div className="quotation-detail-coating">
            <strong>Coating price source</strong>
            <span>{coatingSource.table}</span>
            <dl>
              <dt>Normalized input</dt>
              <dd>
                {Number(quote.length_mm).toFixed(2)} mm × Ø{" "}
                {Number(quote.diameter_mm).toFixed(2)} mm
              </dd>
              <dt>Selected row</dt>
              <dd>{coatingSource.row}</dd>
              <dt>Selected column</dt>
              <dd>{coatingSource.column}</dd>
              <dt>Cell value</dt>
              <dd>{money(coatingSource.price)} USD</dd>
            </dl>
          </div>
        ) : quote.coating_provider === "Voestalpine" ? (
          <section className="quotation-detail-coating">
            <strong>Coating price source</strong>
            <span>Voestalpine · manually entered supplier price</span>
            <dl><dt>Price</dt><dd>{money(quote.coating_price)} USD</dd></dl>
          </section>
        ) : null}
      </section>
      {hasEngineeringNote || hasDamageNote ? (
        <div className="quotation-detail-notes">
          {hasEngineeringNote ? (
            <p>
              <b>{engineeringNoteNumber}</b>
              <span>
                This quotation includes one-time engineering, measurement and
                programming activities required to establish and validate the
                sharpening process. Future services may exclude these charges if
                the geometry, condition and process remain unchanged.
              </span>
            </p>
          ) : null}
          {hasDamageNote ? (
            <p>
              <b>{damageNoteNumber}</b>
              <span>
                A damage surcharge applies because the tool requires{" "}
                {Number(quote.damage_inches).toFixed(3)} in of material removal,
                which exceeds the maximum included allowance of 0.020 in. The
                additional charge accounts for the extra machine cycles and
                processing effort required by the tool's condition.
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function QuotationV1Details({
  quote,
  items,
  organizationName,
  organizationLogoUrl,
  coatingSource,
  onClose,
  onEdit,
  onDelete,
  onPdf,
  pdfRef,
}: {
  quote: Quote;
  items: QuotationItem[];
  organizationName: string;
  organizationLogoUrl?: string;
  coatingSource: CoatingSource;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPdf: () => void;
  pdfRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div className="quotation-modal-backdrop quotation-v1-details-backdrop">
        <section className="quotation-modal quotation-v1-details-modal">
          <header>
            <div>
              <span>Quotation details · V1</span>
              <h3>
                {quote.quotation_number} · {quote.client_name}
              </h3>
              <p>
                Created {new Date(quote.created_at).toLocaleDateString()} ·
                Valid until {quote.valid_until}
              </p>
            </div>
            <button type="button" onClick={onClose}>
              <X size={20} />
            </button>
          </header>
          <div className="quotation-v1-details-body">
            <DetailContent
              quote={quote}
              items={items}
              coatingSource={coatingSource}
            />
          </div>
          <footer className="quotation-details-actions">
            <button className="danger" type="button" onClick={onDelete}>
              Delete
            </button>
            <span />
            <button type="button" onClick={onEdit}>
              Edit
            </button>
            <button className="pdf" type="button" onClick={onPdf}>
              Generate PDF
            </button>
          </footer>
        </section>
      </div>
      <div className="quotation-pdf-stage">
        <article
          className="quotation-pdf-document quotation-v1-pdf"
          ref={pdfRef}
        >
          <header>
            <div className="quotation-pdf-header-copy">
              <span>
                {organizationName} · {quote.work_center}
              </span>
              <h1>Quotation {quote.quotation_number}</h1>
              <p>Prepared for {quote.client_name}</p>
            </div>
            <div className="quotation-pdf-header-brand">
              {organizationLogoUrl ? (
                <div className="quotation-pdf-organization-logo-frame">
                  <img
                    className="quotation-pdf-organization-logo"
                    crossOrigin="anonymous"
                    src={organizationLogoUrl}
                    alt={organizationName}
                  />
                </div>
              ) : (
                <div className="quotation-pdf-organization-logo-fallback">
                  {organizationName.trim().charAt(0).toUpperCase() || "G"}
                </div>
              )}
              <aside>
                <strong>{quote.status}</strong>
                <span>
                  Created {new Date(quote.created_at).toLocaleDateString()}
                </span>
                <span>Valid until {quote.valid_until}</span>
              </aside>
            </div>
          </header>
          <DetailContent
            quote={quote}
            items={items}
            coatingSource={coatingSource}
            customerOnly
          />
          <footer>
            <span>{quote.quotation_number}</span>
            <span>Prices in USD · Customer-visible items only</span>
          </footer>
        </article>
      </div>
    </>
  );
}
