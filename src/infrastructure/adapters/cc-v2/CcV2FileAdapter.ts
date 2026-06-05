import { HttpClient } from "../../transport/http/HttpClient.js";
import { ok, err } from "../../../application/result/Result.js";
import { ElegooError } from "../../../application/result/ElegooError.js";
import { ErrorCode } from "../../../domain/types/ErrorCode.js";
import type { FileAdapter, FileListParams, FileDetailParams, FileUploadParams, ProgressCallback } from "../../../domain/ports/FileAdapter.js";
import type { FileDetail, FileListData, FilamentColorMapping } from "../../../domain/entities/FileInfo.js";
import type { PrintTaskListData, PrintTaskDetail } from "../../../domain/entities/PrintTask.js";
import type { Result } from "../../../application/result/Result.js";

interface RawFileDetail {
  file_name?: string;
  print_time?: number;
  layer?: number;
  layer_height?: number;
  thumbnail?: string;
  size?: number;
  create_time?: number;
  total_filament_used?: number;
  total_filament_used_length?: number;
  total_print_times?: number;
  last_print_time?: number;
  color_mapping?: Array<{ t?: number; color?: string; type?: string }>;
}

interface RawFileListResponse {
  data?: {
    records?: RawFileDetail[];
    total?: number;
    current?: number;
    size?: number;
  };
}

interface RawPrintTaskItem {
  task_id?: string;
  file_name?: string;
  print_time?: number;
  total_layer?: number;
  progress?: number;
  status?: number;
  created_at?: number;
  thumbnail_url?: string;
}

interface RawPrintTaskListResponse {
  data?: {
    records?: RawPrintTaskItem[];
    total?: number;
    current?: number;
    size?: number;
  };
}

export class CcV2FileAdapter implements FileAdapter {
  private readonly http: HttpClient;
  private activeUploadController: AbortController | null = null;

  constructor(host: string, token?: string) {
    this.http = new HttpClient({ baseUrl: `http://${host}`, token: token ?? undefined, timeoutMs: undefined });
  }

  async getFileList(params?: FileListParams): Promise<Result<FileListData>> {
    try {
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 50;
      const raw = await this.http.get<RawFileListResponse>(`/files?page=${page}&size=${pageSize}`);
      return ok({
        files: (raw.data?.records ?? []).map(mapFileDetail),
        total: raw.data?.total ?? 0,
        page: raw.data?.current ?? page,
        pageSize: raw.data?.size ?? pageSize,
      });
    } catch (cause) {
      return err(new ElegooError(ErrorCode.NETWORK_ERROR, "Failed to fetch file list", cause));
    }
  }

  async getFileDetail(params: FileDetailParams): Promise<Result<FileDetail>> {
    try {
      const raw = await this.http.get<{ data?: RawFileDetail }>(`/files/${encodeURIComponent(params.fileName)}`);
      if (!raw.data) return err(new ElegooError(ErrorCode.FILE_NOT_FOUND, `File not found: ${params.fileName}`));
      return ok(mapFileDetail(raw.data));
    } catch (cause) {
      return err(new ElegooError(ErrorCode.NETWORK_ERROR, "Failed to fetch file detail", cause));
    }
  }

  async upload(params: FileUploadParams, onProgress?: ProgressCallback): Promise<Result<void>> {
    const controller = new AbortController();
    this.activeUploadController = controller;
    try {
      await this.http.uploadFile({
        localFilePath: params.localFilePath,
        fileName: params.fileName,
        onProgress: onProgress ?? undefined,
        signal: controller.signal,
      });
      return ok(undefined);
    } catch (cause) {
      if (controller.signal.aborted) {
        return err(new ElegooError(ErrorCode.OPERATION_CANCELLED, "Upload cancelled"));
      }
      if (cause instanceof Error && cause.message === "Upload cancelled by caller") {
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

  async getPrintTaskList(page = 1, pageSize = 20): Promise<Result<PrintTaskListData>> {
    try {
      const raw = await this.http.get<RawPrintTaskListResponse>(`/print-tasks?page=${page}&size=${pageSize}`);
      const tasks: PrintTaskDetail[] = (raw.data?.records ?? []).map((t) => ({
        taskId: t.task_id ?? "",
        fileName: t.file_name ?? "",
        printTimeSeconds: t.print_time ?? 0,
        totalLayers: t.total_layer ?? 0,
        progress: t.progress ?? 0,
        status: t.status ?? 0,
        createdAt: t.created_at ?? 0,
        thumbnailUrl: t.thumbnail_url ?? "",
      }));
      return ok({
        tasks,
        total: raw.data?.total ?? 0,
        page: raw.data?.current ?? page,
        pageSize: raw.data?.size ?? pageSize,
      });
    } catch (cause) {
      return err(new ElegooError(ErrorCode.NETWORK_ERROR, "Failed to fetch print task list", cause));
    }
  }

  async deletePrintTasks(taskIds: readonly string[]): Promise<Result<void>> {
    try {
      await this.http.post("/print-tasks/delete", { task_ids: taskIds });
      return ok(undefined);
    } catch (cause) {
      return err(new ElegooError(ErrorCode.NETWORK_ERROR, "Failed to delete print tasks", cause));
    }
  }
}

function mapFileDetail(raw: RawFileDetail): FileDetail {
  return {
    fileName: raw.file_name ?? "",
    printTimeSeconds: raw.print_time ?? 0,
    layers: raw.layer ?? 0,
    layerHeightMm: raw.layer_height ?? 0,
    thumbnailUrl: raw.thumbnail ?? "",
    sizeBytes: raw.size ?? 0,
    createdAt: raw.create_time ?? 0,
    filamentUsedGrams: raw.total_filament_used ?? 0,
    filamentUsedMm: raw.total_filament_used_length ?? 0,
    totalPrintTimes: raw.total_print_times ?? 0,
    lastPrintAt: raw.last_print_time ?? 0,
    colorMapping: (raw.color_mapping ?? []).map(
      (m): FilamentColorMapping => ({ trayIndex: m.t ?? 0, color: m.color ?? "", type: m.type ?? "" }),
    ),
  };
}
