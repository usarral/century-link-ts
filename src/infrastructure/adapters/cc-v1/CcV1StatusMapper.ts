import { PrinterState } from "../../../domain/types/PrinterState.js";
import { PrinterSubState } from "../../../domain/types/PrinterSubState.js";
import type { PrinterStatusData } from "../../../domain/entities/PrinterStatus.js";

// Raw wire types from CC V1 WebSocket protocol
interface RawCcV1PrinterStatus {
  CurrentStatus?: number[];
  PreviousStatus?: number[];
  PrintErrorCode?: number;
  PrintProgress?: number;
  PrintSubStatus?: number;
}

interface RawCcV1PrintInfo {
  Filename?: string;
  TotalTicks?: number;
  UsedTicks?: number;
  RemainTicks?: number;
  CurrentTicks?: number;
  TotalLayer?: number;
  CurrentLayer?: number;
  Progress?: number;
  ErrorCode?: number;
}

interface RawCcV1Temperature {
  CurrentTemp?: number;
  TargetTemp?: number;
  MaxTemp?: number;
  MinTemp?: number;
}

export interface RawCcV1Status {
  MainboardID?: string;
  PrinterStatus?: RawCcV1PrinterStatus;
  PrintInfo?: RawCcV1PrintInfo;
  TempOfNozzle?: RawCcV1Temperature;
  TempOfBed?: RawCcV1Temperature;
  FanSpeed?: number;
}

export function mapStatus(printerId: string, raw: RawCcV1Status): PrinterStatusData {
  const printerStatus = raw.PrinterStatus ?? {};
  const printInfo = raw.PrintInfo ?? {};
  const state = printerStatus.CurrentStatus?.[0] ?? PrinterState.UNKNOWN;

  return {
    printerId,
    printer: {
      state: state as PrinterState,
      subState: (printerStatus.PrintSubStatus ?? PrinterSubState.NONE) as PrinterSubState,
      exceptionCodes: printerStatus.PrintErrorCode ? [printerStatus.PrintErrorCode] : [],
      progress: printerStatus.PrintProgress ?? 0,
    },
    job: printInfo.Filename
      ? {
          taskId: "",
          fileName: printInfo.Filename,
          totalTimeSeconds: printInfo.TotalTicks ?? 0,
          elapsedTimeSeconds: printInfo.UsedTicks ?? 0,
          remainingTimeSeconds: printInfo.RemainTicks ?? 0,
          totalLayers: printInfo.TotalLayer ?? 0,
          currentLayer: printInfo.CurrentLayer ?? 0,
          progress: printInfo.Progress ?? 0,
          speedMode: 0 as const,
        }
      : undefined,
    temperatures: {
      extruder: {
        current: raw.TempOfNozzle?.CurrentTemp ?? 0,
        target: raw.TempOfNozzle?.TargetTemp ?? 0,
        highest: raw.TempOfNozzle?.MaxTemp ?? 0,
        lowest: raw.TempOfNozzle?.MinTemp ?? 0,
      },
      heatedBed: {
        current: raw.TempOfBed?.CurrentTemp ?? 0,
        target: raw.TempOfBed?.TargetTemp ?? 0,
        highest: raw.TempOfBed?.MaxTemp ?? 0,
        lowest: raw.TempOfBed?.MinTemp ?? 0,
      },
    },
    fans: {
      model: { speed: raw.FanSpeed ?? 0, rpm: 0 },
    },
    axes: [],
    lights: {},
    storage: {},
    canvas: { activeCanvasId: 0, activeTrayId: 0, autoRefill: false, canvases: [] },
    externalDevices: {
      usbConnected: false,
      sdCardConnected: false,
      cameraConnected: false,
      canvasConnected: false,
    },
  };
}
