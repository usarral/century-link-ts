import type { PrinterStatusData } from "../entities/PrinterStatus.js";

export const PRINTER_STATUS_EVENT = "printer:status" as const;

export interface PrinterStatusEvent {
  readonly printerId: string;
  readonly status: PrinterStatusData;
}
