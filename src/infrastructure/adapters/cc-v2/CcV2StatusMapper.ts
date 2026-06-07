import { PrinterState } from "../../../domain/types/PrinterState.js";
import { PrinterSubState } from "../../../domain/types/PrinterSubState.js";
import type {
  PrinterStatusData,
  PrinterCoreStatus,
  PrintJobStatus,
  TemperatureStatus,
  FanStatus,
  CanvasStatus,
  ExternalDeviceStatus,
} from "../../../domain/entities/PrinterStatus.js";

// ── Raw wire types from real CC V2 MQTT protocol ──────────────────────────────

interface RawMachineStatus {
  status?: number;
  sub_status?: number;
  exception_status?: number[];
  progress?: number;
}

interface RawExtruder {
  temperature?: number;
  target?: number;
}

interface RawHeaterBed {
  temperature?: number;
  target?: number;
}

interface RawZSensor {
  temperature?: number;
  measured_max_temperature?: number;
  measured_min_temperature?: number;
}

interface RawFanEntry {
  speed?: number;
  rpm?: number;
}

interface RawExternalDevice {
  camera?: boolean;
  u_disk?: boolean;
  sd_card?: boolean;
}

interface RawPrintStatus {
  enable?: boolean;
  filename?: string;
  uuid?: string;
  total_duration?: number;
  print_duration?: number;
  remaining_time_sec?: number;
  total_layer?: number;
  current_layer?: number;
}

interface RawGcodeMove {
  speed_mode?: number;
}

interface RawLed {
  status?: number; // 0 = off, 1 = on
}

export interface RawCcV2Status {
  machine_status?: RawMachineStatus;
  extruder?: RawExtruder;
  heater_bed?: RawHeaterBed;
  ztemperature_sensor?: RawZSensor;
  fans?: Record<string, RawFanEntry>;
  external_device?: RawExternalDevice;
  print_status?: RawPrintStatus;
  gcode_move?: RawGcodeMove;
  led?: RawLed;
  // error_code is present in responses but ignored
  error_code?: number;
}

// ── Deep merge for incremental push updates ────────────────────────────────────

export function mergeStatus(base: RawCcV2Status, delta: RawCcV2Status): RawCcV2Status {
  const merged: RawCcV2Status = { ...base };
  for (const key of Object.keys(delta) as Array<keyof RawCcV2Status>) {
    const dv = delta[key];
    const bv = base[key];
    if (dv !== null && typeof dv === "object" && !Array.isArray(dv) &&
        bv !== null && typeof bv === "object" && !Array.isArray(bv)) {
      // @ts-expect-error dynamic merge
      merged[key] = { ...bv, ...dv };
    } else {
      // @ts-expect-error dynamic assign
      merged[key] = dv;
    }
  }
  return merged;
}

// ── State mapping (based on elegoo-link C++ SDK) ───────────────────────────────

function mapState(status: number): PrinterState {
  switch (status) {
    case -1: return PrinterState.OFFLINE;
    case 0:  return PrinterState.INITIALIZING;
    case 1:  return PrinterState.IDLE;
    case 2:  return PrinterState.PRINTING;
    case 3:
    case 4:  return PrinterState.FILAMENT_OPERATING;
    case 5:  return PrinterState.AUTO_LEVELING;
    case 6:  return PrinterState.PID_CALIBRATING;
    case 7:  return PrinterState.RESONANCE_TESTING;
    case 8:  return PrinterState.SELF_CHECKING;
    case 9:  return PrinterState.UPDATING;
    case 10: return PrinterState.HOMING;
    default: return PrinterState.UNKNOWN;
  }
}

function mapSubState(mainStatus: number, subStatus: number): PrinterSubState {
  if (mainStatus === 2) {
    switch (subStatus) {
      case 2075: return PrinterSubState.P_PRINTING;
      case 2077: return PrinterSubState.P_PRINTING_COMPLETED;
      case 2501: return PrinterSubState.P_PAUSING;
      case 2502:
      case 2505: return PrinterSubState.P_PAUSED;
      case 2401: return PrinterSubState.P_RESUMING;
      case 2402: return PrinterSubState.P_RESUMING_COMPLETED;
      case 2503: return PrinterSubState.P_STOPPING;
      case 2504: return PrinterSubState.P_STOPPED;
      case 2801:
      case 2802: return PrinterSubState.P_HOMING;
      case 2901:
      case 2902: return PrinterSubState.P_AUTO_LEVELING;
      case 1045:
      case 1096: return PrinterSubState.P_EXTRUDER_PREHEATING;
      case 1405:
      case 1906: return PrinterSubState.P_HEATED_BED_PREHEATING;
      case 0:    return PrinterSubState.NONE;
      default:   return PrinterSubState.UNKNOWN;
    }
  }
  if (mainStatus === 3 || mainStatus === 4) {
    switch (subStatus) {
      case 1133:
      case 1134:
      case 1135: return PrinterSubState.FO_FILAMENT_LOADING;
      case 1136: return PrinterSubState.FO_FILAMENT_LOADING_COMPLETED;
      case 1144: return PrinterSubState.FO_FILAMENT_UNLOADING;
      case 1145: return PrinterSubState.FO_FILAMENT_UNLOADING_COMPLETED;
      case 0:    return PrinterSubState.NONE;
      default:   return PrinterSubState.UNKNOWN;
    }
  }
  if (mainStatus === 5) {
    switch (subStatus) {
      case 2901: return PrinterSubState.AL_AUTO_LEVELING;
      case 2902: return PrinterSubState.AL_AUTO_LEVELING_COMPLETED;
      case 0:    return PrinterSubState.NONE;
      default:   return PrinterSubState.UNKNOWN;
    }
  }
  if (mainStatus === 6) {
    switch (subStatus) {
      case 1503:
      case 1504: return PrinterSubState.PC_PID_CALIBRATING;
      case 1505: return PrinterSubState.PC_PID_CALIBRATING_COMPLETED;
      case 1506: return PrinterSubState.PC_PID_CALIBRATING_FAILED;
      case 0:    return PrinterSubState.NONE;
      default:   return PrinterSubState.UNKNOWN;
    }
  }
  return subStatus === 0 ? PrinterSubState.NONE : PrinterSubState.UNKNOWN;
}

