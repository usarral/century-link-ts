import { WebSocketTransport } from "../../transport/websocket/WebSocketTransport.js";
import { mapMoonrakerStatus, mergeDelta, type RawMoonrakerStatus } from "./MoonrakerStatusMapper.js";
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

const MOONRAKER_DEFAULT_PORT = 7125;
const REQUEST_TIMEOUT_MS = 10_000;

const SUBSCRIBE_OBJECTS = {
  gcode_move: null,
  toolhead: null,
  display_status: null,
  idle_timeout: null,
  print_stats: null,
  heater_bed: null,
  pause_resume: null,
  extruder: null,
  virtual_sdcard: null,
};

interface RawSystemInfo {
  system_info?: {
    network?: { wlan0?: { mac_address?: string } };
    cpu_info?: { model?: string };
    distribution?: { name?: string };
  };
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  timer: NodeJS.Timeout;
};

export class MoonrakerPrinterAdapter implements PrinterAdapter {
  private readonly transport = new WebSocketTransport();
  private printerInfo: PrinterInfo | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private cachedStatus: RawMoonrakerStatus = {};
  private hasFullStatus = false;
  private statusHandlers = new Set<(s: PrinterStatusData) => void>();
  private attributesHandlers = new Set<(a: PrinterAttributes) => void>();
  private connectionHandlers = new Set<(c: boolean) => void>();
  private unsubscribeTransport: Unsubscribe | null = null;

  constructor(private readonly type: PrinterType = PrinterType.GENERIC_FDM_KLIPPER) {}

  async connect(params: ConnectParams): Promise<Result<PrinterInfo>> {
    const port = params.port ?? MOONRAKER_DEFAULT_PORT;
    try {
      await this.transport.connect({ host: params.host, port, timeoutMs: params.connectionTimeoutMs, username: undefined, password: undefined });
    } catch (cause) {
      return err(new ElegooError(ErrorCode.PRINTER_CONNECTION_ERROR, `Failed to connect to ${params.host}:${port}`, cause));
    }

    this.unsubscribeTransport = this.transport.subscribe((raw) => this.onMessage(raw));

    // Get system info for mainboard ID
    const sysResult = await this.sendRequest<{ result: RawSystemInfo }>("machine.system_info", {});
    const mainboardId = sysResult.ok
      ? (sysResult.value.result?.system_info?.network?.wlan0?.mac_address ?? params.serialNumber ?? "")
      : (params.serialNumber ?? "");

    // Subscribe to printer objects — also returns current full state
    const subResult = await this.sendRequest<{ result: { status: RawMoonrakerStatus } }>(
      "printer.objects.subscribe",
      { objects: SUBSCRIBE_OBJECTS },
    );

    if (!subResult.ok) {
      await this.transport.disconnect();
      return subResult;
    }

    if (subResult.value.result?.status) {
      this.cachedStatus = subResult.value.result.status;
      this.hasFullStatus = true;
    }

    const brand = this.type === PrinterType.ELEGOO_FDM_KLIPPER ? "Elegoo" : "Generic";
    this.printerInfo = {
      printerId: `moonraker_${mainboardId || params.host}`,
      printerType: this.type,
      brand,
      name: params.name ?? "Klipper Printer",
      model: params.model,
      firmwareVersion: "",
      mainboardId,
      serialNumber: params.serialNumber ?? mainboardId,
      host: params.host,
      authMode: params.authMode ?? "",
    };

    if (this.hasFullStatus) {
      const status = mapMoonrakerStatus(this.printerInfo.printerId, this.cachedStatus);
      for (const h of this.statusHandlers) h(status);
    }

    for (const h of this.connectionHandlers) h(true);
    return ok(this.printerInfo);
  }

  async disconnect(): Promise<void> {
    this.unsubscribeTransport?.();
    await this.transport.disconnect();
    for (const h of this.connectionHandlers) h(false);
  }

  async getStatus(timeoutMs = REQUEST_TIMEOUT_MS): Promise<Result<PrinterStatusData>> {
    const result = await this.sendRequest<{ result: { status: RawMoonrakerStatus } }>(
      "printer.objects.query",
      { objects: SUBSCRIBE_OBJECTS },
      timeoutMs,
    );
    if (!result.ok) return result;
    const raw = result.value.result?.status ?? {};
    this.cachedStatus = mergeDelta(this.cachedStatus, raw);
    this.hasFullStatus = true;
    return ok(mapMoonrakerStatus(this.printerInfo?.printerId ?? "", this.cachedStatus));
  }

