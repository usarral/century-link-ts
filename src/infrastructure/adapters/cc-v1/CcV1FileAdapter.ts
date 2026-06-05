import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { ok, err } from "../../../application/result/Result.js";
import { ElegooError } from "../../../application/result/ElegooError.js";
import { ErrorCode } from "../../../domain/types/ErrorCode.js";
import type { FileAdapter, FileListParams, FileDetailParams, FileUploadParams, ProgressCallback } from "../../../domain/ports/FileAdapter.js";
import type { FileDetail, FileListData } from "../../../domain/entities/FileInfo.js";
import type { PrintTaskListData } from "../../../domain/entities/PrintTask.js";
import type { Result } from "../../../application/result/Result.js";

// CC V1 HTTP upload: POST /uploadFile/upload with multipart form-data.
// Fields per chunk: Check, S-File-MD5, Offset, Uuid, TotalSize, File.
// Response: { "code": "000000" } on success, or { "messages": [{...}] } on error.

const CHUNK_SIZE = 1024 * 1024; // 1 MB — matches C++ SDK

export class CcV1FileAdapter implements FileAdapter {
  private readonly baseUrl: string;
  private activeUploadController: AbortController | null = null;

  constructor(host: string) {
    this.baseUrl = `http://${host}`;
  }

  async getFileList(_params?: FileListParams): Promise<Result<FileListData>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "File list not supported on CC V1"));
  }

  async getFileDetail(_params: FileDetailParams): Promise<Result<FileDetail>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "File detail not supported on CC V1"));
  }

  async upload(params: FileUploadParams, onProgress?: ProgressCallback): Promise<Result<void>> {
    const controller = new AbortController();
    this.activeUploadController = controller;
    try {
      const fileData = await readFile(params.localFilePath);
      const totalBytes = fileData.byteLength;
      const md5 = createHash("md5").update(fileData).digest("hex");
      const uuid = randomUUID();
      let uploadedBytes = 0;

      for (let offset = 0; offset < totalBytes; offset += CHUNK_SIZE) {
        if (controller.signal.aborted) {
          return err(new ElegooError(ErrorCode.OPERATION_CANCELLED, "Upload cancelled"));
        }

        const chunk = fileData.subarray(offset, offset + CHUNK_SIZE);

        const form = new FormData();
        form.append("Check", "1");
        form.append("S-File-MD5", md5);
        form.append("Offset", String(offset));
        form.append("Uuid", uuid);
        form.append("TotalSize", String(totalBytes));
        form.append("File", new Blob([chunk], { type: "application/octet-stream" }), params.fileName);

        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]);
        const response = await fetch(`${this.baseUrl}/uploadFile/upload`, {
          method: "POST",
          body: form,
          signal,
        });

        if (!response.ok) {
          return err(new ElegooError(ErrorCode.FILE_TRANSFER_FAILED, `Upload failed at offset ${offset}: HTTP ${response.status}`));
        }

        const body = (await response.json()) as { code?: string; messages?: Array<{ field?: string; message?: unknown }> };
        if (body.code !== "000000") {
          const detail = body.messages?.find((m) => m.field === "common_field")?.message;
          return err(new ElegooError(ErrorCode.FILE_TRANSFER_FAILED, `Upload rejected by printer: ${detail ?? body.code}`));
        }

        uploadedBytes += chunk.byteLength;
        if (onProgress) {
          const shouldContinue = onProgress(uploadedBytes, totalBytes);
          if (!shouldContinue) return err(new ElegooError(ErrorCode.OPERATION_CANCELLED, "Upload cancelled"));
        }
      }

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
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "Print task list not supported on CC V1"));
  }

  async deletePrintTasks(_taskIds: readonly string[]): Promise<Result<void>> {
    return err(new ElegooError(ErrorCode.OPERATION_NOT_IMPLEMENTED, "Delete print tasks not supported on CC V1"));
  }
}