// ── Main mapper ────────────────────────────────────────────────────────────────

export function mapStatus(printerId: string, raw: RawCcV2Status): PrinterStatusData {
  const ms = raw.machine_status;
  const mainStatus = ms?.status ?? -1;
  const subStatus = ms?.sub_status ?? 0;
  const state = mapState(mainStatus);
  const subState = mapSubState(mainStatus, subStatus);

  const core: PrinterCoreStatus = {
    state,
    subState,
    exceptionCodes: ms?.exception_status ?? [],
    progress: ms?.progress ?? 0,
  };

  const temperatures: Record<string, TemperatureStatus> = {};
  if (raw.extruder) {
    temperatures.extruder = {
      current: raw.extruder.temperature ?? 0,
      target: raw.extruder.target ?? 0,
      highest: 0,
      lowest: 0,
    };
  }
  if (raw.heater_bed) {
    temperatures.heatedBed = {
      current: raw.heater_bed.temperature ?? 0,
      target: raw.heater_bed.target ?? 0,
      highest: 0,
      lowest: 0,
    };
  }
  if (raw.ztemperature_sensor) {
    temperatures.chamber = {
      current: raw.ztemperature_sensor.temperature ?? 0,
      target: 0,
      highest: raw.ztemperature_sensor.measured_max_temperature ?? 0,
      lowest: raw.ztemperature_sensor.measured_min_temperature ?? 0,
    };
  }

  const fans: Record<string, FanStatus> = {};
  const rf = raw.fans ?? {};
  const fanMap: Array<[string, string]> = [
    ["fan", "model"],
    ["heater_fan", "heatsink"],
    ["controller_fan", "controller"],
    ["box_fan", "chassis"],
    ["aux_fan", "aux"],
  ];
  for (const [rawKey, mappedKey] of fanMap) {
    if (rf[rawKey]) {
      fans[mappedKey] = { speed: rf[rawKey].speed ?? 0, rpm: rf[rawKey].rpm ?? 0 };
    }
  }

  const ed = raw.external_device;
  const externalDevices: ExternalDeviceStatus = {
    cameraConnected: ed?.camera ?? false,
    usbConnected: ed?.u_disk ?? false,
    sdCardConnected: ed?.sd_card ?? false,
    canvasConnected: false,
  };

  let job: PrintJobStatus | undefined;
  if (state === PrinterState.PRINTING && raw.print_status) {
    const ps = raw.print_status;
    job = {
      taskId: ps.uuid ?? "",
      fileName: ps.filename ?? "",
      totalTimeSeconds: ps.total_duration ?? 0,
      elapsedTimeSeconds: ps.print_duration ?? 0,
      remainingTimeSeconds: ps.remaining_time_sec ?? 0,
      totalLayers: ps.total_layer ?? 0,
      currentLayer: ps.current_layer ?? 0,
      progress: ms?.progress ?? 0,
      speedMode: ((raw.gcode_move?.speed_mode ?? 1) as 0 | 1 | 2 | 3),
    };
  }

  const emptyCanvas: CanvasStatus = {
    activeCanvasId: 0,
    activeTrayId: 0,
    autoRefill: false,
    canvases: [],
  };

  const lights: Record<string, { connected: boolean; brightness: number; color: number }> = {};
  if (raw.led !== undefined) {
    lights.chamber = { connected: true, brightness: raw.led.status ? 100 : 0, color: 0 };
  }

  return {
    printerId,
    printer: core,
    job,
    temperatures,
    fans,
    axes: [],
    lights,
    storage: {},
    canvas: emptyCanvas,
    externalDevices,
    exceptions: [],
    deviceAssistantStatus: 0,
  };
}
