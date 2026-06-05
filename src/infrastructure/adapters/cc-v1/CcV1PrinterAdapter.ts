import { WebSocketTransport } from "../../transport/websocket/WebSocketTransport.js";
import {
  encodeRequest,
  decodeResponse,
  getTopicType,
  isStatusPush,
  CC_V1_CMD,
} from "../../transport/websocket/CcV1Codec.js";
import { mapStatus, type RawCcV1Status } from "./CcV1StatusMapper.js";
import { ErrorCode } from "../../../domain/types/ErrorCode.js";
import { PrinterType } from "../../../domain/types/PrinterType.js";
import { ok, err } from "../../../application/result/Result.js";
import { ElegooError } from "../../../application/result/ElegooError.js";
import type {
  PrinterAdapter,
  ConnectParams,
  StartPrintParams,
  FileDownloadTriggerParams,
  Unsubscribe,
} from "../../../domain/ports/PrinterAdapter.js";
import type { PrinterInfo } from "../../../domain/entities/PrinterInfo.js";
import type { PrinterStatusData, CanvasStatus } from "../../../domain/entities/PrinterStatus.js";
import type { PrinterAttributes } from "../../../domain/entities/PrinterAttributes.js";
import type { PrintTaskListData } from "../../../domain/entities/PrintTask.js";
import type { Result } from "../../../application/result/Result.js";

interface RawCcV1Attributes {
  Attributes?: {
    MachineName?: string;
    MainboardID?: string;
    FirmwareVersion?: string;
  };
}

interface RawCcV1CanvasStatus {
  CanvasStatus?: {
    ActiveCanvasId?: number;
    ActiveTrayId?: number;
    AutoRefill?: boolean;
    Canvases?: Array<{
      CanvasId?: number;
      Name?: string;
      Model?: string;
      Connected?: boolean;
      Trays?: Array<{
        TrayId?: number;
        Brand?: string;
        FilamentType?: string;
        FilamentName?: string;
        FilamentCode?: string;
        FilamentColor?: string;
        MinNozzleTemp?: number;
        MaxNozzleTemp?: number;
        Status?: number;
      }>;
    }>;
  };
}

const REQUEST_TIMEOUT_MS = 10_000;

type PendingRequest = {
  resolve: (value: unknown) => void;
  timer: NodeJS.Timeout;
};

type PendingAttributeRequest = {
  resolve: (value: RawCcV1Attributes) => void;
  timer: NodeJS.Timeout;
};

export class CcV1PrinterAdapter implements PrinterAdapter {
  private readonly transport = new WebSocketTransport();
  private printerInfo: PrinterInfo | null = null;
  private mainboardId = "";
  private pending = new Map<string, PendingRequest>();
  private pendingAttributeRequest: PendingAttributeRequest | null = null;
  private statusHandlers = new Set<(status: PrinterStatusData) => void>();
  private connectionHandlers = new Set<(connected: boolean) => void>();
  private unsubscribeTransport: Unsubscribe | null = null;

  async connect(params: ConnectParams): Promise<Result<PrinterInfo>> {
    try {
      await this.transport.connect({
        host: params.host,
        timeoutMs: params.connectionTimeoutMs,
        username: params.username,
        password: params.password ?? params.token,
      });
    } catch (cause) {
      return err(new ElegooError(ErrorCode.PRINTER_CONNECTION_ERROR, `Failed to connect to ${params.host}`, cause));
    }

    this.unsubscribeTransport = this.transport.subscribe((raw) => this.onMessage(raw));

    const statusResult = await this.requestWithTimeout<{ Data: { MainboardID?: string } }>(
      (id: string) => encodeRequest(id, CC_V1_CMD.GET_STATUS),
      params.serialNumber ?? "unknown",
    );

    if (!statusResult.ok) {
      await this.transport.disconnect();
      return statusResult;
    }

    this.mainboardId = statusResult.value.Data?.MainboardID ?? params.serialNumber ?? "unknown";

    this.printerInfo = {
      printerId: `elegoo_lan_${this.mainboardId}`,
      printerType: PrinterType.ELEGOO_FDM_CC,
      brand: "Elegoo",
      name: params.name ?? "Elegoo Printer",
      model: params.model,
      firmwareVersion: "",
      mainboardId: this.mainboardId,
      serialNumber: params.serialNumber ?? this.mainboardId,
      host: params.host,
      authMode: params.authMode ?? "",
    };

    for (const handler of this.connectionHandlers) handler(true);
    return ok(this.printerInfo);
  }

