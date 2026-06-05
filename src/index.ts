export { CenturyLink } from "./CenturyLink.js";
export type { ConnectedPrinter } from "./CenturyLink.js";

// Domain types
export { PrinterState } from "./domain/types/PrinterState.js";
export { PrinterSubState } from "./domain/types/PrinterSubState.js";
export { PrinterType } from "./domain/types/PrinterType.js";
export { ErrorCode } from "./domain/types/ErrorCode.js";

// Entities
export type { PrinterInfo } from "./domain/entities/PrinterInfo.js";
export type { PrinterStatusData, PrinterCoreStatus, PrintJobStatus, TemperatureStatus, FanStatus, CanvasStatus, CanvasInfo, TrayInfo, PrinterException, ExternalDeviceStatus } from "./domain/entities/PrinterStatus.js";
export type { PrinterAttributes, PrinterCapabilities, FanComponent, TemperatureComponent, StorageComponent, LightComponent } from "./domain/entities/PrinterAttributes.js";
export type { FileDetail, FileListData, FilamentColorMapping } from "./domain/entities/FileInfo.js";
export type { PrintTaskDetail, PrintTaskListData } from "./domain/entities/PrintTask.js";
export type { DiscoveredPrinter } from "./domain/entities/DiscoveredPrinter.js";

// Ports (params / callback types)
export type { ConnectParams, StartPrintParams, SlotMapItem, FileDownloadTriggerParams, Unsubscribe } from "./domain/ports/PrinterAdapter.js";
export type { DiscoveryParams } from "./domain/ports/DiscoveryAdapter.js";
export type { FileUploadParams, FileDetailParams, FileListParams, ProgressCallback } from "./domain/ports/FileAdapter.js";

// Result
export { ok, err, mapResult } from "./application/result/Result.js";
export type { Result } from "./application/result/Result.js";
export { ElegooError } from "./application/result/ElegooError.js";
