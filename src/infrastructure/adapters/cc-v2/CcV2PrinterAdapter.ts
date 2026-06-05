import { MqttTransport } from "../../transport/mqtt/MqttTransport.js";
import {
  encodeRequest,
  decodeMessage,
  isStatusPush,
  isAttributesPush,
  CC_V2_METHOD,
} from "../../transport/mqtt/CcV2Codec.js";
import { mapStatus, type RawCcV2Status } from "./CcV2StatusMapper.js";
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
import type { PrintTaskListData, PrintTaskDetail } from "../../../domain/entities/PrintTask.js";
import type { FileListData, FileDetail } from "../../../domain/entities/FileInfo.js";
import type { FileDetailParams } from "../../../domain/ports/FileAdapter.js";
import type { Result } from "../../../application/result/Result.js";

interface RawCcV2Attributes {
  machine_model?: string;
  sn?: string;
  hostname?: string;
  software_version?: { ota_version?: string };
}

interface RawPrintTaskItem {
  task_id?: string;
  file_name?: string;
  print_time?: number;
  total_layer?: number;
  progress?: number;
  status?: number;
  created_at?: number;
  thumbnail_url?: string;
}

interface RawPrintTaskListResult {
  list?: RawPrintTaskItem[];
  total?: number;
  page_number?: number;
  page_size?: number;
}

interface RawCanvasStatusResult {
  canvas_status?: RawCcV2Status["canvas_status"];
}

interface RawFileItem {
  filename?: string;
  type?: string;
  print_time?: number;
  layer?: number;
  size?: number;
  create_time?: number;
  total_filament_used?: number;
  total_print_times?: number;
  last_print_time?: number;
}

interface RawFileListResult {
  error_code?: number;
  total?: number;
  offset?: number;
  file_list?: RawFileItem[];
}

interface RawFileDetailResult extends RawFileItem {
  layer_height?: number;
  thumbnail?: string;
  total_filament_used_length?: number;
  color_mapping?: Array<{ t?: number; color?: string; type?: string }>;
}

const REQUEST_TIMEOUT_MS = 10_000;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

export class CcV2PrinterAdapter implements PrinterAdapter {
  private readonly transport = new MqttTransport();
  private printerInfo: PrinterInfo | null = null;
  private pending = new Map<number, PendingRequest>();
  private statusHandlers = new Set<(status: PrinterStatusData) => void>();
  private attributesHandlers = new Set<(attrs: PrinterAttributes) => void>();
  private connectionHandlers = new Set<(connected: boolean) => void>();
  private unsubscribeTransport: Unsubscribe | null = null;
  private unsubscribeConnectionChange: Unsubscribe | null = null;

  async connect(params: ConnectParams): Promise<Result<PrinterInfo>> {
    try {
      await this.transport.connect({
        host: params.host,
        timeoutMs: params.connectionTimeoutMs,
        username: params.username,
        password: params.password ?? params.accessCode,
        serialNumber: params.serialNumber ?? "",
        requireRegistration: true,
      } as Parameters<MqttTransport["connect"]>[0]);
    } catch (cause) {
      return err(new ElegooError(ErrorCode.PRINTER_CONNECTION_ERROR, `Failed to connect to ${params.host}`, cause));
    }

    this.unsubscribeTransport = this.transport.subscribe((raw) => this.onMessage(raw));
    this.unsubscribeConnectionChange = this.transport.onConnectionChange((connected) => {
      for (const handler of this.connectionHandlers) handler(connected);
    });

    const attrsResult = await this.requestWithTimeout<{ result: unknown }>(
      encodeRequest(CC_V2_METHOD.GET_ATTRIBUTES),
    );

    if (!attrsResult.ok) {
      await this.transport.disconnect();
      return attrsResult;
    }

    this.printerInfo = {
      printerId: `elegoo_lan_${params.serialNumber ?? params.host}`,
      printerType: PrinterType.ELEGOO_FDM_CC2,
      brand: "Elegoo",
      name: params.name ?? "Elegoo Printer",
      model: params.model,
      firmwareVersion: "",
      mainboardId: params.serialNumber ?? "",
      serialNumber: params.serialNumber ?? "",
      host: params.host,
      authMode: params.authMode ?? "",
    };

    for (const handler of this.connectionHandlers) handler(true);
    return ok(this.printerInfo);
  }

