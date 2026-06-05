import type { PrinterInfo } from "./PrinterInfo.js";

export interface StorageComponent {
  readonly name: string;
  readonly removable: boolean;
}

export interface FanComponent {
  readonly name: string;
  readonly controllable: boolean;
  readonly minSpeed: number;
  readonly maxSpeed: number;
  readonly supportsRpmReading: boolean;
}

export interface TemperatureComponent {
  readonly name: string;
  readonly controllable: boolean;
  readonly supportsReading: boolean;
  readonly minTemperature: number;
  readonly maxTemperature: number;
}

export interface LightComponent {
  readonly name: string;
  readonly type: "rgb" | "singleColor";
  readonly minBrightness: number;
  readonly maxBrightness: number;
}

export interface PrinterCapabilities {
  readonly storage: readonly StorageComponent[];
  readonly fans: readonly FanComponent[];
  readonly temperatures: readonly TemperatureComponent[];
  readonly lights: readonly LightComponent[];
  readonly supportsCamera: boolean;
  readonly supportsTimeLapse: boolean;
  readonly canSetPrinterName: boolean;
  readonly supportsMultiFilament: boolean;
  readonly supportsAutoBedLeveling: boolean;
  readonly supportsFilamentMapping: boolean;
  readonly supportsAutoRefill: boolean;
}

export interface PrinterAttributes extends PrinterInfo {
  readonly capabilities: PrinterCapabilities;
}
