import type { PrinterAdapter, StartPrintParams } from "../../domain/ports/PrinterAdapter.js";
import type { Result } from "../result/Result.js";

export class StartPrintUseCase {
  constructor(private readonly adapter: PrinterAdapter) {}

  execute(params: StartPrintParams): Promise<Result<void>> {
    return this.adapter.startPrint(params);
  }
}
