export const PRINTER_CONNECTION_EVENT = "printer:connection" as const;

export interface PrinterConnectionEvent {
  readonly printerId: string;
  readonly connected: boolean;
}
