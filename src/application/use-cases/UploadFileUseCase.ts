import type { FileAdapter, FileUploadParams, ProgressCallback } from "../../domain/ports/FileAdapter.js";
import type { Result } from "../result/Result.js";

export class UploadFileUseCase {
  constructor(private readonly adapter: FileAdapter) {}

  execute(params: FileUploadParams, onProgress?: ProgressCallback): Promise<Result<void>> {
    return this.adapter.upload(params, onProgress);
  }
}
