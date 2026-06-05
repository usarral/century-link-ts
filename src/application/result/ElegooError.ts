import type { ErrorCode } from "../../domain/types/ErrorCode.js";

export class ElegooError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ElegooError";
  }
}
