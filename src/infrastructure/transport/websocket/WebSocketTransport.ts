import WebSocket from "ws";
import type { Transport, TransportParams, MessageHandler } from "../Transport.js";
import type { Unsubscribe } from "../../../domain/ports/PrinterAdapter.js";

const WS_DEFAULT_PORT = 3030;
const PING_INTERVAL_MS = 30_000;

export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private pingTimer: NodeJS.Timeout | null = null;

  async connect(params: TransportParams): Promise<void> {
    const url = `ws://${params.host}:${params.port ?? WS_DEFAULT_PORT}/websocket`;
    const timeoutMs = params.timeoutMs ?? 10_000;

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => {
        socket.terminate();
        reject(new Error(`WebSocket connection timed out: ${url}`));
      }, timeoutMs);

      socket.on("open", () => {
        clearTimeout(timer);
        this.ws = socket;
        this.pingTimer = setInterval(() => socket.ping(), PING_INTERVAL_MS);
        resolve();
      });

      socket.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      socket.on("message", (data) => {
        const raw = data.toString();
        for (const handler of this.handlers) {
          handler(raw);
        }
      });

      socket.on("close", () => {
        this.ws = null;
        if (this.pingTimer) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  async send(message: unknown): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    return new Promise((resolve, reject) => {
      this.ws!.send(JSON.stringify(message), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  subscribe(handler: MessageHandler): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
