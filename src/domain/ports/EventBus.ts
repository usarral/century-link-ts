import type { Unsubscribe } from "./PrinterAdapter.js";

export type EventHandler<T> = (event: T) => void;

export interface EventBus {
  emit<T>(eventType: string, event: T): void;
  on<T>(eventType: string, handler: EventHandler<T>): Unsubscribe;
  off(eventType: string, handler: EventHandler<unknown>): void;
}