  async getAttributes(timeoutMs = REQUEST_TIMEOUT_MS): Promise<Result<PrinterAttributes>> {
    const result = await this.sendRequest<{ result: RawSystemInfo }>("machine.system_info", {}, timeoutMs);
    if (!result.ok) return result;

    const info = this.printerInfo;
    const sysInfo = result.value.result?.system_info;
    const mainboardId = sysInfo?.network?.wlan0?.mac_address ?? info?.mainboardId ?? "";

    return ok({
      printerId: info?.printerId ?? "",
      printerType: this.type,
      brand: info?.brand ?? "Generic",
      name: info?.name ?? "Klipper Printer",
      model: info?.model ?? "",
      firmwareVersion: info?.firmwareVersion ?? "",
      mainboardId,
      serialNumber: info?.serialNumber ?? mainboardId,
      host: info?.host ?? "",
      authMode: (info?.authMode ?? "") as PrinterInfo["authMode"],
      capabilities: {
        storage: [
          { name: "local", removable: false },
          { name: "udisk", removable: true },
          { name: "sdcard", removable: true },
        ],
        fans: [{ name: "model", controllable: true, minSpeed: 0, maxSpeed: 100, supportsRpmReading: false }],
        temperatures: [
          { name: "extruder", controllable: true, supportsReading: true, minTemperature: 0, maxTemperature: 300 },
          { name: "heatedBed", controllable: true, supportsReading: true, minTemperature: 0, maxTemperature: 120 },
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

  async startPrint(params: StartPrintParams): Promise<Result<void>> {
    return this.sendCommand("printer.print.start", { filename: params.fileName });
  }

  async pausePrint(): Promise<Result<void>> {
    return this.sendCommand("printer.print.pause", {});
  }

  async resumePrint(): Promise<Result<void>> {
    return this.sendCommand("printer.print.resume", {});
  }

  async stopPrint(): Promise<Result<void>> {
    return this.sendCommand("printer.print.cancel", {});
  }

  async homeAxis(axes: string): Promise<Result<void>> {
    const axesUpper = axes.toUpperCase().split("").join(" ");
    const script = axesUpper ? `G28 ${axesUpper}` : "G28";
    return this.runGCode(script);
  }

  async moveAxis(axes: string, distanceMm: number): Promise<Result<void>> {
    const axis = axes.toUpperCase();
    const script = `G91\nG1 ${axis}${distanceMm} F3000\nG90`;
    return this.runGCode(script);
  }

  async setTemperature(targets: Readonly<Record<string, number>>): Promise<Result<void>> {
    const lines: string[] = [];
    for (const [name, temp] of Object.entries(targets)) {
      if (name === "extruder") lines.push(`M104 S${temp}`);
      else if (name === "heatedBed") lines.push(`M140 S${temp}`);
    }
    if (!lines.length) return ok(undefined);
    return this.runGCode(lines.join("\n"));
  }

  async setFanSpeed(speeds: Readonly<Record<string, number>>): Promise<Result<void>> {
    const modelSpeed = speeds["model"] ?? speeds["fan"];
    if (modelSpeed === undefined) return ok(undefined);
    const s = Math.round(Math.max(0, Math.min(100, modelSpeed)) * 2.55);
    return this.runGCode(`M106 S${s}`);
  }

  async setPrintSpeed(_mode: 0 | 1 | 2 | 3): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "setPrintSpeed not supported on Moonraker"));
  }

  async getCanvasStatus(_timeoutMs?: number): Promise<Result<CanvasStatus>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "getCanvasStatus not supported on Moonraker"));
  }

  async setAutoRefill(_enable: boolean): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "setAutoRefill not supported on Moonraker"));
  }

  async updatePrinterName(_name: string): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "updatePrinterName not supported on Moonraker"));
  }

  async getPrintTaskList(_page?: number, _pageSize?: number): Promise<Result<PrintTaskListData>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "getPrintTaskList not supported on Moonraker"));
  }

  async deletePrintTasks(_taskIds: readonly string[]): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "deletePrintTasks not supported on Moonraker"));
  }

  async triggerFileDownload(_params: FileDownloadTriggerParams): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "triggerFileDownload not supported on Moonraker"));
  }

  async cancelFileDownload(_taskId: string): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "cancelFileDownload not supported on Moonraker"));
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
    const result = await this.sendRequest<unknown>(
      "printer.objects.query",
      { objects: SUBSCRIBE_OBJECTS },
      timeoutMs,
    );
    if (!result.ok) return result;
    return ok(JSON.stringify(result.value));
  }

  onStatus(handler: (s: PrinterStatusData) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  onAttributes(handler: (a: PrinterAttributes) => void): Unsubscribe {
    this.attributesHandlers.add(handler);
    return () => this.attributesHandlers.delete(handler);
  }

  onConnection(handler: (c: boolean) => void): Unsubscribe {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  private async runGCode(script: string): Promise<Result<void>> {
    return this.sendCommand("printer.gcode.script", { script });
  }

  private async sendCommand(method: string, params: unknown): Promise<Result<void>> {
    const result = await this.sendRequest<{ error?: { message?: string } }>(method, params);
    if (!result.ok) return result;
    if (result.value.error) {
      return err(new ElegooError(ErrorCode.PRINTER_COMMAND_FAILED, result.value.error.message ?? "Moonraker error"));
    }
    return ok(undefined);
  }

  private sendRequest<T>(method: string, params: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Result<T>> {
    const id = this.nextId++;
    const message = { jsonrpc: "2.0", method, params, id };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(err(new ElegooError(ErrorCode.OPERATION_TIMEOUT, `Request ${id} (${method}) timed out`)));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => resolve(ok(value as T)),
        timer,
      });

      this.transport.send(message).catch((cause: unknown) => {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(err(new ElegooError(ErrorCode.NETWORK_ERROR, `Failed to send ${method}`, cause)));
      });
    });
  }

  private onMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    try {
      const msg = JSON.parse(raw) as { id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown };

      // Incoming push event (notify_status_update)
      if (msg.method === "notify_status_update" && Array.isArray(msg.params)) {
        const delta = msg.params[0] as Partial<RawMoonrakerStatus>;
        if (this.hasFullStatus) {
          this.cachedStatus = mergeDelta(this.cachedStatus, delta);
        } else {
          this.cachedStatus = delta as RawMoonrakerStatus;
          this.hasFullStatus = true;
        }
        const status = mapMoonrakerStatus(this.printerInfo?.printerId ?? "", this.cachedStatus);
        for (const h of this.statusHandlers) h(status);
        return;
      }

      // Response to a pending request
      if (msg.id !== undefined) {
        const pending = this.pending.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(msg.id);
          pending.resolve(msg);
        }
      }
    } catch {
      // Ignore malformed messages
    }
  }
}
