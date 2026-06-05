import type { PrinterAttributes } from "../entities/PrinterAttributes.js";

export const PRINTER_ATTRIBUTES_EVENT = "printer:attributes" as const;

export interface PrinterAttributesEvent {
  readonly printerId: string;
  readonly attributes: PrinterAttributes;
}