  async disconnect(): Promise<void> {
    this.unsubscribeTransport?.();
    this.unsubscribeConnectionChange?.();
    await this.transport.disconnect();
    for (const handler of this.connectionHandlers) handler(false);
  }

  async getStatus(timeoutMs = REQUEST_TIMEOUT_MS): Promise<Result<PrinterStatusData>> {
    const result = await this.requestWithTimeout<{ result: RawCcV2Status }>(
      encodeRequest(CC_V2_METHOD.GET_STATUS),
      timeoutMs,
    );
    if (!result.ok) return result;
    const status = mapStatus(this.printerInfo?.printerId ?? "", result.value.result);
    return ok(status);
  }

  async getAttributes(timeoutMs = REQUEST_TIMEOUT_MS): Promise<Result<PrinterAttributes>> {
    const result = await this.requestWithTimeout<{ result: RawCcV2Attributes }>(
      encodeRequest(CC_V2_METHOD.GET_ATTRIBUTES),
      timeoutMs,
    );
    if (!result.ok) return result;
    const raw = result.value.result;
    const info = this.printerInfo;
    return ok({
      printerId: info?.printerId ?? "",
      printerType: PrinterType.ELEGOO_FDM_CC2,
      brand: "Elegoo",
      name: raw.hostname ?? info?.name ?? "Elegoo Printer",
      model: raw.machine_model ?? info?.model ?? "",
      firmwareVersion: raw.software_version?.ota_version ?? "",
      mainboardId: info?.mainboardId ?? "",
      serialNumber: raw.sn ?? info?.serialNumber ?? "",
      host: info?.host ?? "",
      authMode: (info?.authMode ?? "") as PrinterInfo["authMode"],
      capabilities: {
        storage: [
          { name: "usb", removable: true },
          { name: "internal", removable: false },
        ],
        fans: [
          { name: "model", controllable: true, minSpeed: 0, maxSpeed: 100, supportsRpmReading: false },
          { name: "chamber", controllable: true, minSpeed: 0, maxSpeed: 100, supportsRpmReading: false },
          { name: "aux", controllable: true, minSpeed: 0, maxSpeed: 100, supportsRpmReading: false },
        ],
        temperatures: [
          { name: "extruder", controllable: true, supportsReading: true, minTemperature: 0, maxTemperature: 300 },
          { name: "heatedBed", controllable: true, supportsReading: true, minTemperature: 0, maxTemperature: 120 },
          { name: "chamber", controllable: false, supportsReading: true, minTemperature: 0, maxTemperature: 60 },
        ],
        lights: [
          { name: "chamber", type: "singleColor", minBrightness: 0, maxBrightness: 100 },
        ],
        supportsCamera: true,
        supportsTimeLapse: true,
        canSetPrinterName: true,
        canGetDiskInfo: true,
        supportsMultiFilament: true,
        supportsAutoBedLeveling: true,
        supportsHeatedBedSwitching: true,
        supportsFilamentMapping: true,
        supportsAutoRefill: true,
      },
    });
  }

