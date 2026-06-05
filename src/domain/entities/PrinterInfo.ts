import type { PrinterType } from "../types/PrinterType.js";

export interface PrinterInfo {
  readonly printerId: string;
  readonly printerType: PrinterType;
  readonly brand: string;
  readonly manufacturer?: string;
  readonly name: string;
  readonly model: string;
  readonly firmwareVersion: string;
  readonly mainboardId: string;
  readonly serialNumber: string;
  readonly host: string;
  readonly webUrl?: string;
  readonly authMode: "" | "token" | "basic" | "accessCode" | "pinCode";
}
