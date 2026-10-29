import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/shared/errors";
import { mapProviderError } from "./errors";

describe("mapProviderError", () => {
  it("passes an AppError through unchanged", () => {
    const original = new AppError("RATE_LIMITED");
    expect(mapProviderError(original)).toBe(original);
  });

  it("classifies daily free-model quota exhaustion", () => {
    expect(
      mapProviderError({
        status: 429,
        message: "Rate limit exceeded: free-models-per-day",
      }).code,
    ).toBe("QUOTA_EXHAUSTED");

    expect(
      mapProviderError({
        status: 429,
        error: { message: "Daily quota exceeded" },
      }).code,
    ).toBe("QUOTA_EXHAUSTED");
  });

  it("keeps per-minute and generic 429s retryable", () => {
    expect(
      mapProviderError({
        status: 429,
        message: "free-models-per-min limit reached",
      }).code,
    ).toBe("RATE_LIMITED");

    expect(
      mapProviderError({
        status: 429,
        message: "free-models-per-day and free-models-per-min both hit",
      }).code,
    ).toBe("RATE_LIMITED");

    expect(mapProviderError({ statusCode: 429 }).code).toBe("RATE_LIMITED");
  });

  it("maps auth, credit, and server failures", () => {
    expect(mapProviderError({ status: 401 }).code).toBe("PROVIDER_AUTH");
    expect(mapProviderError({ response: { status: 403 } }).code).toBe(
      "PROVIDER_AUTH",
    );
    expect(mapProviderError({ status: 402 }).code).toBe("PROVIDER_CREDITS");
    expect(mapProviderError({ status: 500 }).code).toBe("PROVIDER_ERROR");
    expect(mapProviderError({ status: 503 }).code).toBe("PROVIDER_ERROR");
  });

  it("maps aborts and timeouts", () => {
    expect(mapProviderError({ name: "AbortError" }).code).toBe("TIMEOUT");
    expect(
      mapProviderError({ message: "Request timed out after 30s" }).code,
    ).toBe("TIMEOUT");
    expect(
      mapProviderError({ name: "APIConnectionTimeoutError" }).code,
    ).toBe("TIMEOUT");
  });

  it("does not leak unknown provider details", () => {
    const result = mapProviderError(
      new Error("provider said: secret raw report text"),
    );
    expect(result.code).toBe("INTERNAL");
    expect(result.message).not.toContain("secret");
  });
});
