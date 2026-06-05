import type { FileAdapter, FileListParams } from "../../domain/ports/FileAdapter.js";
import type { FileListData } from "../../domain/entities/FileInfo.js";
import type { Result } from "../result/Result.js";

export class GetFileListUseCase {
  constructor(private readonly adapter: FileAdapter) {}

  execute(params?: FileListParams): Promise<Result<FileListData>> {
    return this.adapter.getFileList(params);
  }
}
