// Sequential single-hue ramp (light → dark = low → high), 7 classes.
export const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
export const NO_DATA = '#e9e8e4';

/** Quantile class breaks (RAMP.length - 1 inner breaks), rounded to readable numbers. */
export function quantileBreaks(values: number[]): number[] {
  const xs = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length < 2) return [];
  const n = RAMP.length;
  const out: number[] = [];
  for (let i = 1; i < n; i++) {
    const v = nice(xs[Math.floor((i / n) * (xs.length - 1))], xs[xs.length - 1] - xs[0]);
    if (!out.length || v > out[out.length - 1]) out.push(v);
  }
  return out;
}

function nice(v: number, range: number) {
  const step = range > 2000 ? 50 : range > 200 ? 10 : range > 20 ? 1 : 0.1;
  return Math.round(v / step) * step;
}

/** MapLibre expression: step(value, c0, b1, c1, …) with a no-data fallback. */
export function fillExpression(key: string, breaks: number[]): unknown {
  if (!breaks.length) return ['case', ['has', key], RAMP[3], NO_DATA];
  const step: unknown[] = ['step', ['get', key], RAMP[0]];
  breaks.forEach((b, i) => step.push(b, RAMP[Math.min(i + 1, RAMP.length - 1)]));
  return ['case', ['has', key], step, NO_DATA];
}
