import { ok, err } from "../../../application/result/Result.js";
import { ElegooError } from "../../../application/result/ElegooError.js";
import { ErrorCode } from "../../../domain/types/ErrorCode.js";
import { readFile } from "fs/promises";
import type { FileAdapter, FileListParams, FileDetailParams, FileUploadParams, ProgressCallback } from "../../../domain/ports/FileAdapter.js";
import type { FileDetail, FileListData } from "../../../domain/entities/FileInfo.js";
import type { PrintTaskListData } from "../../../domain/entities/PrintTask.js";
import type { Result } from "../../../application/result/Result.js";

interface MoonrakerFileEntry {
  path?: string;
  size?: number;
  modified?: number;
  permissions?: string;
}

interface MoonrakerMetadata {
  filename?: string;
  size?: number;
  modified?: number;
  layer_count?: number;
  layer_height?: number;
  filament_total?: number;
  filament_weight_total?: number;
  estimated_time?: number;
  thumbnails?: Array<{ width?: number; height?: number; relative_url?: string }>;
}

export class MoonrakerFileAdapter implements FileAdapter {
  private readonly baseUrl: string;
  private activeUploadController: AbortController | null = null;

  constructor(host: string, port = 7125) {
    this.baseUrl = `http://${host}:${port}`;
  }

  async getFileList(params?: FileListParams): Promise<Result<FileListData>> {
    try {
      const response = await fetch(`${this.baseUrl}/server/files/list?root=gcodes`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { result?: MoonrakerFileEntry[] };
      const entries = data.result ?? [];

      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 50;
      const start = (page - 1) * pageSize;
      const slice = entries.slice(start, start + pageSize);

      return ok({
        files: slice.map(mapEntry),
        total: entries.length,
        page,
        pageSize,
      });
    } catch (cause) {
      return err(new ElegooError(ErrorCode.NETWORK_ERROR, "Failed to fetch file list from Moonraker", cause));
    }
  }

  async getFileDetail(params: FileDetailParams): Promise<Result<FileDetail>> {
    try {
      const encoded = encodeURIComponent(params.fileName);
      const response = await fetch(`${this.baseUrl}/server/files/metadata?filename=${encoded}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        if (response.status === 404) return err(new ElegooError(ErrorCode.FILE_NOT_FOUND, `File not found: ${params.fileName}`));
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as { result?: MoonrakerMetadata };
      if (!data.result) return err(new ElegooError(ErrorCode.FILE_NOT_FOUND, `File not found: ${params.fileName}`));
      return ok(mapMetadata(data.result));
    } catch (cause) {
      if (cause instanceof ElegooError) return err(cause);
      return err(new ElegooError(ErrorCode.NETWORK_ERROR, "Failed to fetch file metadata from Moonraker", cause));
    }
  }

  async upload(params: FileUploadParams, onProgress?: ProgressCallback): Promise<Result<void>> {
    const controller = new AbortController();
    this.activeUploadController = controller;
    try {
      const fileData = await readFile(params.localFilePath);
      const totalBytes = fileData.byteLength;

      const form = new FormData();
      form.append("root", params.storageLocation || "gcodes");
      form.append("file", new Blob([fileData]), params.fileName);

      if (onProgress) {
        const shouldContinue = onProgress(0, totalBytes);
        if (!shouldContinue) return err(new ElegooError(ErrorCode.OPERATION_CANCELLED, "Upload cancelled"));
      }

      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(300_000)]);
      const response = await fetch(`${this.baseUrl}/server/files/upload`, {
        method: "POST",
        body: form,
        signal,
      });

      if (!response.ok) throw new Error(`Upload failed: HTTP ${response.status}`);

      if (onProgress) onProgress(totalBytes, totalBytes);
      return ok(undefined);
    } catch (cause) {
      if (controller.signal.aborted) {
        return err(new ElegooError(ErrorCode.OPERATION_CANCELLED, "Upload cancelled"));
      }
      return err(new ElegooError(ErrorCode.FILE_TRANSFER_FAILED, "Upload failed", cause));
    } finally {
      this.activeUploadController = null;
    }
  }

  async cancelUpload(): Promise<Result<void>> {
    this.activeUploadController?.abort();
    return ok(undefined);
  }

  async getPrintTaskList(_page?: number, _pageSize?: number): Promise<Result<PrintTaskListData>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "Print task history not supported on Moonraker"));
  }

  async deletePrintTasks(_taskIds: readonly string[]): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "deletePrintTasks not supported on Moonraker"));
  }
}

function mapEntry(entry: MoonrakerFileEntry): FileDetail {
  return {
    fileName: entry.path ?? "",
    printTimeSeconds: 0,
    layers: 0,
    layerHeightMm: 0,
    thumbnailUrl: "",
    sizeBytes: entry.size ?? 0,
    createdAt: entry.modified ? Math.round(entry.modified) : 0,
    filamentUsedGrams: 0,
    filamentUsedMm: 0,
    totalPrintTimes: 0,
    lastPrintAt: 0,
    colorMapping: [],
  };
}

function mapMetadata(meta: MoonrakerMetadata): FileDetail {
  const thumbnail = (meta.thumbnails ?? []).find((t) => (t.width ?? 0) >= 32);
  return {
    fileName: meta.filename ?? "",
    printTimeSeconds: Math.round(meta.estimated_time ?? 0),
    layers: meta.layer_count ?? 0,
    layerHeightMm: meta.layer_height ?? 0,
    thumbnailUrl: thumbnail?.relative_url ?? "",
    sizeBytes: meta.size ?? 0,
    createdAt: meta.modified ? Math.round(meta.modified) : 0,
    filamentUsedGrams: meta.filament_weight_total ?? 0,
    filamentUsedMm: meta.filament_total ?? 0,
    totalPrintTimes: 0,
    lastPrintAt: 0,
    colorMapping: [],
  };
}
