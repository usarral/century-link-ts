import { createSocket } from "dgram";

export interface UdpResponse {
  readonly data: Buffer;
  readonly remoteAddress: string;
  readonly remotePort: number;
}

export interface UdpBroadcastParams {
  readonly message: string | Buffer;
  readonly port: number;
  readonly timeoutMs?: number;
  readonly listenPort?: number;
}

export async function udpBroadcast(params: UdpBroadcastParams): Promise<UdpResponse[]> {
  const { message, port, timeoutMs = 5000, listenPort } = params;
  const responses: UdpResponse[] = [];

  return new Promise((resolve, reject) => {
    const socket = createSocket("udp4");

    const finish = () => {
      socket.close();
      resolve(responses);
    };

    const timer = setTimeout(finish, timeoutMs);

    socket.on("error", (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });

    socket.on("message", (data, rinfo) => {
      responses.push({
        data,
        remoteAddress: rinfo.address,
        remotePort: rinfo.port,
      });
    });

    socket.bind(listenPort ?? 0, () => {
      socket.setBroadcast(true);
      const payload = typeof message === "string" ? Buffer.from(message) : message;
      socket.send(payload, port, "255.255.255.255", (err) => {
        if (err) {
          clearTimeout(timer);
          socket.close();
          reject(err);
        }
      });
    });
  });
}
