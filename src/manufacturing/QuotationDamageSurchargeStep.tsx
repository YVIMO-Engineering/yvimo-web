export type DamagePricingMethod =
  "standard" | "percentage" | "fixed" | "waived";

type Props = {
  method: DamagePricingMethod;
  onMethod: (method: DamagePricingMethod) => void;
  percent: string;
  onPercent: (value: string) => void;
  fixedAmount: string;
  onFixedAmount: (value: string) => void;
  note: string;
  onNote: (value: string) => void;
  suggestedAmount: number;
  finalAmount: number;
  damageSteps: number;
  damageInches: number;
  sharpeningSubtotal: number;
};

const methods: Array<{
  value: DamagePricingMethod;
  title: string;
  description: string;
}> = [
  {
    value: "standard",
    title: "Use recommended surcharge",
    description:
      "Add 25% of Sharpening Service for every 0.010 in above the 0.020 in threshold.",
  },
  {
    value: "percentage",
    title: "Custom percentage",
    description: "Use a negotiated percentage for each damage increment.",
  },
  {
    value: "fixed",
    title: "Fixed surcharge",
    description: "Enter a negotiated surcharge amount directly.",
  },
  {
    value: "waived",
    title: "Waive surcharge",
    description: "Do not charge a damage surcharge for this quotation.",
  },
];

export function QuotationDamageSurchargeStep(props: Props) {
  const appliedIncrementPercent =
    props.method === "percentage" ? Math.max(0, Number(props.percent) || 0) : 25;
  const displayedAmount =
    (props.sharpeningSubtotal * props.damageSteps * appliedIncrementPercent) / 100;
  return (
    <details className="quotation-damage-step" open>
      <summary className="quotation-step-summary">
        <b>Step 05</b>
        <span>
          <strong>Set the damage surcharge</strong>
          <small>
            Review the recommended charge and adjust it when commercial
            negotiation requires it.
          </small>
        </span>
        <em>Required</em>
      </summary>
      <div className="quotation-damage-body">
        <div className="quotation-damage-reference">
          <span>Recommended surcharge</span>
          <strong>${props.suggestedAmount.toFixed(2)} USD</strong>
          <small>
            {props.damageSteps
              ? `${props.damageSteps} damage increment${props.damageSteps === 1 ? "" : "s"} above the 0.020 in threshold.`
              : "Removal does not exceed the 0.020 in threshold."}
          </small>
        </div>
        <div
          className="quotation-damage-methods"
          role="radiogroup"
          aria-label="Damage surcharge method"
        >
          {methods.map((option) => (
            <button
              type="button"
              role="radio"
              aria-checked={props.method === option.value}
              className={props.method === option.value ? "active" : ""}
              key={option.value}
              onClick={() => props.onMethod(option.value)}
            >
              <strong>{option.title}</strong>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
        <section className="quotation-damage-formula">
          <strong>
            How the {props.method === "percentage" ? "custom surcharge" : "recommendation"} is calculated
          </strong>
          <dl>
            <dt>Damage to remove</dt>
            <dd>{props.damageInches.toFixed(3)} in</dd>
            <dt>Included threshold</dt>
            <dd>0.020 in</dd>
            <dt>Excess damage</dt>
            <dd>{Math.max(0, props.damageInches - 0.02).toFixed(3)} in</dd>
            <dt>Chargeable increments</dt>
            <dd>{props.damageSteps} × 0.010 in</dd>
            <dt>Surcharge per increment</dt>
            <dd>{appliedIncrementPercent.toFixed(2)}%</dd>
            <dt>Sharpening Service subtotal</dt>
            <dd>${props.sharpeningSubtotal.toFixed(2)} USD</dd>
          </dl>
          <p>
            ${props.sharpeningSubtotal.toFixed(2)} × ({props.damageSteps} × {appliedIncrementPercent.toFixed(2)}%)
            = <strong>${displayedAmount.toFixed(2)} USD</strong>
          </p>
        </section>
        {props.method === "percentage" ? (
          <label>
            Negotiated percentage per increment
            <input
              type="number"
              min="0"
              step="0.01"
              value={props.percent}
              onChange={(event) => props.onPercent(event.target.value)}
            />
            <small>Applied once for every chargeable 0.010 in increment.</small>
          </label>
        ) : null}
        {props.method === "fixed" ? (
          <label>
            Negotiated surcharge amount (USD)
            <input
              type="number"
              min="0"
              step="0.01"
              value={props.fixedAmount}
              onChange={(event) => props.onFixedAmount(event.target.value)}
            />
          </label>
        ) : null}
        <label className="quotation-damage-note">
          Negotiation note <span>Optional</span>
          <textarea
            value={props.note}
            onChange={(event) => props.onNote(event.target.value)}
            placeholder="Document the reason for an adjustment, agreement or exception."
          />
        </label>
        <div className="quotation-damage-final">
          <span>Applied damage surcharge</span>
          <strong>${props.finalAmount.toFixed(2)} USD</strong>
        </div>
      </div>
    </details>
  );
}
