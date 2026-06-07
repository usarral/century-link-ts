import type { PrinterAttributes } from "../entities/PrinterAttributes.js";
import type { PrinterInfo } from "../entities/PrinterInfo.js";
import type { PrinterStatusData } from "../entities/PrinterStatus.js";
import type { CanvasStatus } from "../entities/PrinterStatus.js";
import type { PrintTaskListData } from "../entities/PrintTask.js";
import type { FileListData, FileDetail } from "../entities/FileInfo.js";
import type { FileDetailParams } from "./FileAdapter.js";
import type { Result } from "../../application/result/Result.js";

export type Unsubscribe = () => void;

export interface SlotMapItem {
  readonly trayIndex: number;
  readonly canvasId: number;
  readonly trayId: number;
}

export interface ConnectParams {
  readonly host: string;
  readonly port?: number;
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

export interface FileDownloadTriggerParams {
  readonly fileUrl: string;
  readonly fileName: string;
  readonly taskId: string;
  readonly md5: string;
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

  // Multi-filament / canvas
  getCanvasStatus(timeoutMs?: number): Promise<Result<CanvasStatus>>;
  setAutoRefill(enable: boolean): Promise<Result<void>>;

  // Printer settings
  updatePrinterName(name: string): Promise<Result<void>>;

  // Hardware control
  homeAxis(axes: string): Promise<Result<void>>;
  moveAxis(axes: string, distanceMm: number): Promise<Result<void>>;
  setTemperature(targets: Readonly<Record<string, number>>): Promise<Result<void>>;
  setFanSpeed(speeds: Readonly<Record<string, number>>): Promise<Result<void>>;
  setPrintSpeed(mode: 0 | 1 | 2 | 3): Promise<Result<void>>;
  setChamberLight(on: boolean): Promise<Result<void>>;

  // File listing (optional — only implemented by adapters that support it via the device protocol)
  getFileList?(page?: number, pageSize?: number): Promise<Result<FileListData>>;
  getFileDetail?(params: FileDetailParams): Promise<Result<FileDetail>>;

  // Print tasks
  getPrintTaskList(page?: number, pageSize?: number): Promise<Result<PrintTaskListData>>;
  deletePrintTasks(taskIds: readonly string[]): Promise<Result<void>>;

  // File download (printer pulls from URL)
  triggerFileDownload(params: FileDownloadTriggerParams): Promise<Result<void>>;
  cancelFileDownload(taskId: string): Promise<Result<void>>;

  // Async refresh (result delivered via event handlers)
  refreshPrinterStatus(): Promise<Result<void>>;
  refreshPrinterAttributes(): Promise<Result<void>>;

  // Raw protocol response string (for debugging)
  getStatusRaw(timeoutMs?: number): Promise<Result<string>>;

  // Events
  onStatus(handler: (status: PrinterStatusData) => void): Unsubscribe;
  onAttributes(handler: (attrs: PrinterAttributes) => void): Unsubscribe;
  onConnection(handler: (connected: boolean) => void): Unsubscribe;
}