  async disconnect(): Promise<void> {
    this.unsubscribeTransport?.();
    await this.transport.disconnect();
    for (const handler of this.connectionHandlers) handler(false);
  }

  async getStatus(timeoutMs = REQUEST_TIMEOUT_MS): Promise<Result<PrinterStatusData>> {
    const result = await this.requestWithTimeout<{ Data: RawCcV1Status }>(
      (id) => encodeRequest(id, CC_V1_CMD.GET_STATUS),
      this.mainboardId,
      timeoutMs,
    );
    if (!result.ok) return result;
    return ok(mapStatus(this.printerInfo?.printerId ?? "", result.value.Data));
  }

  async getAttributes(timeoutMs = REQUEST_TIMEOUT_MS): Promise<Result<PrinterAttributes>> {
    try {
      await this.transport.send(encodeRequest(this.mainboardId, CC_V1_CMD.GET_ATTRIBUTES));
    } catch (cause) {
      return err(new ElegooError(ErrorCode.NETWORK_ERROR, "Failed to send GET_ATTRIBUTES", cause));
    }

    const raw = await new Promise<RawCcV1Attributes | null>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingAttributeRequest = null;
        resolve(null);
      }, timeoutMs);
      this.pendingAttributeRequest = { resolve, timer };
    });

    if (!raw) {
      return err(new ElegooError(ErrorCode.OPERATION_TIMEOUT, "GET_ATTRIBUTES timed out"));
    }

    const attrs = raw.Attributes ?? {};
    const info = this.printerInfo;
    return ok({
      printerId: info?.printerId ?? "",
      printerType: PrinterType.ELEGOO_FDM_CC,
      brand: "Elegoo",
      name: attrs.MachineName ?? info?.name ?? "Elegoo Printer",
      model: info?.model ?? "",
      firmwareVersion: attrs.FirmwareVersion ?? "",
      mainboardId: attrs.MainboardID ?? this.mainboardId,
      serialNumber: info?.serialNumber ?? this.mainboardId,
      host: info?.host ?? "",
      authMode: (info?.authMode ?? "") as PrinterInfo["authMode"],
      capabilities: {
        storage: [{ name: "usb", removable: true }],
        fans: [
          { name: "model", controllable: true, minSpeed: 0, maxSpeed: 100, supportsRpmReading: false },
        ],
        temperatures: [
          { name: "extruder", controllable: false, supportsReading: true, minTemperature: 0, maxTemperature: 300 },
          { name: "heatedBed", controllable: false, supportsReading: true, minTemperature: 0, maxTemperature: 120 },
        ],
        lights: [],
        supportsCamera: false,
        supportsTimeLapse: false,
        canSetPrinterName: false,
        canGetDiskInfo: false,
        supportsMultiFilament: false,
        supportsAutoBedLeveling: true,
        supportsHeatedBedSwitching: false,
        supportsFilamentMapping: false,
        supportsAutoRefill: false,
      },
    });
  }

  async getCanvasStatus(timeoutMs = REQUEST_TIMEOUT_MS): Promise<Result<CanvasStatus>> {
    const result = await this.requestWithTimeout<{ Data: RawCcV1CanvasStatus }>(
      (id) => encodeRequest(id, CC_V1_CMD.GET_CANVAS_STATUS),
      this.mainboardId,
      timeoutMs,
    );
    if (!result.ok) return result;
    const raw = result.value.Data?.CanvasStatus;
    return ok({
      activeCanvasId: raw?.ActiveCanvasId ?? 0,
      activeTrayId: raw?.ActiveTrayId ?? 0,
      autoRefill: raw?.AutoRefill ?? false,
      canvases: (raw?.Canvases ?? []).map((c) => ({
        canvasId: c.CanvasId ?? 0,
        name: c.Name ?? "",
        model: c.Model ?? "",
        connected: c.Connected ?? false,
        trays: (c.Trays ?? []).map((t) => ({
          trayId: t.TrayId ?? 0,
          brand: t.Brand ?? "",
          filamentType: t.FilamentType ?? "",
          filamentName: t.FilamentName ?? "",
          filamentCode: t.FilamentCode ?? "",
          filamentColor: t.FilamentColor ?? "",
          minNozzleTemp: t.MinNozzleTemp ?? 0,
          maxNozzleTemp: t.MaxNozzleTemp ?? 0,
          status: (t.Status ?? 0) as 0 | 1 | 2,
        })),
      })),
    });
  }

  async setAutoRefill(_enable: boolean): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "setAutoRefill not supported on CC V1"));
  }

  async updatePrinterName(_name: string): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "updatePrinterName not supported on CC V1"));
  }

  async homeAxis(_axes: string): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "homeAxis not supported on CC V1"));
  }

  async moveAxis(_axes: string, _distanceMm: number): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "moveAxis not supported on CC V1"));
  }

  async setTemperature(_targets: Readonly<Record<string, number>>): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "setTemperature not supported on CC V1"));
  }

  async setFanSpeed(_speeds: Readonly<Record<string, number>>): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "setFanSpeed not supported on CC V1"));
  }

  async setPrintSpeed(_mode: 0 | 1 | 2 | 3): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "setPrintSpeed not supported on CC V1"));
  }

  async getPrintTaskList(_page?: number, _pageSize?: number): Promise<Result<PrintTaskListData>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "getPrintTaskList not supported on CC V1"));
  }

  async deletePrintTasks(_taskIds: readonly string[]): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "deletePrintTasks not supported on CC V1"));
  }

  async triggerFileDownload(_params: FileDownloadTriggerParams): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "triggerFileDownload not supported on CC V1"));
  }

  async cancelFileDownload(_taskId: string): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "cancelFileDownload not supported on CC V1"));
  }

  async startPrint(params: StartPrintParams): Promise<Result<void>> {
    return this.sendCommand(CC_V1_CMD.START_PRINT, {
      Filename: params.fileName,
      StartLayer: 0,
      AutoLeveling: params.autoBedLeveling ? 1 : 0,
    });
  }

  async pausePrint(): Promise<Result<void>> {
    return this.sendCommand(CC_V1_CMD.PAUSE_PRINT, {});
  }

  async resumePrint(): Promise<Result<void>> {
    return this.sendCommand(CC_V1_CMD.RESUME_PRINT, {});
  }

  async stopPrint(): Promise<Result<void>> {
    return this.sendCommand(CC_V1_CMD.STOP_PRINT, {});
  }

  onStatus(handler: (status: PrinterStatusData) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  onConnection(handler: (connected: boolean) => void): Unsubscribe {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  private onMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    try {
      const topicType = getTopicType(raw);
      if (topicType === "status") {
        const parsed = JSON.parse(raw) as { Data: RawCcV1Status };
        const status = mapStatus(this.printerInfo?.printerId ?? "", parsed.Data ?? {});
        for (const handler of this.statusHandlers) handler(status);
        return;
      }
      if (topicType === "attributes") {
        if (this.pendingAttributeRequest) {
          const parsed = JSON.parse(raw) as { Data: RawCcV1Attributes };
          clearTimeout(this.pendingAttributeRequest.timer);
          const pending = this.pendingAttributeRequest;
          this.pendingAttributeRequest = null;
          pending.resolve(parsed.Data ?? {});
        }
        return;
      }
      const response = decodeResponse(raw);
      const pending = this.pending.get(response.RequestID);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(response.RequestID);
        pending.resolve(response);
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private async sendCommand(cmd: (typeof CC_V1_CMD)[keyof typeof CC_V1_CMD], data: unknown): Promise<Result<void>> {
    const result = await this.requestWithTimeout<{ Code: number; Msg: string }>(
      (id) => encodeRequest(id, cmd, data),
      this.mainboardId,
    );
    if (!result.ok) return result;
    if (result.value.Code !== 0) {
      return err(new ElegooError(ErrorCode.PRINTER_COMMAND_FAILED, result.value.Msg));
    }
    return ok(undefined);
  }

  private async requestWithTimeout<T>(
    buildRequest: (mainboardId: string) => { Data: { RequestID: string } },
    mainboardId: string,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<Result<T>> {
    const request = buildRequest(mainboardId);
    const requestId = request.Data.RequestID;

    try {
      await this.transport.send(request);
    } catch (cause) {
      return err(new ElegooError(ErrorCode.NETWORK_ERROR, "Failed to send command", cause));
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve(err(new ElegooError(ErrorCode.OPERATION_TIMEOUT, `Request ${requestId} timed out`)));
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve: (value) => resolve(ok(value as T)),
        timer,
      });
    });
  }
}
