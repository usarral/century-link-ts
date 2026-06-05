export interface Progress {
  readonly percentage: number;
  readonly currentLayer: number;
  readonly totalLayers: number;
  readonly elapsedSeconds: number;
  readonly remainingSeconds: number;
}

export function progress(
  percentage: number,
  currentLayer: number,
  totalLayers: number,
  elapsedSeconds: number,
  remainingSeconds: number,
): Progress {
  return { percentage, currentLayer, totalLayers, elapsedSeconds, remainingSeconds };
}
