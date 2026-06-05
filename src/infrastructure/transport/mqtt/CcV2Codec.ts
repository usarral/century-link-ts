let requestCounter = 1;

export const CC_V2_METHOD = {
  GET_ATTRIBUTES: 1001,
  GET_STATUS: 1002,
  START_PRINT: 1020,
  PAUSE_PRINT: 1021,
  STOP_PRINT: 1022,
  RESUME_PRINT: 1023,
  HOME_AXES: 1026,
  MOVE_AXES: 1027,
  SET_TEMPERATURE: 1028,
  SET_FAN_SPEED: 1030,
  SET_PRINT_SPEED: 1031,
  GET_PRINT_TASK_LIST: 1036,
  DELETE_PRINT_TASKS: 1038,
  GET_FILE_LIST: 1044,
  GET_FILE_DETAIL: 1046,
  UPDATE_NAME: 1043,
  DOWNLOAD_FILE: 1057,
  CANCEL_DOWNLOAD: 1058,
  GET_CANVAS_STATUS: 2005,
  SET_AUTO_REFILL: 2004,
  DISCOVERY: 7000,

  // Push events (printer → client)
  ON_STATUS: 6000,
  ON_ATTRIBUTES: 6008,
} as const;

export type CcV2Method = (typeof CC_V2_METHOD)[keyof typeof CC_V2_METHOD];

export interface CcV2Request {
  readonly id: number;
  readonly method: CcV2Method;
  readonly params: unknown;
}

export interface CcV2Response {
  readonly id: number;
  readonly result: unknown;
  readonly error: unknown;
}

export interface CcV2Push {
  readonly id: number;
  readonly method: typeof CC_V2_METHOD.ON_STATUS | typeof CC_V2_METHOD.ON_ATTRIBUTES;
  readonly result: unknown;
}

export function encodeRequest(method: CcV2Method, params: unknown = {}): CcV2Request {
  return { id: requestCounter++, method, params };
}

export function decodeMessage(raw: string): CcV2Response | CcV2Push {
  const parsed = JSON.parse(raw) as CcV2Response;
  return parsed;
}

export function isStatusPush(msg: CcV2Response | CcV2Push): msg is CcV2Push {
  return (msg as CcV2Push).method === CC_V2_METHOD.ON_STATUS;
}

export function isAttributesPush(msg: CcV2Response | CcV2Push): msg is CcV2Push {
  return (msg as CcV2Push).method === CC_V2_METHOD.ON_ATTRIBUTES;
}
