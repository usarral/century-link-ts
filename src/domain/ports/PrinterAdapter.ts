import type { PrinterAttributes } from "../entities/PrinterAttributes.js";
import type { PrinterInfo } from "../entities/PrinterInfo.js";
import type { PrinterStatusData } from "../entities/PrinterStatus.js";
import type { Result } from "../../application/result/Result.js";

export type Unsubscribe = () => void;

export interface SlotMapItem {
  readonly trayIndex: number;
  readonly canvasId: number;
  readonly trayId: number;
}

export interface ConnectParams {
  readonly host: string;
  readonly name?: string;
  readonly model: string;
  readonly serialNumber?: string;
  readonly authMode?: "" | "token" | "basic" | "accessCode";
  readonly token?: string;
  readonly username?: string;
  readonly password?: string;
  readonly accessCode?: string;
  readonly autoReconnect?: boolean;
  readonly connectionTimeoutMs?: number;
}

export interface StartPrintParams {
  readonly fileName: string;
  readonly storageLocation: string;
  readonly autoBedLeveling?: boolean;
  readonly heatedBedType?: 0 | 1;
  readonly enableTimeLapse?: boolean;
  readonly forceBedLevel?: boolean;
  readonly slotMap?: readonly SlotMapItem[];
}

export interface PrinterAdapter {
  connect(params: ConnectParams): Promise<Result<PrinterInfo>>;
  disconnect(): Promise<void>;
  getStatus(timeoutMs?: number): Promise<Result<PrinterStatusData>>;
  getAttributes(timeoutMs?: number): Promise<Result<PrinterAttributes>>;
  startPrint(params: StartPrintParams): Promise<Result<void>>;
  pausePrint(): Promise<Result<void>>;
  resumePrint(): Promise<Result<void>>;
  stopPrint(): Promise<Result<void>>;
  onStatus(handler: (status: PrinterStatusData) => void): Unsubscribe;
  onConnection(handler: (connected: boolean) => void): Unsubscribe;
}
