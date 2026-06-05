import type { Unsubscribe } from "../../domain/ports/PrinterAdapter.js";

export type MessageHandler = (message: unknown) => void;

export interface TransportParams {
  readonly host: string;
  readonly port?: number;
  readonly timeoutMs: number | undefined;
  readonly username: string | undefined;
  readonly password: string | undefined;
}

export interface Transport {
  connect(params: TransportParams): Promise<void>;
  disconnect(): Promise<void>;
  send(message: unknown): Promise<void>;
  subscribe(handler: MessageHandler): Unsubscribe;
  isConnected(): boolean;
}
