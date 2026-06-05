import { describe, it, expect } from "vitest";
import { ok, err, mapResult } from "./Result.js";
import { ElegooError } from "./ElegooError.js";
import { ErrorCode } from "../../domain/types/ErrorCode.js";

describe("Result", () => {
  it("ok wraps a value", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it("err wraps an error", () => {
    const error = new ElegooError(ErrorCode.NETWORK_ERROR, "connection failed");
    const result = err(error);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(error);
  });

  it("mapResult transforms ok value", () => {
    const result = mapResult(ok(5), (n) => n * 2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(10);
  });

  it("mapResult passes err through unchanged", () => {
    const error = new ElegooError(ErrorCode.OPERATION_TIMEOUT, "timed out");
    const result = mapResult(err(error), (n: number) => n * 2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(error);
  });
});

describe("ElegooError", () => {
  it("stores code and message", () => {
    const e = new ElegooError(ErrorCode.PRINTER_NOT_FOUND, "not found");
    expect(e.code).toBe(ErrorCode.PRINTER_NOT_FOUND);
    expect(e.message).toBe("not found");
    expect(e.name).toBe("ElegooError");
  });

  it("stores optional cause", () => {
    const cause = new Error("root cause");
    const e = new ElegooError(ErrorCode.NETWORK_ERROR, "failed", cause);
    expect(e.cause).toBe(cause);
  });
});
