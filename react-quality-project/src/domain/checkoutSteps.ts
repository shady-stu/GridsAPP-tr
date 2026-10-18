/**
 * Represents the possible steps of an e-commerce checkout.
 *
 * A discriminated union uses the `step` property to identify
 * each variant and determine which properties are available.
 */
export type CheckoutStep =
  | {
      step: "cart";
      itemCount: number;
    }
  | {
      step: "shipping";
      address: string;
    }
  | {
      step: "payment";
      paymentMethod: "card" | "cash";
    }
  | {
      step: "confirmation";
      orderId: string;
    };

/**
 * Accepts only `never`, so TypeScript can detect unhandled
 * variants when a new checkout step is added.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled checkout step: ${JSON.stringify(value)}`);
}

/**
 * Returns a user-facing description of the current step.
 *
 * The switch narrows `checkout` to the matching variant.
 * Each branch can safely access its variant-specific fields.
 */
export function describeCheckoutStep(checkout: CheckoutStep): string {
  switch (checkout.step) {
    case "cart":
      return `Cart contains ${checkout.itemCount} items`;

    case "shipping":
      return `Shipping address: ${checkout.address}`;

    case "payment":
      return `Payment method: ${checkout.paymentMethod}`;

    case "confirmation":
      return `Order confirmed: ${checkout.orderId}`;

    default:
      // Compile-time exhaustiveness check.
      return assertNever(checkout);
  }
}
/**
 * Formats a discount value safely.
 *
 * `typeof` narrows a union based on the runtime type.
 * Real-world use: Handling values from forms or configuration.
 */
export function formatDiscount(value: string | number): string {
  if (typeof value === "number") {
    return `${value}%`;
  }

  return value.trim();
}
type CardPayment = {
  cardToken: string;
};

type CashPayment = {
  cashAmount: number;
};

type PaymentDetails = CardPayment | CashPayment;

/**
 * Identifies the payment shape by checking a property.
 *
 * Real-world use: Handling different payment provider responses.
 */
export function describePayment(payment: PaymentDetails): string {
  if ("cardToken" in payment) {
    return `Card payment token: ${payment.cardToken}`;
  }

  return `Cash received: ${payment.cashAmount}`;
}

/**
 * Converts an unknown thrown value into a safe message.
 *
 * JavaScript allows throwing values other than Error objects,
 * so checking instanceof prevents unsafe property access.
 */
export function getCheckoutErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected checkout error occurred";
}

type CheckoutOrder = {
  orderId: string;
  total: number;
};

/**
 * Checks whether an unknown value has the required order fields.
 *
 * A type predicate (`value is CheckoutOrder`) tells TypeScript
 * how the value should be narrowed when the function returns true.
 */
export function isCheckoutOrder(value: unknown): value is CheckoutOrder {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("orderId" in value) || !("total" in value)) {
    return false;
  }

  return typeof value.orderId === "string" && typeof value.total === "number";
}

/**
 * Validates untrusted data before using it.
 * Real-world use: Parsing a JSON response from an API.
 */
export function getOrderId(value: unknown): string | null {
  if (isCheckoutOrder(value)) {
    return value.orderId;
  }

  return null;
}
