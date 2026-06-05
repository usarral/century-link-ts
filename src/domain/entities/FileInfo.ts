export interface FilamentColorMapping {
  readonly trayIndex: number;
  readonly color: string;
  readonly type: string;
}

export interface FileDetail {
  readonly fileName: string;
  readonly printTimeSeconds: number;
  readonly layers: number;
  readonly layerHeightMm: number;
  readonly thumbnailUrl: string;
  readonly sizeBytes: number;
  readonly createdAt: number;
  readonly filamentUsedGrams: number;
  readonly filamentUsedMm: number;
  readonly totalPrintTimes: number;
  readonly lastPrintAt: number;
  readonly colorMapping: readonly FilamentColorMapping[];
}

export interface FileListData {
  readonly files: readonly FileDetail[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
