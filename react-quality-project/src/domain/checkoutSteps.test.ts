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
