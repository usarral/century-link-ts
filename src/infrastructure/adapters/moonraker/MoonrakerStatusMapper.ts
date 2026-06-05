import { PrinterState } from "../../../domain/types/PrinterState.js";
import { PrinterSubState } from "../../../domain/types/PrinterSubState.js";
import type { PrinterStatusData } from "../../../domain/entities/PrinterStatus.js";

export interface RawMoonrakerStatus {
  print_stats?: {
    filename?: string;
    state?: string;
    print_duration?: number;
    total_duration?: number;
    filament_used?: number;
    info?: { total_layer?: number; current_layer?: number };
  };
  toolhead?: { position?: number[] };
  extruder?: { temperature?: number; target?: number };
  heater_bed?: { temperature?: number; target?: number };
  virtual_sdcard?: { progress?: number };
  display_status?: { progress?: number };
  idle_timeout?: { state?: string };
}

export function mergeDelta(base: RawMoonrakerStatus, delta: Partial<RawMoonrakerStatus>): RawMoonrakerStatus {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(delta)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value) && typeof merged[key] === "object" && merged[key] !== null) {
      merged[key] = { ...(merged[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      merged[key] = value;
    }
  }
  return merged as RawMoonrakerStatus;
}

export function mapMoonrakerStatus(printerId: string, raw: RawMoonrakerStatus): PrinterStatusData {
  const printStats = raw.print_stats ?? {};
  const state = printStats.state ?? "";

  let printerState = PrinterState.IDLE;
  let subState = PrinterSubState.NONE;

  switch (state) {
    case "printing":
      printerState = PrinterState.PRINTING;
      subState = PrinterSubState.P_PRINTING;
      break;
    case "paused":
      printerState = PrinterState.PRINTING;
      subState = PrinterSubState.P_PAUSED;
      break;
    case "complete":
      printerState = PrinterState.PRINTING;
      subState = PrinterSubState.P_PRINTING_COMPLETED;
      break;
    case "error":
      printerState = PrinterState.EXCEPTION;
      break;
    case "standby":
    case "":
      printerState = PrinterState.IDLE;
      break;
    default:
      printerState = PrinterState.UNKNOWN;
  }

  const progressSource = raw.virtual_sdcard ?? raw.display_status;
  const progressRatio = Math.max(0, Math.min(1, progressSource?.progress ?? 0));
  const progress = Math.round(progressRatio * 100);

  const currentTime = Math.round(printStats.print_duration ?? 0);
  const totalTime = progressRatio > 0 ? Math.round(currentTime / progressRatio) : 0;

  const hasJob = state === "printing" || state === "paused" || state === "complete";
  const job = hasJob
    ? {
        taskId: "",
        fileName: printStats.filename ?? "",
        totalTimeSeconds: totalTime,
        elapsedTimeSeconds: currentTime,
        remainingTimeSeconds: Math.max(0, totalTime - currentTime),
        totalLayers: printStats.info?.total_layer ?? 0,
        currentLayer: printStats.info?.current_layer ?? 0,
        progress,
        speedMode: 0 as const,
      }
    : undefined;

  const temperatures: Record<string, { current: number; target: number; highest: number; lowest: number }> = {};
  if (raw.extruder) {
    temperatures["extruder"] = { current: raw.extruder.temperature ?? 0, target: raw.extruder.target ?? 0, highest: 0, lowest: 0 };
  }
  if (raw.heater_bed) {
    temperatures["heatedBed"] = { current: raw.heater_bed.temperature ?? 0, target: raw.heater_bed.target ?? 0, highest: 0, lowest: 0 };
  }

  return {
    printerId,
    printer: { state: printerState, subState, exceptionCodes: [], progress },
    job,
    temperatures,
    fans: {},
    axes: (raw.toolhead?.position ?? []).slice(0, 4),
    lights: {},
    storage: {},
    canvas: { activeCanvasId: 0, activeTrayId: 0, autoRefill: false, canvases: [] },
    externalDevices: { usbConnected: false, sdCardConnected: false, cameraConnected: false, canvasConnected: false },
    exceptions: [],
    deviceAssistantStatus: 0,
  };
}
