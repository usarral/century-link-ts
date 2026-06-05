# century-link-ts

An **unofficial**, community-written TypeScript library for communicating with Elegoo 3D printers over a local area network (LAN).

> **This project is not affiliated with, endorsed by, or connected to Elegoo Inc. in any way.**
> See the [Disclaimer](#disclaimer) section for full details.

---

## What this is

`century-link-ts` is an independent, open-source implementation of the LAN communication protocol used by Elegoo FDM printers (CC and CC2 series). It was built by reverse-engineering the publicly available [elegoo-link](https://github.com/elegooofficial/ElegooLink) C++ SDK and translating the protocol into a clean TypeScript library.

It does **not** use, bundle, or redistribute any proprietary code, firmware, or assets from Elegoo.

### Supported printers

| Protocol | Transport | Printers | Tested |
|----------|-----------|----------|--------|
| Elegoo FDM CC (V1) | WebSocket · port 3030 | Neptune 4, Centauri Carbon | — |
| Elegoo FDM CC2 (V2) | MQTT · port 1883 | Centauri Carbon 2, OrangeStorm Giga | ✅ Centauri Carbon 2 |
| Moonraker / Klipper | HTTP + WebSocket | Any Klipper printer with Moonraker | — |

Cloud features (OAuth, Agora RTM) are out of scope — LAN only.

> **Tested hardware:** The CC2 protocol has been verified against a real **Elegoo Centauri Carbon 2** on a local network. CC (V1) and Klipper support are implemented based on the elegoo-link C++ SDK and Moonraker API respectively, but have not been tested against physical hardware.
>
> **Have a different printer?** If you try this library with another Elegoo model (or any Klipper printer) and it works — or doesn't — please [open an issue](../../issues) or leave a comment. Confirmed working machines will be added to the table above.

---

## Installation

```bash
npm install century-link-ts
# or
pnpm add century-link-ts
```

Requires **Node.js ≥ 18**.

---

## Quick start

```typescript
import { CenturyLink, PrinterType } from "century-link-ts";

const link = new CenturyLink();

// Discover printers on the local network
for await (const printer of link.discover({ timeoutMs: 5000 })) {
  console.log(printer.model, printer.host);
}

// Connect
const result = await link.connect({
  host: "192.168.1.100",
  printerType: PrinterType.ELEGOO_FDM_CC2,
  model: "Centauri Carbon 2",
});

if (!result.ok) {
  console.error(result.error.message);
  process.exit(1);
}

const printer = result.value;

// Subscribe to live status
printer.onStatus((status) => {
  console.log(status.printer.state, `${status.printer.progress}%`);
});

// Upload and print
await printer.uploadFile({ localFilePath: "./model.gcode", fileName: "model.gcode", storageLocation: "local" });
await printer.startPrint({ fileName: "model.gcode", storageLocation: "local" });

// Later
await printer.disconnect();
```

---

## API reference

### `CenturyLink`

| Method | Returns | Description |
|--------|---------|-------------|
| `discover(params?)` | `AsyncIterable<DiscoveredPrinter>` | UDP broadcast discovery on the LAN |
| `connect(params)` | `Promise<Result<ConnectedPrinter>>` | Connect to a printer by IP |

### `ConnectedPrinter`

| Method | Description |
|--------|-------------|
| `getStatus(timeoutMs?)` | Poll current printer status |
| `startPrint(params)` | Start a print job |
| `pausePrint()` | Pause the active print |
| `resumePrint()` | Resume a paused print |
| `stopPrint()` | Stop the active print |
| `uploadFile(params, onProgress?)` | Upload a file (CC2 only) |
| `getFiles(page?, pageSize?)` | List files on the printer |
| `onStatus(handler)` | Subscribe to live status push events |
| `onConnection(handler)` | Subscribe to connection state changes |
| `disconnect()` | Close the connection |

### `Result<T>`

All async operations return `Result<T>` — a discriminated union with no thrown exceptions:

```typescript
const result = await printer.getStatus();

if (result.ok) {
  console.log(result.value.printer.state);
} else {
  console.error(result.error.code, result.error.message);
}
```

---

## Architecture

The library follows **Hexagonal Architecture** (ports & adapters):

```
src/
  domain/          ← entities, value objects, port interfaces, events
  application/     ← Result<T>, ElegooError, use cases
  infrastructure/  ← WebSocket/MQTT/UDP/HTTP transports, printer adapters
  CenturyLink.ts   ← public facade
```

The domain layer has zero runtime dependencies and no knowledge of any transport protocol. Adapters implement the `PrinterAdapter` port and can be swapped or extended independently.

---

## Development

```bash
pnpm install
pnpm typecheck   # TypeScript type check
pnpm test        # Run unit tests (vitest)
pnpm build       # Compile to dist/
```

---

## Disclaimer

**century-link-ts is an independent, unofficial project.**

- This library is **not** produced by, affiliated with, endorsed by, or in any way connected to **Elegoo Inc.** or any of its subsidiaries.
- "Elegoo", "Neptune", "Centauri Carbon", "OrangeStorm", and related product names are **trademarks of Elegoo Inc.** Their use here is solely for descriptive purposes (nominative fair use) to identify the hardware this library is designed to communicate with.
- This project was built by analyzing the publicly available [elegoo-link](https://github.com/elegooofficial/ElegooLink) open-source C++ SDK. No proprietary code, firmware, binaries, or trade secrets were used.
- The communication protocol implemented here is derived from public documentation and open-source reference implementations.
- Use of this library is **entirely at your own risk**. The author(s) accept no responsibility for damage to hardware, failed prints, voided warranties, or any other consequences arising from its use. This includes, but is not limited to, unintended movements, temperature changes, or any other commands sent to the printer.
- This library does not circumvent any access control or security mechanism. It communicates over the same local network protocol the official applications use.

If you are a representative of Elegoo Inc. and have concerns about this project, please open an issue or contact the maintainer directly before taking any action — this project exists to benefit the maker community and is maintained in good faith.

---

## License

MIT © [usarral](https://github.com/usarral)

This project is independent and unaffiliated with Elegoo Inc.
