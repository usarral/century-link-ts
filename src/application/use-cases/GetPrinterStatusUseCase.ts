import type { PrinterAdapter } from "../../domain/ports/PrinterAdapter.js";
import type { PrinterStatusData } from "../../domain/entities/PrinterStatus.js";
import type { Result } from "../result/Result.js";

export class GetPrinterStatusUseCase {
  constructor(private readonly adapter: PrinterAdapter) {}

  execute(timeoutMs?: number): Promise<Result<PrinterStatusData>> {
    return this.adapter.getStatus(timeoutMs);
  }
}
