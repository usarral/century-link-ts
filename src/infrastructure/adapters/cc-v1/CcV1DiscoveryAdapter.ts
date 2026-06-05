import { udpBroadcast } from "../../transport/udp/UdpSocket.js";
import { PrinterType } from "../../../domain/types/PrinterType.js";
import type { DiscoveryAdapter, DiscoveryParams } from "../../../domain/ports/DiscoveryAdapter.js";
import type { DiscoveredPrinter } from "../../../domain/entities/DiscoveredPrinter.js";

const DISCOVERY_PORT = 3000;
const DISCOVERY_MESSAGE = "M99999";

interface CcV1DiscoveryResponse {
  Id?: string;
  Data?: {
    Name?: string;
    MachineName?: string;
    MainboardID?: string;
    FirmwareVersion?: string;
  };
}

export class CcV1DiscoveryAdapter implements DiscoveryAdapter {
  async *discover(params?: DiscoveryParams): AsyncIterable<DiscoveredPrinter> {
    const responses = await udpBroadcast({
      message: DISCOVERY_MESSAGE,
      port: DISCOVERY_PORT,
      timeoutMs: params?.timeoutMs ?? 5000,
    });

    for (const response of responses) {
      const parsed = tryParse(response.data.toString());
      if (!parsed?.Data?.MainboardID) continue;

      yield {
        host: response.remoteAddress,
        printerType: PrinterType.ELEGOO_FDM_CC,
        name: parsed.Data.Name ?? "Unknown",
        model: parsed.Data.MachineName ?? "Unknown",
        mainboardId: parsed.Data.MainboardID,
        serialNumber: parsed.Data.MainboardID,
        firmwareVersion: parsed.Data.FirmwareVersion ?? "",
        authMode: "",
      };
    }
  }
}

function tryParse(raw: string): CcV1DiscoveryResponse | null {
  try {
    return JSON.parse(raw) as CcV1DiscoveryResponse;
  } catch {
    return null;
  }
}