  async getCanvasStatus(timeoutMs = REQUEST_TIMEOUT_MS): Promise<Result<CanvasStatus>> {
    const result = await this.requestWithTimeout<{ result: RawCanvasStatusResult }>(
      encodeRequest(CC_V2_METHOD.GET_CANVAS_STATUS),
      timeoutMs,
    );
    if (!result.ok) return result;
    const raw = result.value.result.canvas_status;
    return ok({
      activeCanvasId: raw?.active_canvas_id ?? 0,
      activeTrayId: raw?.active_tray_id ?? 0,
      autoRefill: raw?.auto_refill ?? false,
      canvases: (raw?.canvases ?? []).map((c) => ({
        canvasId: c.canvas_id ?? 0,
        name: c.name ?? "",
        model: c.model ?? "",
        connected: c.connected ?? false,
        trays: (c.trays ?? []).map((t) => ({
          trayId: t.tray_id ?? 0,
          brand: t.brand ?? "",
          filamentType: t.filament_type ?? "",
          filamentName: t.filament_name ?? "",
          filamentCode: t.filament_code ?? "",
          filamentColor: t.filament_color ?? "",
          minNozzleTemp: t.min_nozzle_temp ?? 0,
          maxNozzleTemp: t.max_nozzle_temp ?? 0,
          status: (t.status ?? 0) as 0 | 1 | 2,
        })),
      })),
    });
  }

