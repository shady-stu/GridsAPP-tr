import { useState, type FormEvent } from "react";
import {
  createOrderInputSchema,
  type Customer,
  type Order,
} from "../domain/schemas";
import type { DashboardProvider } from "../data/provider";

interface OrderFormProps {
  customers: Customer[];
  provider: DashboardProvider;
  onCreated: (order: Order) => void;
}

/** Owns temporary form values and reports a created order only after provider success. */
export function OrderForm({ customers, provider, onCreated }: OrderFormProps) {
  const [customerId, setCustomerId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFeedback("");
    const parsed = createOrderInputSchema.safeParse({
      customerId,
      description,
      amount,
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const result = await provider.createOrder(parsed.data);
      if (!result.success) {
        setFeedback(result.error.message);
        return;
      }
      onCreated(result.data);
      setCustomerId("");
      setDescription("");
      setAmount("");
      setFeedback("Your order has been created.");
    } catch {
      setFeedback(
        "Something went wrong while creating the order. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="order-form" onSubmit={handleSubmit} noValidate>
      <div className="form-heading">
        <div>
          <span className="eyebrow">QUICK ACTION</span>
          <h2>Create an order</h2>
        </div>
        <span className="form-icon" aria-hidden="true">
          ＋
        </span>
      </div>
      <label htmlFor="order-customer">Customer</label>
      <select
        id="order-customer"
        value={customerId}
        onChange={(event) => setCustomerId(event.target.value)}
        aria-invalid={Boolean(errors.customerId)}
        aria-describedby={errors.customerId ? "customer-error" : undefined}
      >
        <option value="">Select a customer</option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name} · {customer.company}
          </option>
        ))}
      </select>
      {errors.customerId && (
        <span id="customer-error" className="field-error">
          {errors.customerId}
        </span>
      )}
      <label htmlFor="order-description">Order description</label>
      <input
        id="order-description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="e.g. Website redesign"
        aria-invalid={Boolean(errors.description)}
        aria-describedby={errors.description ? "description-error" : undefined}
      />
      {errors.description && (
        <span id="description-error" className="field-error">
          {errors.description}
        </span>
      )}
      <label htmlFor="order-amount">Amount</label>
      <div className="amount-input">
        <span aria-hidden="true">$</span>
        <input
          id="order-amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
          aria-invalid={Boolean(errors.amount)}
          aria-describedby={errors.amount ? "amount-error" : undefined}
        />
      </div>
      {errors.amount && (
        <span id="amount-error" className="field-error">
          {errors.amount}
        </span>
      )}
      {feedback && (
        <p
          className={
            feedback.includes("created")
              ? "form-feedback success"
              : "form-feedback error"
          }
          role="status"
        >
          {feedback}
        </p>
      )}
      <button
        className="primary-button submit-button"
        type="submit"
        disabled={submitting}
      >
        {submitting ? "Creating order…" : "Create order"}
        <span aria-hidden="true">→</span>
      </button>
      <p className="form-note">Orders are saved to this demo session only.</p>
    </form>
  );
}
