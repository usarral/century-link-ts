import mqtt, { type MqttClient } from "mqtt";
import type { Transport, TransportParams, MessageHandler } from "../Transport.js";
import type { Unsubscribe } from "../../../domain/ports/PrinterAdapter.js";

const MQTT_PORT = 1883;
const DEFAULT_USERNAME = "elegoo";
const DEFAULT_PASSWORD = "123456";
const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_PERIOD_MS = 5_000;

export interface MqttTransportParams extends TransportParams {
  readonly serialNumber: string;
  readonly clientId?: string;
}

export class MqttTransport implements Transport {
  private client: MqttClient | null = null;
  private handlers = new Set<MessageHandler>();
  private connectionChangeHandlers = new Set<(connected: boolean) => void>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private serialNumber = "";
  private clientId = "";
  private subscriptionTopics: string[] = [];
  private connected = false;

  async connect(params: TransportParams): Promise<void> {
    const mqttParams = params as MqttTransportParams;
    this.serialNumber = mqttParams.serialNumber;
    this.clientId = mqttParams.clientId ?? `1_PC_${Math.floor(Math.random() * 9000) + 1000}`;
    const timeoutMs = params.timeoutMs ?? 10_000;

    this.subscriptionTopics = [
      `elegoo/${this.serialNumber}/api_status`,
      `elegoo/${this.serialNumber}/${this.clientId}/api_response`,
    ];

    return new Promise((resolve, reject) => {
      const brokerUrl = `mqtt://${params.host}:${MQTT_PORT}`;
      const client = mqtt.connect(brokerUrl, {
        clientId: this.clientId,
        username: params.username ?? DEFAULT_USERNAME,
        password: params.password ?? DEFAULT_PASSWORD,
        connectTimeout: timeoutMs,
        reconnectPeriod: RECONNECT_PERIOD_MS,
        clean: true,
      });

      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          client.end(true);
          reject(new Error(`MQTT connection timed out: ${brokerUrl}`));
        }
      }, timeoutMs);

      client.on("connect", () => {
        if (!settled) {
          // Initial connect — subscribe and resolve
          clearTimeout(timer);
          this.client = client;

          client.subscribe(this.subscriptionTopics, { qos: 1 }, (err) => {
            if (!settled) {
              if (err) {
                settled = true;
                client.end(true);
                reject(err);
                return;
              }
              settled = true;
              this.connected = true;
              this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
              resolve();
            }
          });
        } else if (this.connected === false) {
          // Reconnect case — re-subscribe and notify handlers
          client.subscribe(this.subscriptionTopics, { qos: 1 });
          this.connected = true;
          for (const h of this.connectionChangeHandlers) h(true);
        }
      });

      client.on("offline", () => {
        if (this.connected) {
          this.connected = false;
          for (const h of this.connectionChangeHandlers) h(false);
        }
      });

      client.on("error", (err) => {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          client.end(true);
          reject(err);
        }
      });

      client.on("message", (_topic, payload) => {
        const raw = payload.toString();
        for (const handler of this.handlers) {
          handler(raw);
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.connected = false;
    return new Promise((resolve) => {
      if (!this.client) return resolve();
      this.client.end(false, {}, () => resolve());
      this.client = null;
    });
  }

  async send(message: unknown): Promise<void> {
    if (!this.client) throw new Error("MQTT client is not connected");
    const topic = `elegoo/${this.serialNumber}/${this.clientId}/api_request`;
    return new Promise((resolve, reject) => {
      this.client!.publish(topic, JSON.stringify(message), { qos: 1 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  subscribe(handler: MessageHandler): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onConnectionChange(handler: (connected: boolean) => void): Unsubscribe {
    this.connectionChangeHandlers.add(handler);
    return () => this.connectionChangeHandlers.delete(handler);
  }

  isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  private sendHeartbeat(): void {
    if (!this.client?.connected) return;
    const topic = `elegoo/${this.serialNumber}/${this.clientId}/api_heartbeat`;
    this.client.publish(topic, JSON.stringify({ id: 0 }), { qos: 1 });
  }
}
