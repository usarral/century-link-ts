import { MqttTransport } from "../../transport/mqtt/MqttTransport.js";
import {
  encodeRequest,
  decodeMessage,
  isStatusPush,
  CC_V2_METHOD,
} from "../../transport/mqtt/CcV2Codec.js";
import { mapStatus, type RawCcV2Status } from "./CcV2StatusMapper.js";
import { ErrorCode } from "../../../domain/types/ErrorCode.js";
import { PrinterType } from "../../../domain/types/PrinterType.js";
import { ok, err } from "../../../application/result/Result.js";
import { ElegooError } from "../../../application/result/ElegooError.js";
import type { PrinterAdapter, ConnectParams, StartPrintParams, Unsubscribe } from "../../../domain/ports/PrinterAdapter.js";
import type { PrinterInfo } from "../../../domain/entities/PrinterInfo.js";
import type { PrinterStatusData } from "../../../domain/entities/PrinterStatus.js";
import type { PrinterAttributes } from "../../../domain/entities/PrinterAttributes.js";
import type { Result } from "../../../application/result/Result.js";

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
  private connectionHandlers = new Set<(connected: boolean) => void>();
  private unsubscribeTransport: Unsubscribe | null = null;

  async connect(params: ConnectParams): Promise<Result<PrinterInfo>> {
    try {
      await this.transport.connect({
        host: params.host,
        timeoutMs: params.connectionTimeoutMs,
        username: params.username,
        password: params.password ?? params.accessCode,
        serialNumber: params.serialNumber ?? "",
      } as Parameters<MqttTransport["connect"]>[0]);
    } catch (cause) {
      return err(new ElegooError(ErrorCode.PRINTER_CONNECTION_ERROR, `Failed to connect to ${params.host}`, cause));
    }

    this.unsubscribeTransport = this.transport.subscribe((raw) => this.onMessage(raw));

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
    const result = await this.requestWithTimeout<{ result: unknown }>(
      encodeRequest(CC_V2_METHOD.GET_ATTRIBUTES),
      timeoutMs,
    );
    if (!result.ok) return result;
    // Attributes mapping is simplified — extend with RawCcV2Attributes when needed
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "Attributes mapping not yet implemented"));
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
    return this.sendCommand(CC_V2_METHOD.START_PRINT, { resume: true });
  }

  async stopPrint(): Promise<Result<void>> {
    return this.sendCommand(CC_V2_METHOD.STOP_PRINT, {});
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
      const msg = decodeMessage(raw);
      if (isStatusPush(msg)) {
        const status = mapStatus(this.printerInfo?.printerId ?? "", msg.result as RawCcV2Status);
        for (const handler of this.statusHandlers) handler(status);
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
