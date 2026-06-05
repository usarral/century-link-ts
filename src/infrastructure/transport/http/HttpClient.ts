import { createHash } from "crypto";
import { readFile } from "fs/promises";
import type { ProgressCallback } from "../../../domain/ports/FileAdapter.js";

const CHUNK_SIZE = 1024 * 1024;

export interface HttpClientOptions {
  readonly baseUrl: string;
  readonly token: string | undefined;
  readonly timeoutMs: number | undefined;
}

export interface UploadOptions {
  readonly localFilePath: string;
  readonly fileName: string;
  readonly onProgress: ProgressCallback | undefined;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token ?? "";
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
    return response.json() as Promise<T>;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
    return response.json() as Promise<T>;
  }

  async uploadFile(opts: UploadOptions): Promise<void> {
    const fileData = await readFile(opts.localFilePath);
    const md5 = createHash("md5").update(fileData).digest("hex");
    const totalBytes = fileData.byteLength;
    let uploadedBytes = 0;

    for (let offset = 0; offset < totalBytes; offset += CHUNK_SIZE) {
      const chunk = fileData.subarray(offset, offset + CHUNK_SIZE);

      const response = await fetch(`${this.baseUrl}/upload`, {
        method: "PUT",
        headers: {
          ...this.headers(),
          "Content-Type": "application/octet-stream",
          "X-File-Md5": md5,
          "X-File-Name": opts.fileName,
          "X-Offset": String(offset),
          "X-Total-Size": String(totalBytes),
        },
        body: chunk,
        signal: AbortSignal.timeout(180_000),
      });

      if (!response.ok) throw new Error(`Upload failed at offset ${offset}: HTTP ${response.status}`);

      uploadedBytes += chunk.byteLength;
      if (opts.onProgress) {
        const shouldContinue = opts.onProgress(uploadedBytes, totalBytes);
        if (!shouldContinue) throw new Error("Upload cancelled by caller");
      }
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.token) h["X-Token"] = this.token;
    return h;
  }
}
