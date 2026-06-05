import type { PrinterAdapter, ConnectParams } from "../../domain/ports/PrinterAdapter.js";
import type { PrinterInfo } from "../../domain/entities/PrinterInfo.js";
import type { Result } from "../result/Result.js";

export class ConnectPrinterUseCase {
  constructor(private readonly adapter: PrinterAdapter) {}

  execute(params: ConnectParams): Promise<Result<PrinterInfo>> {
    return this.adapter.connect(params);
  }
}
