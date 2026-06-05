import { udpBroadcast } from "../../transport/udp/UdpSocket.js";
import { PrinterType } from "../../../domain/types/PrinterType.js";
import type { DiscoveryAdapter, DiscoveryParams } from "../../../domain/ports/DiscoveryAdapter.js";
import type { DiscoveredPrinter } from "../../../domain/entities/DiscoveredPrinter.js";

const DISCOVERY_PORT = 5353;
const DISCOVERY_MESSAGE = JSON.stringify({ id: 0, method: 7000 });

interface CcV2DiscoveryResult {
  host_name?: string;
  machine_model?: string;
  sn?: string;
  token_status?: number | boolean;
  lan_status?: number | boolean;
  firmware_version?: string;
}

interface CcV2DiscoveryResponse {
  id?: number;
  result?: CcV2DiscoveryResult;
}

export class CcV2DiscoveryAdapter implements DiscoveryAdapter {
  async *discover(params?: DiscoveryParams): AsyncIterable<DiscoveredPrinter> {
    const responses = await udpBroadcast({
      message: DISCOVERY_MESSAGE,
      port: DISCOVERY_PORT,
      timeoutMs: params?.timeoutMs ?? 5000,
    });

    for (const response of responses) {
      const parsed = tryParse(response.data.toString());
      if (!parsed?.result?.sn) continue;

      const result = parsed.result;
      const hasAccessCode = result.token_status === 1 || result.token_status === true;

      yield {
        host: response.remoteAddress,
        printerType: PrinterType.ELEGOO_FDM_CC2,
        brand: "Elegoo",
        name: result.host_name ?? "Unknown",
        model: result.machine_model ?? "Unknown",
        mainboardId: result.sn ?? "",
        serialNumber: result.sn ?? "",
        firmwareVersion: result.firmware_version ?? "",
        authMode: hasAccessCode ? "accessCode" : "",
        webUrl: `http://${response.remoteAddress}`,
      };
    }
  }
}

function tryParse(raw: string): CcV2DiscoveryResponse | null {
  try {
    return JSON.parse(raw) as CcV2DiscoveryResponse;
  } catch {
    return null;
  }
}
