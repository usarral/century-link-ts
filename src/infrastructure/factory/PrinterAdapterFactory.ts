import { PrinterType } from "../../domain/types/PrinterType.js";
import { CcV1PrinterAdapter } from "../adapters/cc-v1/CcV1PrinterAdapter.js";
import { CcV1DiscoveryAdapter } from "../adapters/cc-v1/CcV1DiscoveryAdapter.js";
import { CcV1FileAdapter } from "../adapters/cc-v1/CcV1FileAdapter.js";
import { CcV2PrinterAdapter } from "../adapters/cc-v2/CcV2PrinterAdapter.js";
import { CcV2DiscoveryAdapter } from "../adapters/cc-v2/CcV2DiscoveryAdapter.js";
import { CcV2FileAdapter } from "../adapters/cc-v2/CcV2FileAdapter.js";
import { MoonrakerPrinterAdapter } from "../adapters/moonraker/MoonrakerPrinterAdapter.js";
import { MoonrakerFileAdapter } from "../adapters/moonraker/MoonrakerFileAdapter.js";
import { ElegooError } from "../../application/result/ElegooError.js";
import { ErrorCode } from "../../domain/types/ErrorCode.js";
import type { PrinterAdapter } from "../../domain/ports/PrinterAdapter.js";
import type { DiscoveryAdapter } from "../../domain/ports/DiscoveryAdapter.js";
import type { FileAdapter } from "../../domain/ports/FileAdapter.js";

export interface AdapterSet {
  printer: PrinterAdapter;
  file?: FileAdapter;
}

export function createPrinterAdapter(type: PrinterType): PrinterAdapter {
  switch (type) {
    case PrinterType.ELEGOO_FDM_CC:
      return new CcV1PrinterAdapter();
    case PrinterType.ELEGOO_FDM_CC2:
      return new CcV2PrinterAdapter();
    case PrinterType.ELEGOO_FDM_KLIPPER:
      return new MoonrakerPrinterAdapter(PrinterType.ELEGOO_FDM_KLIPPER);
    case PrinterType.GENERIC_FDM_KLIPPER:
      return new MoonrakerPrinterAdapter(PrinterType.GENERIC_FDM_KLIPPER);
    default:
      throw new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, `No adapter for printer type: ${type}`);
  }
}

export function createFileAdapter(type: PrinterType, host: string, token?: string, port?: number): FileAdapter {
  switch (type) {
    case PrinterType.ELEGOO_FDM_CC:
      return new CcV1FileAdapter(host);
    case PrinterType.ELEGOO_FDM_CC2:
      return new CcV2FileAdapter(host, token);
    case PrinterType.ELEGOO_FDM_KLIPPER:
    case PrinterType.GENERIC_FDM_KLIPPER:
      return new MoonrakerFileAdapter(host, port);
    default:
      throw new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, `No file adapter for printer type: ${type}`);
  }
}

export function createDiscoveryAdapters(): DiscoveryAdapter[] {
  return [new CcV1DiscoveryAdapter(), new CcV2DiscoveryAdapter()];
}
