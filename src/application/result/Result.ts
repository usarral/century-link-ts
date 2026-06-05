import type { ElegooError } from "./ElegooError.js";

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ElegooError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(error: ElegooError): Result<never> {
  return { ok: false, error };
}

export function mapResult<T, U>(
  result: Result<T>,
  fn: (value: T) => U,
): Result<U> {
  if (result.ok) return ok(fn(result.value));
  return result;
}
