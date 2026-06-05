export interface PrintTaskDetail {
  readonly taskId: string;
  readonly fileName: string;
  readonly printTimeSeconds: number;
  readonly totalLayers: number;
  readonly progress: number;
  readonly status: number;
  readonly createdAt: number;
  readonly thumbnailUrl: string;
}

export interface PrintTaskListData {
  readonly tasks: readonly PrintTaskDetail[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
