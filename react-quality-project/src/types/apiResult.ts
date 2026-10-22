/**
 * Represents the possible states of an API request.
 *
 * Generic syntax: <T> allows the successful response
 * to contain any specified data type.
 *
 * Real-world use: User APIs, product lists, dashboards,
 * and other asynchronous requests.
 */
export type ApiResult<T> =
  | {
      // The request completed successfully.
      status: "success";
      data: T;
    }
  | {
      // The request failed with an error message.
      status: "error";
      error: {
        message: string;
        code?: string; // Optional machine-readable error code.
      };
    }
  | {
      // The request is still in progress.
      status: "loading";
    };

/**
 * Ensures that all union variants are handled.
 *
 * The `never` type means no valid value should remain.
 * If a new variant is added but not handled, TypeScript
 * reports a compile-time error at the call site.
 */
export function assertNever(value: never): never {
  // Defensive runtime fallback for unexpected values.
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
