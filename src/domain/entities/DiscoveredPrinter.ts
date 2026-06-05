import type { PrinterType } from "../types/PrinterType.js";

export interface DiscoveredPrinter {
  readonly host: string;
  readonly printerType: PrinterType;
  readonly brand: string;
  readonly name: string;
  readonly model: string;
  readonly mainboardId: string;
  readonly serialNumber: string;
  readonly firmwareVersion: string;
  readonly authMode: "" | "token" | "accessCode" | "pinCode";
  readonly webUrl?: string;
}
