import { describe, expect, it } from "vitest";
import { formatApiResult } from "./formatApiResult";
import type { ApiResult } from "./apiResult";

describe("formatApiResult", () => {
  it("formats a successful result", () => {
    // Explicitly define the successful payload type.
    const result: ApiResult<string> = {
      status: "success",
      data: "Hello",
    };

    expect(formatApiResult(result)).toBe("Request succeeded");
  });

  it("formats an error result", () => {
    const result: ApiResult<string> = {
      status: "error",
      error: {
        message: "User not found",
        code: "NOT_FOUND",
      },
    };

    expect(formatApiResult(result)).toBe("Request failed: User not found");
  });

  it("formats a loading result", () => {
    const result: ApiResult<string> = {
      status: "loading",
    };

    expect(formatApiResult(result)).toBe("Loading...");
  });
});
