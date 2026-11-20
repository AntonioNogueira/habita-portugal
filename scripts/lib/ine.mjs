// INE (Instituto Nacional de Estatística) open data API: https://www.ine.pt/xportal/xmain?xpid=INE&xpgid=ine_api
// Each indicator is fetched once and cached in .cache/ (delete the folder to refresh).
import fs from 'node:fs';
import path from 'node:path';

const CACHE = path.resolve('.cache');
const API = 'https://www.ine.pt/ine/json_indicador/pindica.jsp';

export async function fetchIndicator(varcd, { period, filters = {} } = {}) {
  fs.mkdirSync(CACHE, { recursive: true });
  const extra = Object.entries(filters);
  const file = path.join(CACHE, `ine-${varcd}${period ? '-' + period : ''}${extra.map(([k, v]) => `-${k}${v}`).join('')}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const url = `${API}?op=2&varcd=${varcd}&lang=PT${period ? `&Dim1=${period}` : ''}${extra.map(([k, v]) => `&${k}=${v}`).join('')}`;
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (data build script)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json?.[0]?.Dados) throw new Error(json?.[0]?.Sucesso?.Falso?.[0]?.Msg || 'no data');
      fs.writeFileSync(file, JSON.stringify(json));
      return json;
    } catch (err) {
      lastError = err;
      console.warn(`  INE ${varcd}: attempt ${attempt} failed (${err.message})`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error(`INE ${varcd}: ${lastError?.message}`);
}

/** Rows of the latest (or given) period: [{ geocod, geodsg, dim_3, dim_3_t, ..., valor }] */
export async function rows(varcd, opts = {}) {
  const json = await fetchIndicator(varcd, opts);
  const dados = json[0].Dados;
  const period = Object.keys(dados).at(-1);
  console.log(`  INE ${varcd} · ${period} · ${dados[period].length} rows`);
  return { period, rows: dados[period], name: json[0].IndicadorDsg };
}

/**
 * INE geographic codes → CAOP codes (DICOFRE):
 *  município: NUTS III (3) + DTMN (4)  e.g. 1120302 → "0302"; Censos use DTMN (4) directly
 *  freguesia: NUTS III (3) + DTMNFR (6) e.g. 112030201 → "030201"; Censos use DTMNFR (6) directly
 */
export function caopCode(geocod) {
  if (geocod.length === 7) return { level: 'concelho', code: geocod.slice(3) };
  if (geocod.length === 9) return { level: 'freguesia', code: geocod.slice(3) };
  if (geocod.length === 4 && /^\d{4}$/.test(geocod)) return { level: 'concelho', code: geocod };
  if (geocod.length === 6 && /^\d{6}$/.test(geocod)) return { level: 'freguesia', code: geocod };
  return null;
}

export const num = v => (v === undefined || v === null || v === '' ? null : Number(v));

/** Index rows by CAOP code, optionally filtered: { concelho: Map, freguesia: Map } */
export function index(rowsList, filter = () => true, value = r => num(r.valor)) {
  const out = { concelho: new Map(), freguesia: new Map() };
  for (const r of rowsList) {
    if (!filter(r)) continue;
    const c = caopCode(r.geocod);
    if (!c) continue;
    const v = value(r);
    if (v === null || Number.isNaN(v)) continue;
    out[c.level].set(c.code, (out[c.level].get(c.code) ?? 0) + v);
  }
  return out;
}

/** Concelho names as INE writes them (proper case), keyed by DTMN. */
export function names(rowsList) {
  const out = new Map();
  for (const r of rowsList) {
    const c = caopCode(r.geocod);
    if (c && !out.has(c.code)) out.set(c.code, r.geodsg);
  }
  return out;
}
