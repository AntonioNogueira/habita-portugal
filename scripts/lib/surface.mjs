// Continuous surface ("heatmap") of a metric: a ~1 km grid interpolated from freguesia points with a
// Gaussian kernel. Freguesias with a published INE value weigh fully; the others carry their concelho's
// value with a lower weight, so local detail shows where it exists and the concelho level elsewhere.
// Rows are evenly spaced in Web Mercator, so the grid lines up exactly as a MapLibre image source.
import fs from 'node:fs';
import path from 'node:path';

const COLS = 320;
const BANDWIDTH_KM = 3;      // kernel σ
const INHERITED_WEIGHT = 0.35;
const NODATA = 65535;

const mercY = lat => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 180 / 2));
const latFromMercY = y => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

function polygons(geom) {
  return geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
}
function bboxOf(geom) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const poly of polygons(geom)) for (const [x, y] of poly[0]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inGeom(x, y, geom) {
  return polygons(geom).some(poly => inRing(x, y, poly[0]) && !poly.slice(1).some(h => inRing(x, y, h)));
}
/** Area-weighted centroid of the largest polygon. */
function centroid(geom) {
  let best = null, bestA = -1;
  for (const poly of polygons(geom)) {
    const r = poly[0];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
    }
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = a ? [cx / (3 * a), cy / (3 * a)] : r[0]; }
  }
  return best;
}

/**
 * Writes public/data/surface/<metric>.bin (Uint16 per cell, row 0 = north, 65535 = outside / no data)
 * and public/data/surface/grid.json (size, corners, value range per metric).
 */
export function writeSurfaces(outDir, concelhos, freguesias, metrics) {
  const areas = concelhos.features.map(f => ({ props: f.properties, geom: f.geometry, bbox: bboxOf(f.geometry) }));
  const [w, s, e, n] = areas.reduce((b, a) => [Math.min(b[0], a.bbox[0]), Math.min(b[1], a.bbox[1]), Math.max(b[2], a.bbox[2]), Math.max(b[3], a.bbox[3])], [180, 90, -180, -90]);
  const dxDeg = (e - w) / COLS;
  const dxRad = (dxDeg * Math.PI) / 180;
  const yTop = mercY(n), yBottom = mercY(s);
  const ROWS = Math.ceil((yTop - yBottom) / dxRad);
  const south = latFromMercY(yTop - ROWS * dxRad);

  // Which concelho each cell centre falls in (-1 = outside Portugal).
  const owner = new Int16Array(COLS * ROWS).fill(-1);
  const cellLat = new Float64Array(ROWS);
  for (let r = 0; r < ROWS; r++) cellLat[r] = latFromMercY(yTop - (r + 0.5) * dxRad);
  for (let r = 0; r < ROWS; r++) {
    const lat = cellLat[r];
    for (let c = 0; c < COLS; c++) {
      const lon = w + (c + 0.5) * dxDeg;
      for (let i = 0; i < areas.length; i++) {
        const b = areas[i].bbox;
        if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
        if (inGeom(lon, lat, areas[i].geom)) { owner[r * COLS + c] = i; break; }
      }
    }
  }
  const concelhoById = new Map(concelhos.features.map(f => [f.properties.id, f.properties]));
  const fregCentroids = freguesias.features.map(f => ({ p: f.properties, xy: centroid(f.geometry) }));

  const kmPerDegLat = 111.32;
  const sigma2 = 2 * BANDWIDTH_KM * BANDWIDTH_KM;
  const reach = BANDWIDTH_KM * 3;
  const BUCKET = 0.1;
  fs.mkdirSync(outDir, { recursive: true });
  const grid = { cols: COLS, rows: ROWS, corners: [[w, n], [e, n], [e, south], [w, south]], bandwidthKm: BANDWIDTH_KM, metrics: {} };

  for (const key of metrics) {
    // Points: published freguesia value, or the concelho's with a lower weight.
    const pts = [];
    for (const { p, xy } of fregCentroids) {
      const own = p[key];
      const inherited = concelhoById.get(p.parent)?.[key];
      if (typeof own === 'number' && !(key === 'preco_familia_m2' && p.familia_estimada && typeof inherited === 'number')) pts.push([xy[0], xy[1], own, 1]);
      else if (typeof inherited === 'number') pts.push([xy[0], xy[1], inherited, INHERITED_WEIGHT]);
    }
    if (pts.length < 10) continue;
    const buckets = new Map();
    for (const pt of pts) {
      const k = `${Math.floor(pt[0] / BUCKET)},${Math.floor(pt[1] / BUCKET)}`;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(pt);
    }
    const vals = new Float64Array(COLS * ROWS).fill(NaN);
    for (let r = 0; r < ROWS; r++) {
      const lat = cellLat[r];
      const kmPerDegLon = kmPerDegLat * Math.cos((lat * Math.PI) / 180);
      const by = Math.floor(lat / BUCKET), span = Math.ceil(reach / kmPerDegLat / BUCKET) + 1;
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const o = owner[idx];
        if (o < 0) continue;
        const lon = w + (c + 0.5) * dxDeg;
        const bx = Math.floor(lon / BUCKET);
        let sw = 0, sv = 0;
        for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) {
          const list = buckets.get(`${bx + i},${by + j}`);
          if (!list) continue;
          for (const [px, py, v, wt] of list) {
            const dx = (px - lon) * kmPerDegLon, dy = (py - lat) * kmPerDegLat;
            const d2 = dx * dx + dy * dy;
            if (d2 > reach * reach) continue;
            const k = wt * Math.exp(-d2 / sigma2);
            sw += k; sv += k * v;
          }
        }
        const fallback = areas[o].props[key];
        vals[idx] = sw > 1e-6 ? sv / sw : typeof fallback === 'number' ? fallback : NaN;
      }
    }
    let min = Infinity, max = -Infinity;
    for (const v of vals) if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
    const q = new Uint16Array(COLS * ROWS);
    for (let i = 0; i < q.length; i++) q[i] = Number.isFinite(vals[i]) ? Math.round(((vals[i] - min) / (max - min || 1)) * (NODATA - 1)) : NODATA;
    fs.writeFileSync(path.join(outDir, `${key}.bin`), Buffer.from(q.buffer));
    grid.metrics[key] = { min, max };
    console.log(`  surface ${key}: ${COLS}×${ROWS}, ${pts.filter(p => p[3] === 1).length} freguesias with own value`);
  }
  fs.writeFileSync(path.join(outDir, 'grid.json'), JSON.stringify(grid));
}