  async setAutoRefill(enable: boolean): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.SET_AUTO_REFILL, { auto_refill: enable });
  }

  async updatePrinterName(name: string): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.UPDATE_NAME, { hostname: name });
  }

  async homeAxis(axes: string): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.HOME_AXES, { homed_axes: axes });
  }

  async moveAxis(axes: string, distanceMm: number): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.MOVE_AXES, { axes, distance: distanceMm });
  }

  async setTemperature(targets: Readonly<Record<string, number>>): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.SET_TEMPERATURE, {
      heater_bed: targets["heatedBed"] ?? targets["heater_bed"] ?? 0,
      extruder: targets["extruder"] ?? 0,
    });
  }

  async setFanSpeed(speeds: Readonly<Record<string, number>>): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.SET_FAN_SPEED, {
      fan: speeds["model"] ?? 0,
      box_fan: speeds["chamber"] ?? 0,
      aux_fan: speeds["aux"] ?? 0,
    });
  }

  async setPrintSpeed(mode: 0 | 1 | 2 | 3): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.SET_PRINT_SPEED, { mode });
  }

  async getPrintTaskList(page = 1, pageSize = 20): Promise<Result<PrintTaskListData>> {
    const result = await this.requestWithTimeout<{ result: RawPrintTaskListResult }>(
      encodeRequest(CC_V2_METHOD.GET_PRINT_TASK_LIST, { page_number: page, page_size: pageSize }),
    );
    if (!result.ok) return result;
    const raw = result.value.result;
    const tasks: PrintTaskDetail[] = (raw.list ?? []).map((t) => ({
      taskId: t.task_id ?? "",
      fileName: t.file_name ?? "",
      printTimeSeconds: t.print_time ?? 0,
      totalLayers: t.total_layer ?? 0,
      progress: t.progress ?? 0,
      status: t.status ?? 0,
      createdAt: t.created_at ?? 0,
      thumbnailUrl: t.thumbnail_url ?? "",
    }));
    return ok({
      tasks,
      total: raw.total ?? 0,
      page: raw.page_number ?? page,
      pageSize: raw.page_size ?? pageSize,
    });
  }

  async deletePrintTasks(taskIds: readonly string[]): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.DELETE_PRINT_TASKS, { task_ids: taskIds });
  }

  async getFileList(page = 1, pageSize = 20): Promise<Result<FileListData>> {
    const offset = (page - 1) * pageSize;
    const result = await this.requestWithTimeout<{ result: RawFileListResult }>(
      encodeRequest(CC_V2_METHOD.GET_FILE_LIST, { storage_media: "local", offset, limit: pageSize }),
    );
    if (!result.ok) return result;
    const raw = result.value.result;
    return ok({
      files: (raw.file_list ?? []).map((f) => ({
        fileName: f.filename ?? "",
        printTimeSeconds: f.print_time ?? 0,
        layers: f.layer ?? 0,
        layerHeightMm: 0,
        thumbnailUrl: "",
        sizeBytes: f.size ?? 0,
        createdAt: f.create_time ?? 0,
        filamentUsedGrams: f.total_filament_used ?? 0,
        filamentUsedMm: 0,
        totalPrintTimes: f.total_print_times ?? 0,
        lastPrintAt: f.last_print_time ?? 0,
        colorMapping: [],
      })),
      total: raw.total ?? 0,
      page,
      pageSize,
    });
  }

  async getFileDetail(params: FileDetailParams): Promise<Result<FileDetail>> {
    const result = await this.requestWithTimeout<{ result: RawFileDetailResult }>(
      encodeRequest(CC_V2_METHOD.GET_FILE_DETAIL, { storage_media: "local", filename: params.fileName }),
    );
    if (!result.ok) return result;
    const raw = result.value.result;
    if (!raw.filename) return err(new ElegooError(ErrorCode.FILE_NOT_FOUND, `File not found: ${params.fileName}`));
    return ok({
      fileName: raw.filename,
      printTimeSeconds: raw.print_time ?? 0,
      layers: raw.layer ?? 0,
      layerHeightMm: raw.layer_height ?? 0,
      thumbnailUrl: raw.thumbnail ?? "",
      sizeBytes: raw.size ?? 0,
      createdAt: raw.create_time ?? 0,
      filamentUsedGrams: raw.total_filament_used ?? 0,
      filamentUsedMm: raw.total_filament_used_length ?? 0,
      totalPrintTimes: raw.total_print_times ?? 0,
      lastPrintAt: raw.last_print_time ?? 0,
      colorMapping: (raw.color_mapping ?? []).map((m) => ({
        trayIndex: m.t ?? 0,
        color: m.color ?? "",
        type: m.type ?? "",
      })),
    });
  }

  async triggerFileDownload(params: FileDownloadTriggerParams): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.DOWNLOAD_FILE, {
      filename: params.fileName,
      url: params.fileUrl,
      md5: params.md5,
      taskID: params.taskId,
    });
  }

  async cancelFileDownload(taskId: string): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.CANCEL_DOWNLOAD, { taskID: taskId });
  }

  async startPrint(params: StartPrintParams): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.START_PRINT, {
      filename: params.fileName,
      storage_location: params.storageLocation,
      auto_bed_leveling: params.autoBedLeveling ?? false,
      heated_bed_type: params.heatedBedType ?? 0,
      enable_time_lapse: params.enableTimeLapse ?? false,
      force_bed_level: params.forceBedLevel ?? false,
      slot_map: params.slotMap?.map((s) => ({ t: s.trayIndex, canvas_id: s.canvasId, tray_id: s.trayId })) ?? [],
    });
  }

  async pausePrint(): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.PAUSE_PRINT, {});
  }

  async resumePrint(): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.RESUME_PRINT, {});
  }

  async stopPrint(): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.STOP_PRINT, {});
  }

  async refreshPrinterStatus(): Promise<Result<void>> {
    void this.getStatus().then((result) => {
      if (result.ok) for (const h of this.statusHandlers) h(result.value);
    });
    return ok(undefined);
  }

  async refreshPrinterAttributes(): Promise<Result<void>> {
    void this.getAttributes().then((result) => {
      if (result.ok) for (const h of this.attributesHandlers) h(result.value);
    });
    return ok(undefined);
  }

  async getStatusRaw(timeoutMs = REQUEST_TIMEOUT_MS): Promise<Result<string>> {
    const result = await this.requestWithTimeout<unknown>(
      encodeRequest(CC_V2_METHOD.GET_STATUS),
      timeoutMs,
    );
    if (!result.ok) return result;
    return ok(JSON.stringify(result.value));
  }

  onStatus(handler: (status: PrinterStatusData) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  onAttributes(handler: (attrs: PrinterAttributes) => void): Unsubscribe {
    this.attributesHandlers.add(handler);
    return () => this.attributesHandlers.delete(handler);
  }

  onConnection(handler: (connected: boolean) => void): Unsubscribe {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  private onMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    try {
      const msg = decodeMessage(raw);
      if (isStatusPush(msg)) {
        const status = mapStatus(this.printerInfo?.printerId ?? "", msg.result as RawCcV2Status);
        for (const handler of this.statusHandlers) handler(status);
        return;
      }
      if (isAttributesPush(msg)) {
        const raw = msg.result as RawCcV2Attributes;
        const info = this.printerInfo;
        const attrs = {
          printerId: info?.printerId ?? "",
          printerType: PrinterType.ELEGOO_FDM_CC2,
          brand: "Elegoo",
          name: raw.hostname ?? info?.name ?? "",
          model: raw.machine_model ?? info?.model ?? "",
          firmwareVersion: raw.software_version?.ota_version ?? info?.firmwareVersion ?? "",
          mainboardId: raw.sn ?? info?.mainboardId ?? "",
          serialNumber: raw.sn ?? info?.serialNumber ?? "",
          host: info?.host ?? "",
          authMode: (info?.authMode ?? "") as PrinterInfo["authMode"],
          capabilities: {
            storage: [{ name: "usb", removable: true }, { name: "internal", removable: false }],
            fans: [
              { name: "model", controllable: true, minSpeed: 0, maxSpeed: 100, supportsRpmReading: false },
              { name: "chamber", controllable: true, minSpeed: 0, maxSpeed: 100, supportsRpmReading: false },
              { name: "aux", controllable: true, minSpeed: 0, maxSpeed: 100, supportsRpmReading: false },
            ],
            temperatures: [
              { name: "extruder", controllable: true, supportsReading: true, minTemperature: 0, maxTemperature: 300 },
              { name: "heatedBed", controllable: true, supportsReading: true, minTemperature: 0, maxTemperature: 120 },
              { name: "chamber", controllable: false, supportsReading: true, minTemperature: 0, maxTemperature: 60 },
            ],
            lights: [{ name: "chamber", type: "singleColor" as const, minBrightness: 0, maxBrightness: 100 }],
            supportsCamera: true,
            supportsTimeLapse: true,
            canSetPrinterName: true,
            canGetDiskInfo: true,
            supportsMultiFilament: true,
            supportsAutoBedLeveling: true,
            supportsHeatedBedSwitching: true,
            supportsFilamentMapping: true,
            supportsAutoRefill: true,
          },
        };
        for (const handler of this.attributesHandlers) handler(attrs);
        return;
      }
      const pending = this.pending.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(msg.id);
        pending.resolve(msg);
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private async sendCommand(method: typeof CC_V2_METHOD[keyof typeof CC_V2_METHOD], params: unknown): Promise<Result<void>> {
    const result = await this.requestWithTimeout<{ result: unknown; error: unknown }>(
      encodeRequest(method, params),
    );
    if (!result.ok) return result;
    if (result.value.error) {
      return err(new ElegooError(ErrorCode.PRINTER_COMMAND_FAILED, String(result.value.error)));
    }
    return ok(undefined);
  }

  private async requestWithTimeout<T>(request: { id: number }, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Result<T>> {
    try {
      await this.transport.send(request);
    } catch (cause) {
      return err(new ElegooError(ErrorCode.NETWORK_ERROR, "Failed to send command", cause));
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        resolve(err(new ElegooError(ErrorCode.OPERATION_TIMEOUT, `Request ${request.id} timed out`)));
      }, timeoutMs);

      this.pending.set(request.id, {
        resolve: (value) => resolve(ok(value as T)),
        reject: (error) => resolve(err(new ElegooError(ErrorCode.PRINTER_COMMAND_FAILED, error.message, error))),
        timer,
      });
    });
  }
}
