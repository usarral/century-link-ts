import { describe, it, expect } from "vitest";
import { encodeRequest, decodeMessage, isStatusPush, isAttributesPush, CC_V2_METHOD } from "./CcV2Codec.js";

describe("CcV2Codec.encodeRequest", () => {
  it("produces a valid request", () => {
    const req = encodeRequest(CC_V2_METHOD.GET_STATUS);
    expect(req.method).toBe(CC_V2_METHOD.GET_STATUS);
    expect(typeof req.id).toBe("number");
    expect(req.id).toBeGreaterThan(0);
  });

  it("increments id per call", () => {
    const r1 = encodeRequest(CC_V2_METHOD.GET_STATUS);
    const r2 = encodeRequest(CC_V2_METHOD.GET_STATUS);
    expect(r2.id).toBeGreaterThan(r1.id);
  });

  it("includes params", () => {
    const req = encodeRequest(CC_V2_METHOD.START_PRINT, { filename: "model.gcode" });
    expect((req.params as { filename: string }).filename).toBe("model.gcode");
  });
});

describe("CcV2Codec.decodeMessage", () => {
  it("parses a response", () => {
    const raw = JSON.stringify({ id: 5, result: { state: 1 }, error: null });
    const msg = decodeMessage(raw);
    expect(msg.id).toBe(5);
  });

  it("parses a status push", () => {
    const raw = JSON.stringify({ id: 99, method: CC_V2_METHOD.ON_STATUS, result: { current_status: 1 } });
    const msg = decodeMessage(raw);
    expect(isStatusPush(msg)).toBe(true);
  });
});

describe("CcV2Codec.isStatusPush", () => {
  it("returns true for method 6000", () => {
    const msg = decodeMessage(JSON.stringify({ id: 1, method: 6000, result: {} }));
    expect(isStatusPush(msg)).toBe(true);
  });

  it("returns false for regular response", () => {
    const msg = decodeMessage(JSON.stringify({ id: 1, result: {}, error: null }));
    expect(isStatusPush(msg)).toBe(false);
  });
});

describe("CcV2Codec.isAttributesPush", () => {
  it("returns true for method 6008", () => {
    const msg = decodeMessage(JSON.stringify({ id: 1, method: 6008, result: {} }));
    expect(isAttributesPush(msg)).toBe(true);
  });
});
