import type { PrinterAdapter } from "../../domain/ports/PrinterAdapter.js";
import type { Result } from "../result/Result.js";

export class ResumePrintUseCase {
  constructor(private readonly adapter: PrinterAdapter) {}

  execute(): Promise<Result<void>> {
    return this.adapter.resumePrint();
  }
}
