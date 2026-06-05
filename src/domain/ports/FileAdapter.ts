import type { FileDetail, FileListData } from "../entities/FileInfo.js";
import type { PrintTaskListData } from "../entities/PrintTask.js";
import type { Result } from "../../application/result/Result.js";

export type ProgressCallback = (uploaded: number, total: number) => boolean;

export interface FileListParams {
  readonly page: number | undefined;
  readonly pageSize: number | undefined;
}

export interface FileDetailParams {
  readonly fileName: string;
}

export interface FileUploadParams {
  readonly localFilePath: string;
  readonly fileName: string;
  readonly storageLocation: string;
  readonly overwrite?: boolean;
}

export interface FileAdapter {
  getFileList(params?: FileListParams): Promise<Result<FileListData>>;
  getFileDetail(params: FileDetailParams): Promise<Result<FileDetail>>;
  upload(params: FileUploadParams, onProgress?: ProgressCallback): Promise<Result<void>>;
  getPrintTaskList(page?: number, pageSize?: number): Promise<Result<PrintTaskListData>>;
  deletePrintTasks(taskIds: readonly string[]): Promise<Result<void>>;
}
