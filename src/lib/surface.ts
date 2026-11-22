// Continuous surfaces pre-computed by scripts/lib/surface.mjs: a Uint16 grid per metric, coloured here
// with the same colour stops as the areas, so both views share one scale.
import { RAMP } from './colors';

export interface SurfaceGrid {
  cols: number;
  rows: number;
  corners: [[number, number], [number, number], [number, number], [number, number]];
  bandwidthKm: number;
  metrics: Record<string, { min: number; max: number }>;
}

export interface Surface {
  key: string;
  grid: SurfaceGrid;
  values: Uint16Array;
  min: number;
  max: number;
}

const NODATA = 65535;
let gridPromise: Promise<SurfaceGrid> | null = null;

export function loadGrid() {
  gridPromise ??= fetch('data/surface/grid.json').then(r => r.json());
  return gridPromise;
}

export async function loadSurface(key: string): Promise<Surface | null> {
  const grid = await loadGrid();
  const range = grid.metrics[key];
  if (!range) return null;
  const { uint16le } = await fetch(`data/surface/${key}.json`).then(r => r.json());
  const bytes = Uint8Array.from(atob(uint16le), ch => ch.charCodeAt(0));
  return { key, grid, values: new Uint16Array(bytes.buffer), ...range };
}

const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

/** PNG data URL of the surface coloured by the stops (one value per RAMP colour). */
export function renderSurface(s: Surface, stops: number[]): string {
  const { cols, rows } = s.grid;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cols, rows);
  const colors = RAMP.slice(0, stops.length).map(hex);
  // Lookup table over the quantised range.
  const LUT = 1024;
  const lut = new Uint8ClampedArray(LUT * 3);
  for (let i = 0; i < LUT; i++) {
    const v = s.min + (i / (LUT - 1)) * (s.max - s.min);
    let k = 0;
    while (k < stops.length - 2 && v > stops[k + 1]) k++;
    const t = stops.length < 2 ? 0 : Math.max(0, Math.min(1, (v - stops[k]) / (stops[k + 1] - stops[k] || 1)));
    const a = colors[k] ?? colors[0], b = colors[k + 1] ?? a;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = a[c] + (b[c] - a[c]) * t;
  }
  for (let i = 0; i < s.values.length; i++) {
    const q = s.values[i];
    if (q === NODATA) continue;
    const l = Math.round((q / (NODATA - 1)) * (LUT - 1)) * 3;
    img.data[i * 4] = lut[l]; img.data[i * 4 + 1] = lut[l + 1]; img.data[i * 4 + 2] = lut[l + 2]; img.data[i * 4 + 3] = 235;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Interpolated value at a point, or null outside the grid. */
export function valueAt(s: Surface, lng: number, lat: number): number | null {
  const [[w, n], [e], [, south]] = s.grid.corners;
  const merc = (la: number) => Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360));
  const c = Math.floor(((lng - w) / (e - w)) * s.grid.cols);
  const r = Math.floor(((merc(n) - merc(lat)) / (merc(n) - merc(south))) * s.grid.rows);
  if (c < 0 || r < 0 || c >= s.grid.cols || r >= s.grid.rows) return null;
  const q = s.values[r * s.grid.cols + c];
  return q === NODATA ? null : s.min + (q / (NODATA - 1)) * (s.max - s.min);
}
