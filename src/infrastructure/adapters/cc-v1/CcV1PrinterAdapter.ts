import { WebSocketTransport } from "../../transport/websocket/WebSocketTransport.js";
import {
  encodeRequest,
  decodeResponse,
  isStatusPush,
  CC_V1_CMD,
} from "../../transport/websocket/CcV1Codec.js";
import { mapStatus, type RawCcV1Status } from "./CcV1StatusMapper.js";
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
  timer: NodeJS.Timeout;
};

export class CcV1PrinterAdapter implements PrinterAdapter {
  private readonly transport = new WebSocketTransport();
  private printerInfo: PrinterInfo | null = null;
  private mainboardId = "";
  private pending = new Map<string, PendingRequest>();
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

  async getAttributes(_timeoutMs = REQUEST_TIMEOUT_MS): Promise<Result<PrinterAttributes>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "Attributes mapping not yet implemented for CC V1"));
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
      if (isStatusPush(raw)) {
        const parsed = JSON.parse(raw) as { Data: RawCcV1Status };
        const status = mapStatus(this.printerInfo?.printerId ?? "", parsed.Data ?? {});
        for (const handler of this.statusHandlers) handler(status);
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
