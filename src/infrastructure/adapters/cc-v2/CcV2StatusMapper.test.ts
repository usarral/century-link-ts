import { describe, it, expect } from "vitest";
import { mapStatus } from "./CcV2StatusMapper.js";
import { PrinterState } from "../../../domain/types/PrinterState.js";
import { PrinterSubState } from "../../../domain/types/PrinterSubState.js";

describe("CcV2StatusMapper.mapStatus", () => {
  it("maps machine_status fields", () => {
    const result = mapStatus("printer-1", {
      machine_status: {
        status: 2, // PRINTING
        sub_status: 2075, // P_PRINTING
        progress: 42,
        exception_status: [101],
      },
    });

    expect(result.printerId).toBe("printer-1");
    expect(result.printer.state).toBe(PrinterState.PRINTING);
    expect(result.printer.subState).toBe(PrinterSubState.P_PRINTING);
    expect(result.printer.progress).toBe(42);
    expect(result.printer.exceptionCodes).toEqual([101]);
  });

  it("maps status=1 to IDLE", () => {
    const result = mapStatus("printer-1", {
      machine_status: { status: 1, sub_status: 0 },
    });
    expect(result.printer.state).toBe(PrinterState.IDLE);
  });

  it("maps temperature fields", () => {
    const result = mapStatus("printer-1", {
      extruder: { temperature: 210, target: 215 },
      heater_bed: { temperature: 60, target: 65 },
      ztemperature_sensor: { temperature: 35, measured_max_temperature: 40, measured_min_temperature: 20 },
    });

    expect(result.temperatures["extruder"]?.current).toBe(210);
    expect(result.temperatures["extruder"]?.target).toBe(215);
    expect(result.temperatures["heatedBed"]?.current).toBe(60);
    expect(result.temperatures["chamber"]?.current).toBe(35);
    expect(result.temperatures["chamber"]?.highest).toBe(40);
  });

  it("maps print job when state is PRINTING", () => {
    const result = mapStatus("printer-1", {
      machine_status: { status: 2, sub_status: 2075, progress: 50 },
      print_status: {
        uuid: "task-abc",
        filename: "model.gcode",
        total_duration: 3600,
        print_duration: 1800,
        remaining_time_sec: 1800,
        total_layer: 100,
        current_layer: 50,
      },
    });

    expect(result.job).toBeDefined();
    expect(result.job?.taskId).toBe("task-abc");
    expect(result.job?.fileName).toBe("model.gcode");
    expect(result.job?.totalLayers).toBe(100);
    expect(result.job?.progress).toBe(50);
  });

  it("sets job to undefined when not printing", () => {
    const result = mapStatus("printer-1", {
      machine_status: { status: 1 },
    });
    expect(result.job).toBeUndefined();
  });

  it("maps external device fields", () => {
    const result = mapStatus("printer-1", {
      external_device: { camera: true, u_disk: true },
    });
    expect(result.externalDevices.cameraConnected).toBe(true);
    expect(result.externalDevices.usbConnected).toBe(true);
  });

  it("uses defaults for missing fields", () => {
    const result = mapStatus("printer-1", {});
    expect(result.printer.state).toBe(PrinterState.OFFLINE);
    expect(result.printer.subState).toBe(PrinterSubState.NONE);
    expect(result.printer.progress).toBe(0);
    expect(result.externalDevices.usbConnected).toBe(false);
  });

  it("maps paused sub-state", () => {
    const result = mapStatus("printer-1", {
      machine_status: { status: 2, sub_status: 2505 },
    });
    expect(result.printer.subState).toBe(PrinterSubState.P_PAUSED);
  });
});
