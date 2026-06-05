import { DiscoverPrintersUseCase } from "./application/use-cases/DiscoverPrintersUseCase.js";
import { ConnectPrinterUseCase } from "./application/use-cases/ConnectPrinterUseCase.js";
import { StartPrintUseCase } from "./application/use-cases/StartPrintUseCase.js";
import { PausePrintUseCase } from "./application/use-cases/PausePrintUseCase.js";
import { ResumePrintUseCase } from "./application/use-cases/ResumePrintUseCase.js";
import { StopPrintUseCase } from "./application/use-cases/StopPrintUseCase.js";
import { UploadFileUseCase } from "./application/use-cases/UploadFileUseCase.js";
import { GetFileListUseCase } from "./application/use-cases/GetFileListUseCase.js";
import { GetPrinterStatusUseCase } from "./application/use-cases/GetPrinterStatusUseCase.js";
import { createPrinterAdapter, createDiscoveryAdapters, createFileAdapter } from "./infrastructure/factory/PrinterAdapterFactory.js";
import { ElegooError } from "./application/result/ElegooError.js";
import { ErrorCode } from "./domain/types/ErrorCode.js";
import { err } from "./application/result/Result.js";
import type { DiscoveredPrinter } from "./domain/entities/DiscoveredPrinter.js";
import type { PrinterInfo } from "./domain/entities/PrinterInfo.js";
import type { PrinterStatusData, CanvasStatus } from "./domain/entities/PrinterStatus.js";
import type { PrinterAttributes } from "./domain/entities/PrinterAttributes.js";
import type { FileListData, FileDetail } from "./domain/entities/FileInfo.js";
import type { PrintTaskListData } from "./domain/entities/PrintTask.js";
import type { ConnectParams, StartPrintParams, FileDownloadTriggerParams, Unsubscribe } from "./domain/ports/PrinterAdapter.js";
import type { DiscoveryParams } from "./domain/ports/DiscoveryAdapter.js";
import type { FileUploadParams, FileDetailParams, ProgressCallback } from "./domain/ports/FileAdapter.js";
import type { Result } from "./application/result/Result.js";

export interface ConnectedPrinter {
  readonly info: PrinterInfo;
  getStatus(timeoutMs?: number): Promise<Result<PrinterStatusData>>;
  getAttributes(timeoutMs?: number): Promise<Result<PrinterAttributes>>;
  startPrint(params: StartPrintParams): Promise<Result<void>>;
  pausePrint(): Promise<Result<void>>;
  resumePrint(): Promise<Result<void>>;
  stopPrint(): Promise<Result<void>>;
  uploadFile(params: FileUploadParams, onProgress?: ProgressCallback): Promise<Result<void>>;
  getFiles(page?: number, pageSize?: number): Promise<Result<FileListData>>;
  getFileDetail(params: FileDetailParams): Promise<Result<FileDetail>>;
  getCanvasStatus(timeoutMs?: number): Promise<Result<CanvasStatus>>;
  setAutoRefill(enable: boolean): Promise<Result<void>>;
  updatePrinterName(name: string): Promise<Result<void>>;
  homeAxis(axes: string): Promise<Result<void>>;
  moveAxis(axes: string, distanceMm: number): Promise<Result<void>>;
  setTemperature(targets: Readonly<Record<string, number>>): Promise<Result<void>>;
  setFanSpeed(speeds: Readonly<Record<string, number>>): Promise<Result<void>>;
  setPrintSpeed(mode: 0 | 1 | 2 | 3): Promise<Result<void>>;
  getPrintTaskList(page?: number, pageSize?: number): Promise<Result<PrintTaskListData>>;
  deletePrintTasks(taskIds: readonly string[]): Promise<Result<void>>;
  triggerFileDownload(params: FileDownloadTriggerParams): Promise<Result<void>>;
  cancelFileDownload(taskId: string): Promise<Result<void>>;
  onStatus(handler: (status: PrinterStatusData) => void): Unsubscribe;
  onConnection(handler: (connected: boolean) => void): Unsubscribe;
  disconnect(): Promise<void>;
}

export class CenturyLink {
  discover(params?: DiscoveryParams): AsyncIterable<DiscoveredPrinter> {
    const adapters = createDiscoveryAdapters();
    const useCase = new DiscoverPrintersUseCase(adapters);
    return useCase.execute(params);
  }

  async connect(params: ConnectParams & { printerType: import("./domain/types/PrinterType.js").PrinterType }): Promise<Result<ConnectedPrinter>> {
    const printerAdapter = createPrinterAdapter(params.printerType);
    const connectUseCase = new ConnectPrinterUseCase(printerAdapter);

    const result = await connectUseCase.execute(params);
    if (!result.ok) return result;

    const info = result.value;

    let fileAdapter: import("./domain/ports/FileAdapter.js").FileAdapter | undefined;
    try {
      fileAdapter = createFileAdapter(params.printerType, params.host, params.accessCode ?? params.token);
    } catch {
      // Some printer types may not have a file adapter — that's fine
    }

    const noFileAdapter = <T>(): Promise<Result<T>> =>
      Promise.resolve(err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "Not supported for this printer type")));

    const connectedPrinter: ConnectedPrinter = {
      info,
      getStatus: (timeoutMs) => new GetPrinterStatusUseCase(printerAdapter).execute(timeoutMs),
      getAttributes: (timeoutMs) => printerAdapter.getAttributes(timeoutMs),
      startPrint: (p) => new StartPrintUseCase(printerAdapter).execute(p),
      pausePrint: () => new PausePrintUseCase(printerAdapter).execute(),
      resumePrint: () => new ResumePrintUseCase(printerAdapter).execute(),
      stopPrint: () => new StopPrintUseCase(printerAdapter).execute(),
      uploadFile: (p, onProgress) => {
        if (!fileAdapter) return noFileAdapter();
        return new UploadFileUseCase(fileAdapter).execute(p, onProgress);
      },
      getFiles: (page, pageSize) => {
        if (!fileAdapter) return noFileAdapter();
        return new GetFileListUseCase(fileAdapter).execute({ page, pageSize });
      },
      getFileDetail: (p) => {
        if (!fileAdapter) return noFileAdapter();
        return fileAdapter.getFileDetail(p);
      },
      getCanvasStatus: (timeoutMs) => printerAdapter.getCanvasStatus(timeoutMs),
      setAutoRefill: (enable) => printerAdapter.setAutoRefill(enable),
      updatePrinterName: (name) => printerAdapter.updatePrinterName(name),
      homeAxis: (axes) => printerAdapter.homeAxis(axes),
      moveAxis: (axes, distanceMm) => printerAdapter.moveAxis(axes, distanceMm),
      setTemperature: (targets) => printerAdapter.setTemperature(targets),
      setFanSpeed: (speeds) => printerAdapter.setFanSpeed(speeds),
      setPrintSpeed: (mode) => printerAdapter.setPrintSpeed(mode),
      getPrintTaskList: (page, pageSize) => printerAdapter.getPrintTaskList(page, pageSize),
      deletePrintTasks: (taskIds) => printerAdapter.deletePrintTasks(taskIds),
      triggerFileDownload: (params) => printerAdapter.triggerFileDownload(params),
      cancelFileDownload: (taskId) => printerAdapter.cancelFileDownload(taskId),
      onStatus: (handler) => printerAdapter.onStatus(handler),
      onConnection: (handler) => printerAdapter.onConnection(handler),
      disconnect: () => printerAdapter.disconnect(),
    };

    return { ok: true, value: connectedPrinter };
  }
}
