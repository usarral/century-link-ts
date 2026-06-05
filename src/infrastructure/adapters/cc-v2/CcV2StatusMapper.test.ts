import { describe, it, expect } from "vitest";
import { mapStatus } from "./CcV2StatusMapper.js";
import { PrinterState } from "../../../domain/types/PrinterState.js";
import { PrinterSubState } from "../../../domain/types/PrinterSubState.js";

describe("CcV2StatusMapper.mapStatus", () => {
  it("maps basic status fields", () => {
    const result = mapStatus("printer-1", {
      current_status: PrinterState.PRINTING,
      sub_status: PrinterSubState.P_PRINTING,
      progress: 42,
      exception_codes: [101],
    });

    expect(result.printerId).toBe("printer-1");
    expect(result.printer.state).toBe(PrinterState.PRINTING);
    expect(result.printer.subState).toBe(PrinterSubState.P_PRINTING);
    expect(result.printer.progress).toBe(42);
    expect(result.printer.exceptionCodes).toEqual([101]);
  });

  it("maps temperature fields", () => {
    const result = mapStatus("printer-1", {
      temperatures: {
        extruder: { current_temp: 210, target_temp: 215, highest_temp: 216, lowest_temp: 22 },
      },
    });

    const extruder = result.temperatures["extruder"];
    expect(extruder?.current).toBe(210);
    expect(extruder?.target).toBe(215);
  });

  it("maps print job when present", () => {
    const result = mapStatus("printer-1", {
      current_print_task: {
        task_id: "task-abc",
        file_name: "model.gcode",
        total_time: 3600,
        current_time: 1800,
        total_layer: 100,
        current_layer: 50,
        progress: 50,
        print_speed_mode: 1,
      },
    });

    expect(result.job).toBeDefined();
    expect(result.job?.taskId).toBe("task-abc");
    expect(result.job?.fileName).toBe("model.gcode");
    expect(result.job?.totalLayers).toBe(100);
  });

  it("sets job to undefined when no print task", () => {
    const result = mapStatus("printer-1", {});
    expect(result.job).toBeUndefined();
  });

  it("uses defaults for missing fields", () => {
    const result = mapStatus("printer-1", {});
    expect(result.printer.state).toBe(PrinterState.UNKNOWN);
    expect(result.printer.subState).toBe(PrinterSubState.NONE);
    expect(result.printer.progress).toBe(0);
    expect(result.externalDevices.usbConnected).toBe(false);
  });
});
