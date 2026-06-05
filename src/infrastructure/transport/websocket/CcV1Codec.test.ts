import { describe, it, expect } from "vitest";
import { encodeRequest, decodeResponse, isStatusPush, getTopicType, CC_V1_CMD } from "./CcV1Codec.js";

describe("CcV1Codec.encodeRequest", () => {
  it("produces a valid request envelope", () => {
    const req = encodeRequest("mainboard-001", CC_V1_CMD.GET_STATUS);

    expect(req.Id).toBe("mainboard-001");
    expect(req.Data.MainboardID).toBe("mainboard-001");
    expect(req.Data.Cmd).toBe(CC_V1_CMD.GET_STATUS);
    expect(req.Data.From).toBe(1);
    expect(req.Topic).toBe("sdcp/request/mainboard-001");
    expect(typeof req.Data.RequestID).toBe("string");
    expect(req.Data.TimeStamp).toBeGreaterThan(0);
  });

  it("includes custom data payload", () => {
    const req = encodeRequest("mb-01", CC_V1_CMD.START_PRINT, { Filename: "model.gcode" });
    expect((req.Data.Data as { Filename: string }).Filename).toBe("model.gcode");
  });

  it("generates unique RequestIDs per call", () => {
    const r1 = encodeRequest("mb-01", CC_V1_CMD.GET_STATUS);
    const r2 = encodeRequest("mb-01", CC_V1_CMD.GET_STATUS);
    expect(r1.Data.RequestID).not.toBe(r2.Data.RequestID);
  });
});

describe("CcV1Codec.decodeResponse", () => {
  it("parses a valid response", () => {
    const raw = JSON.stringify({ RequestID: "req-1", Code: 0, Msg: "ok", Data: { state: 1 } });
    const response = decodeResponse(raw);
    expect(response.RequestID).toBe("req-1");
    expect(response.Code).toBe(0);
    expect(response.Msg).toBe("ok");
  });

  it("throws on missing RequestID", () => {
    const raw = JSON.stringify({ Code: 0, Msg: "ok", Data: {} });
    expect(() => decodeResponse(raw)).toThrow("Invalid CC V1 response");
  });
});

describe("CcV1Codec.getTopicType", () => {
  it("identifies status push topic", () => {
    const raw = JSON.stringify({ Topic: "sdcp/status/mainboard-001", Data: {} });
    expect(getTopicType(raw)).toBe("status");
  });

  it("identifies attributes push topic", () => {
    const raw = JSON.stringify({ Topic: "sdcp/attributes/mainboard-001", Data: {} });
    expect(getTopicType(raw)).toBe("attributes");
  });

  it("identifies response topic", () => {
    const raw = JSON.stringify({ Topic: "sdcp/response/mainboard-001", Data: {} });
    expect(getTopicType(raw)).toBe("response");
  });

  it("returns unknown for unrecognised topics", () => {
    const raw = JSON.stringify({ Topic: "sdcp/request/mainboard-001", Data: {} });
    expect(getTopicType(raw)).toBe("unknown");
  });

  it("returns unknown for malformed JSON", () => {
    expect(getTopicType("not json")).toBe("unknown");
  });
});

describe("CcV1Codec.isStatusPush", () => {
  it("returns true for sdcp/status topic messages", () => {
    const raw = JSON.stringify({ Topic: "sdcp/status/mainboard-001", Data: {} });
    expect(isStatusPush(raw)).toBe(true);
  });

  it("returns false for sdcp/response messages", () => {
    const raw = JSON.stringify({ Topic: "sdcp/response/mainboard-001", Data: {} });
    expect(isStatusPush(raw)).toBe(false);
  });

  it("returns false for sdcp/attributes messages", () => {
    const raw = JSON.stringify({ Topic: "sdcp/attributes/mainboard-001", Data: {} });
    expect(isStatusPush(raw)).toBe(false);
  });

  it("returns false for regular responses without Topic", () => {
    const raw = JSON.stringify({ RequestID: "req-1", Code: 0, Msg: "ok", Data: {} });
    expect(isStatusPush(raw)).toBe(false);
  });

  it("returns false for malformed JSON", () => {
    expect(isStatusPush("not json")).toBe(false);
  });
});
