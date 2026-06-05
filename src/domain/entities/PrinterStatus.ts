import type { PrinterState } from "../types/PrinterState.js";
import type { PrinterSubState } from "../types/PrinterSubState.js";

export interface TemperatureStatus {
  readonly current: number;
  readonly target: number;
  readonly highest: number;
  readonly lowest: number;
}

export interface FanStatus {
  readonly speed: number;
  readonly rpm: number;
}

export interface LightStatus {
  readonly connected: boolean;
  readonly brightness: number;
  readonly color: number;
}

export interface StorageStatus {
  readonly connected: boolean;
}

export interface ExternalDeviceStatus {
  readonly usbConnected: boolean;
  readonly sdCardConnected: boolean;
  readonly cameraConnected: boolean;
  readonly canvasConnected: boolean;
}

export interface TrayInfo {
  readonly trayId: number;
  readonly brand: string;
  readonly filamentType: string;
  readonly filamentName: string;
  readonly filamentCode: string;
  readonly filamentColor: string;
  readonly minNozzleTemp: number;
  readonly maxNozzleTemp: number;
  readonly status: 0 | 1 | 2;
}

export interface CanvasInfo {
  readonly canvasId: number;
  readonly name: string;
  readonly model: string;
  readonly connected: boolean;
  readonly trays: readonly TrayInfo[];
}

export interface CanvasStatus {
  readonly activeCanvasId: number;
  readonly activeTrayId: number;
  readonly autoRefill: boolean;
  readonly canvases: readonly CanvasInfo[];
}

export interface PrintJobStatus {
  readonly taskId: string;
  readonly fileName: string;
  readonly totalTimeSeconds: number;
  readonly elapsedTimeSeconds: number;
  readonly remainingTimeSeconds: number;
  readonly totalLayers: number;
  readonly currentLayer: number;
  readonly progress: number;
  readonly speedMode: 0 | 1 | 2 | 3;
}

export interface PrinterCoreStatus {
  readonly state: PrinterState;
  readonly subState: PrinterSubState;
  readonly exceptionCodes: readonly number[];
  readonly progress: number;
}

export interface PrinterStatusData {
  readonly printerId: string;
  readonly printer: PrinterCoreStatus;
  readonly job: PrintJobStatus | undefined;
  readonly temperatures: Readonly<Record<string, TemperatureStatus>>;
  readonly fans: Readonly<Record<string, FanStatus>>;
  readonly axes: readonly number[];
  readonly lights: Readonly<Record<string, LightStatus>>;
  readonly storage: Readonly<Record<string, StorageStatus>>;
  readonly canvas: CanvasStatus;
  readonly externalDevices: ExternalDeviceStatus;
}
