import { assertNever, type ApiResult } from "./apiResult";

/**
 * Converts an API result into a displayable message.
 *
 * `switch` narrows the result type based on its status.
 * Each branch can safely access properties belonging
 * to that specific variant.
 */
export function formatApiResult<T>(result: ApiResult<T>): string {
  switch (result.status) {
    case "success":
      // `result.data` is available only in this variant.
      return "Request succeeded";

    case "error":
      // TypeScript knows that the error object exists here.
      return `Request failed: ${result.error.message}`;

    case "loading":
      return "Loading...";

    default:
      // Compile-time exhaustiveness check.
      return assertNever(result);
  }
}
