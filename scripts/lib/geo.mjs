// Administrative boundaries of mainland Portugal: freguesias (CAOP, DGT, CC BY 4.0),
// dissolved into concelhos and distritos and simplified with mapshaper.
import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';

const CACHE = path.resolve('.cache');
// CAOP freguesias as GeoJSON (WGS84). Swap for CAOP 2025 when available (see README).
const FREGUESIAS_URL = process.env.FREGUESIAS_URL
  || 'https://raw.githubusercontent.com/cft-org/portugal_freguesias_geojson/main/freguesias.json';

async function freguesiasSource() {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, 'freguesias.geojson');
  if (!fs.existsSync(file)) {
    console.log(`  downloading ${FREGUESIAS_URL}`);
    const res = await fetch(FREGUESIAS_URL);
    if (!res.ok) throw new Error(`freguesias: HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return file;
}

const titleCase = s => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, w => w.toLowerCase());

/** Returns { distrito, concelho, freguesia } FeatureCollections with properties { id, name, parent }. */
export async function boundaries() {
  const src = await freguesiasSource();
  const input = { 'f.json': fs.readFileSync(src, 'utf8') };
  const run = async cmd => JSON.parse((await mapshaper.applyCommands(cmd, input))['out.json']);
  const base = `-i f.json -each 'fr=Dicofre, co=Dicofre.slice(0,4), di=Dicofre.slice(0,2), fname=Freguesia, cname=Concelho, dname=Distrito'`;
  // Coverage-aware simplification keeps shared borders matching. Freguesias keep more detail (seen zoomed in).
  const [fr, co, di] = await Promise.all([
    run(`${base} -dissolve2 fr copy-fields=co,fname -simplify 12% keep-shapes -o out.json format=geojson precision=0.00001`),
    run(`${base} -dissolve2 co copy-fields=di,cname gap-fill-area=60km2 -simplify 6% keep-shapes -o out.json format=geojson precision=0.0001`),
    run(`${base} -dissolve2 di copy-fields=dname gap-fill-area=60km2 -simplify 4% keep-shapes -o out.json format=geojson precision=0.0001`),
  ]);
  const map = (fc, f) => ({ type: 'FeatureCollection', features: fc.features.map(x => ({ type: 'Feature', geometry: x.geometry, properties: f(x.properties) })) });
  return {
    freguesia: map(fr, p => ({ id: p.fr, name: p.fname, parent: p.co })),
    concelho: map(co, p => ({ id: p.co, name: titleCase(p.cname), parent: p.di })),
    distrito: map(di, p => ({ id: p.di, name: titleCase(p.dname) })),
  };
}

export function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
  console.log(`  wrote ${file} (${(fs.statSync(file).size / 1e6).toFixed(2)} MB)`);
}
