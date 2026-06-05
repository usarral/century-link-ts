import { PrinterState } from "../../../domain/types/PrinterState.js";
import { PrinterSubState } from "../../../domain/types/PrinterSubState.js";
import type {
  PrinterStatusData,
  PrinterCoreStatus,
  PrintJobStatus,
  TemperatureStatus,
  FanStatus,
  CanvasStatus,
  CanvasInfo,
  TrayInfo,
  ExternalDeviceStatus,
  PrinterException,
} from "../../../domain/entities/PrinterStatus.js";

// Raw wire types from CC V2 MQTT protocol
interface RawTemperature {
  current_temp?: number;
  target_temp?: number;
  highest_temp?: number;
  lowest_temp?: number;
}

interface RawFan {
  speed?: number;
  rpm?: number;
}

interface RawTray {
  tray_id?: number;
  brand?: string;
  filament_type?: string;
  filament_name?: string;
  filament_code?: string;
  filament_color?: string;
  min_nozzle_temp?: number;
  max_nozzle_temp?: number;
  status?: number;
}

interface RawCanvas {
  canvas_id?: number;
  name?: string;
  model?: string;
  connected?: boolean;
  trays?: RawTray[];
}

interface RawCanvasStatus {
  active_canvas_id?: number;
  active_tray_id?: number;
  auto_refill?: boolean;
  canvases?: RawCanvas[];
}

interface RawPrintTask {
  task_id?: string;
  file_name?: string;
  total_time?: number;
  current_time?: number;
  estimated_time?: number;
  total_layer?: number;
  current_layer?: number;
  progress?: number;
  print_speed_mode?: number;
}

interface RawExternalDevices {
  usb_connected?: boolean;
  sd_card_connected?: boolean;
  camera_connected?: boolean;
  canvas_connected?: boolean;
}

export interface RawCcV2Status {
  current_status?: number;
  sub_status?: number;
  exception_codes?: number[];
  support_progress?: boolean;
  progress?: number;
  current_print_task?: RawPrintTask;
  temperatures?: Record<string, RawTemperature>;
  fans?: Record<string, RawFan>;
  axes?: number[];
  lights?: Record<string, { connected?: boolean; brightness?: number; color?: number }>;
  storage?: Record<string, { connected?: boolean }>;
  canvas_status?: RawCanvasStatus;
  external_devices?: RawExternalDevices;
  exceptions?: Array<{ code?: string; timestamp?: number }>;
  device_assistant_status?: number;
}

export function mapStatus(printerId: string, raw: RawCcV2Status): PrinterStatusData {
  return {
    printerId,
    printer: mapCoreStatus(raw),
    job: raw.current_print_task ? mapJobStatus(raw.current_print_task) : undefined,
    temperatures: mapTemperatures(raw.temperatures ?? {}),
    fans: mapFans(raw.fans ?? {}),
    axes: raw.axes ?? [],
    lights: mapLights(raw.lights ?? {}),
    storage: mapStorage(raw.storage ?? {}),
    canvas: mapCanvasStatus(raw.canvas_status),
    externalDevices: mapExternalDevices(raw.external_devices),
    exceptions: mapExceptions(raw.exceptions),
    deviceAssistantStatus: raw.device_assistant_status ?? 0,
  };
}

function mapCoreStatus(raw: RawCcV2Status): PrinterCoreStatus {
  return {
    state: (raw.current_status ?? PrinterState.UNKNOWN) as PrinterState,
    subState: (raw.sub_status ?? PrinterSubState.NONE) as PrinterSubState,
    exceptionCodes: raw.exception_codes ?? [],
    progress: raw.progress ?? 0,
  };
}

function mapJobStatus(raw: RawPrintTask): PrintJobStatus {
  return {
    taskId: raw.task_id ?? "",
    fileName: raw.file_name ?? "",
    totalTimeSeconds: raw.total_time ?? 0,
    elapsedTimeSeconds: raw.current_time ?? 0,
    remainingTimeSeconds: raw.estimated_time ?? 0,
    totalLayers: raw.total_layer ?? 0,
    currentLayer: raw.current_layer ?? 0,
    progress: raw.progress ?? 0,
    speedMode: (raw.print_speed_mode ?? 0) as 0 | 1 | 2 | 3,
  };
}

function mapTemperatures(raw: Record<string, RawTemperature>): Record<string, TemperatureStatus> {
  const result: Record<string, TemperatureStatus> = {};
  for (const [key, val] of Object.entries(raw)) {
    result[key] = {
      current: val.current_temp ?? 0,
      target: val.target_temp ?? 0,
      highest: val.highest_temp ?? 0,
      lowest: val.lowest_temp ?? 0,
    };
  }
  return result;
}

function mapFans(raw: Record<string, RawFan>): Record<string, FanStatus> {
  const result: Record<string, FanStatus> = {};
  for (const [key, val] of Object.entries(raw)) {
    result[key] = { speed: val.speed ?? 0, rpm: val.rpm ?? 0 };
  }
  return result;
}

function mapLights(
  raw: Record<string, { connected?: boolean; brightness?: number; color?: number }>,
): Record<string, { connected: boolean; brightness: number; color: number }> {
  const result: Record<string, { connected: boolean; brightness: number; color: number }> = {};
  for (const [key, val] of Object.entries(raw)) {
    result[key] = { connected: val.connected ?? false, brightness: val.brightness ?? 0, color: val.color ?? 0 };
  }
  return result;
}

function mapStorage(
  raw: Record<string, { connected?: boolean }>,
): Record<string, { connected: boolean }> {
  const result: Record<string, { connected: boolean }> = {};
  for (const [key, val] of Object.entries(raw)) {
    result[key] = { connected: val.connected ?? false };
  }
  return result;
}

function mapCanvasStatus(raw?: RawCanvasStatus): CanvasStatus {
  return {
    activeCanvasId: raw?.active_canvas_id ?? 0,
    activeTrayId: raw?.active_tray_id ?? 0,
    autoRefill: raw?.auto_refill ?? false,
    canvases: (raw?.canvases ?? []).map(mapCanvas),
  };
}

function mapCanvas(raw: RawCanvas): CanvasInfo {
  return {
    canvasId: raw.canvas_id ?? 0,
    name: raw.name ?? "",
    model: raw.model ?? "",
    connected: raw.connected ?? false,
    trays: (raw.trays ?? []).map(mapTray),
  };
}

function mapTray(raw: RawTray): TrayInfo {
  return {
    trayId: raw.tray_id ?? 0,
    brand: raw.brand ?? "",
    filamentType: raw.filament_type ?? "",
    filamentName: raw.filament_name ?? "",
    filamentCode: raw.filament_code ?? "",
    filamentColor: raw.filament_color ?? "",
    minNozzleTemp: raw.min_nozzle_temp ?? 0,
    maxNozzleTemp: raw.max_nozzle_temp ?? 0,
    status: (raw.status ?? 0) as 0 | 1 | 2,
  };
}

function mapExternalDevices(raw?: RawExternalDevices): ExternalDeviceStatus {
  return {
    usbConnected: raw?.usb_connected ?? false,
    sdCardConnected: raw?.sd_card_connected ?? false,
    cameraConnected: raw?.camera_connected ?? false,
    canvasConnected: raw?.canvas_connected ?? false,
  };
}

function mapExceptions(raw?: Array<{ code?: string; timestamp?: number }>): readonly PrinterException[] {
  if (!raw) return [];
  return raw.map((e) => ({ code: e.code ?? "", timestamp: e.timestamp ?? 0 }));
}
