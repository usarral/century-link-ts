/**
 * CC2 read-test example
 *
 * Connects to an Elegoo CC2 printer and runs every available read operation,
 * printing each result to stdout. No files are uploaded, no prints are started.
 *
 * Setup:
 *   cp .env.example .env          # fill in your printer values
 *   pnpm install
 *   pnpm start
 */

import "dotenv/config";
import { CenturyLink, PrinterType } from "../../src/index.js";
import type { ConnectedPrinter, DiscoveredPrinter } from "../../src/index.js";

// ─── config ───────────────────────────────────────────────────────────────────

const host = process.env["PRINTER_HOST"];
const model = process.env["PRINTER_MODEL"];
const accessCode = process.env["PRINTER_ACCESS_CODE"] ?? "";
const serial = process.env["PRINTER_SERIAL"];

if (!host) {
  console.error("Missing PRINTER_HOST in .env — copy .env.example to .env and fill in your printer's values.");
  process.exit(1);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function print(label: string, value: unknown) {
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

async function waitForEvent<T>(
  subscribe: (handler: (value: T) => void) => () => void,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`Event not received within ${timeoutMs}ms`));
    }, timeoutMs);
    const unsub = subscribe((value) => {
      clearTimeout(timer);
      unsub();
      resolve(value);
    });
  });
}

// ─── auto-discover to get serial + model if not configured ────────────────────

async function discoverPrinter(sdk: CenturyLink, targetHost: string): Promise<DiscoveredPrinter | undefined> {
  console.log(`Running LAN discovery to find printer at ${targetHost}…`);
  const timeoutMs = 8000;
  const deadline = Date.now() + timeoutMs;

  for await (const discovered of sdk.discover({ timeoutMs })) {
    if (discovered.host === targetHost) {
      return discovered;
    }
    if (Date.now() > deadline) break;
  }
  return undefined;
}

// ─── read tests ───────────────────────────────────────────────────────────────

async function runTests(printer: ConnectedPrinter) {
  // 1. Printer info (available immediately after connect)
  section("1. Printer Info");
  print("info", printer.info);

  // 2. Attributes (static capabilities)
  section("2. Printer Attributes — getAttributes()");
  const attrResult = await printer.getAttributes();
  if (attrResult.ok) print("attributes", attrResult.value);
  else console.error("ERROR:", attrResult.error.message);

  // 3. Current status (synchronous MQTT request)
  section("3. Printer Status — getStatus()");
  const statusResult = await printer.getStatus();
  if (statusResult.ok) print("status", statusResult.value);
  else console.error("ERROR:", statusResult.error.message);

  // 4. Raw status JSON
  section("4. Raw Status JSON — getStatusRaw()");
  const rawResult = await printer.getStatusRaw();
  if (rawResult.ok) {
    try {
      print("status_raw", JSON.parse(rawResult.value));
    } catch {
      console.log(rawResult.value);
    }
  } else {
    console.error("ERROR:", rawResult.error.message);
  }

  // 5. Canvas / multi-filament status
  section("5. Canvas / Filament Status — getCanvasStatus()");
  const canvasResult = await printer.getCanvasStatus();
  if (canvasResult.ok) print("canvas", canvasResult.value);
  else console.error("ERROR:", canvasResult.error.message);

  // 6. File list
  section("6. File List — getFiles(page=1, pageSize=20)");
  const filesResult = await printer.getFiles(1, 20);
  if (filesResult.ok) {
    print("files", filesResult.value);

    // 7. File detail for the first file found
    const firstFile = filesResult.value.files[0];
    if (firstFile) {
      section(`7. File Detail — getFileDetail("${firstFile.fileName}")`);
      const detailResult = await printer.getFileDetail({ fileName: firstFile.fileName });
      if (detailResult.ok) print("file_detail", detailResult.value);
      else console.error("ERROR:", detailResult.error.message);
    } else {
      section("7. File Detail — skipped (no files found on printer)");
    }
  } else {
    console.error("ERROR:", filesResult.error.message);
    section("7. File Detail — skipped (file list failed)");
  }

  // 8. Print task list (job history)
  section("8. Print Task List — getPrintTaskList(page=1, pageSize=10)");
  const tasksResult = await printer.getPrintTaskList(1, 10);
  if (tasksResult.ok) print("print_tasks", tasksResult.value);
  else console.error("ERROR:", tasksResult.error.message);

  // 9. Async status push (trigger + wait for event)
  section("9. Async Status Push — refreshPrinterStatus() + onStatus event");
  try {
    const eventPromise = waitForEvent<Parameters<Parameters<ConnectedPrinter["onStatus"]>[0]>[0]>(
      (h) => printer.onStatus(h),
    );
    await printer.refreshPrinterStatus();
    print("pushed_status (via event)", await eventPromise);
  } catch (e) {
    console.error("Failed:", (e as Error).message);
  }

  // 10. Async attributes push (trigger + wait for event)
  section("10. Async Attributes Push — refreshPrinterAttributes() + onAttributes event");
  try {
    const eventPromise = waitForEvent<Parameters<Parameters<ConnectedPrinter["onAttributes"]>[0]>[0]>(
      (h) => printer.onAttributes(h),
    );
    await printer.refreshPrinterAttributes();
    print("pushed_attributes (via event)", await eventPromise);
  } catch (e) {
    console.error("Failed:", (e as Error).message);
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const sdk = new CenturyLink();

  let resolvedSerial = serial;
  let resolvedModel = model;

  // Auto-discover if serial or model are not in .env
  if (!resolvedSerial || !resolvedModel) {
    const discovered = await discoverPrinter(sdk, host!);
    if (discovered) {
      resolvedSerial ??= discovered.serialNumber;
      resolvedModel ??= discovered.model;
      console.log(`Discovered: ${discovered.model} — serial ${discovered.serialNumber}`);
    } else {
      console.warn(`Could not discover printer at ${host}. Connecting without serial number (some features may not work).`);
    }
  }

  console.log(`\nConnecting to ${resolvedModel ?? "CC2 Printer"} at ${host}…`);

  const connectResult = await sdk.connect({
    host: host!,
    model: resolvedModel ?? "CC2 Printer",
    serialNumber: resolvedSerial,
    accessCode: accessCode || undefined,
    authMode: accessCode ? "accessCode" : "",
    printerType: PrinterType.ELEGOO_FDM_CC2,
    connectionTimeoutMs: 10_000,
    autoReconnect: false,
  });

  if (!connectResult.ok) {
    console.error("Connection failed:", connectResult.error.message);
    process.exit(1);
  }

  const printer = connectResult.value;
  console.log(`Connected!  Printer ID: ${printer.info.printerId}`);

  try {
    await runTests(printer);
  } finally {
    section("Done — disconnecting");
    await printer.disconnect();
    console.log("Disconnected.");
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
