export interface Temperature {
  readonly current: number;
  readonly target: number;
  readonly min: number;
  readonly max: number;
}

export function temperature(
  current: number,
  target: number,
  min = 0,
  max = 300,
): Temperature {
  return { current, target, min, max };
}
