import type { DiscoveredPrinter } from "../entities/DiscoveredPrinter.js";

export interface DiscoveryParams {
  readonly timeoutMs?: number;
  readonly broadcastIntervalMs?: number;
  readonly listenPorts?: readonly number[];
}

export interface DiscoveryAdapter {
  discover(params?: DiscoveryParams): AsyncIterable<DiscoveredPrinter>;
}
