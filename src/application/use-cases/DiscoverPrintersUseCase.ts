import type { DiscoveryAdapter, DiscoveryParams } from "../../domain/ports/DiscoveryAdapter.js";
import type { DiscoveredPrinter } from "../../domain/entities/DiscoveredPrinter.js";

export class DiscoverPrintersUseCase {
  constructor(private readonly adapters: readonly DiscoveryAdapter[]) {}

  async *execute(params?: DiscoveryParams): AsyncIterable<DiscoveredPrinter> {
    const streams = this.adapters.map((a) => a.discover(params));
    const queue: DiscoveredPrinter[] = [];
    let done = 0;
    let resolve: (() => void) | null = null;

    const notify = (printer: DiscoveredPrinter) => {
      queue.push(printer);
      resolve?.();
    };

    const promises = streams.map(async (stream) => {
      for await (const printer of stream) {
        notify(printer);
      }
      done++;
      resolve?.();
    });

    while (done < streams.length || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((r) => {
          resolve = r;
        });
        resolve = null;
      }
      while (queue.length > 0) {
        yield queue.shift()!;
      }
    }

    await Promise.all(promises);
  }
}
