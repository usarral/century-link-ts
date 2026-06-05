import { randomUUID } from "crypto";

export const CC_V1_CMD = {
  GET_STATUS: 0,
  GET_ATTRIBUTES: 1,
  START_PRINT: 128,
  PAUSE_PRINT: 129,
  STOP_PRINT: 130,
  RESUME_PRINT: 131,
  GET_CANVAS_STATUS: 324,
} as const;

export type CcV1Cmd = (typeof CC_V1_CMD)[keyof typeof CC_V1_CMD];

export interface CcV1Request {
  readonly Id: string;
  readonly Data: {
    readonly RequestID: string;
    readonly MainboardID: string;
    readonly TimeStamp: number;
    readonly Cmd: CcV1Cmd;
    readonly From: 1;
    readonly Data: unknown;
  };
  readonly Topic: string;
}

export interface CcV1Response {
  readonly RequestID: string;
  readonly Code: number;
  readonly Msg: string;
  readonly Data: unknown;
}

export function encodeRequest(
  mainboardId: string,
  cmd: CcV1Cmd,
  data: unknown = {},
): CcV1Request {
  const requestId = randomUUID();
  return {
    Id: mainboardId,
    Data: {
      RequestID: requestId,
      MainboardID: mainboardId,
      TimeStamp: Math.floor(Date.now() / 1000),
      Cmd: cmd,
      From: 1,
      Data: data,
    },
    Topic: `sdcp/request/${mainboardId}`,
  };
}

export function decodeResponse(raw: string): CcV1Response {
  const parsed = JSON.parse(raw) as CcV1Response;
  if (!parsed.RequestID) throw new Error("Invalid CC V1 response: missing RequestID");
  return parsed;
}

export function isStatusPush(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { Topic?: string };
    return typeof parsed.Topic === "string" && parsed.Topic.startsWith("sdcp/");
  } catch {
    return false;
  }
}
