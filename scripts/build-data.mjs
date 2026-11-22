// Builds public/data/*.geojson: boundaries (distrito → concelho → freguesia) joined with INE housing indicators.
// Run: npm run data   (downloads into .cache/, delete it to refresh)
import { rows, index, num } from './lib/ine.mjs';
import { boundaries, write } from './lib/geo.mjs';
import { writeSurfaces } from './lib/surface.mjs';

// Latest periods. Update when INE publishes a new quarter/year (see docs/DADOS.md).
const QUARTER = process.env.INE_QUARTER || 'S5A20262'; // 2.º trimestre 2026
const FAMILY_AREA = 100; // m² of a typical middle-class family home (T2/T3)
const RENT_AREA = 90;

console.log('INE indicators');
const price = await rows('0014763', { period: QUARTER });   // €/m² vendas 12 meses × categoria (Total/Existentes/Novos)
const sales = await rows('0014764', { period: QUARTER });   // N.º vendas 12 meses
const typology = await rows('0014759', { period: QUARTER }); // €/m² × tipologia (T0-T1, T2, T3, T4+)
const rent = await rows('0014773', { period: 'S7A2025' });  // renda mediana €/m² novos contratos
const income = await rows('0012712', { period: 'S7A2023' }); // rendimento bruto declarado mediano por agregado fiscal
const built = await rows('0013248', { period: 'S7A2025' });  // fogos concluídos × tipologia
const stock = await rows('0014625');                         // Censos 2021 alojamentos × divisões × área

const cat = (field, value) => r => r[field] === value;
const metrics = {
  preco_m2: index(price.rows, cat('dim_3_t', 'Total')),
  preco_existentes: index(price.rows, cat('dim_3_t', 'Existentes')),
  preco_novos: index(price.rows, cat('dim_3_t', 'Novos')),
  vendas: index(sales.rows),
  preco_t01: index(typology.rows, cat('dim_3_t', 'T0 ou T1')),
  preco_t2: index(typology.rows, cat('dim_3_t', 'T2')),
  preco_t3: index(typology.rows, cat('dim_3_t', 'T3')),
  preco_t4: index(typology.rows, cat('dim_3_t', 'T4 ou mais')),
  renda_m2: index(rent.rows),
  rendimento: index(income.rows),
  fogos_novos: index(built.rows, cat('dim_3_t', 'Total')),
  fogos_novos_t2t3: index(built.rows, r => r.dim_3_t === 'T2' || r.dim_3_t === 'T3'),
  alojamentos: index(stock.rows, r => r.dim_3_t === 'Total' && r.dim_4_t === 'Total'),
  alojamentos_familia: index(stock.rows, r => (r.dim_3_t === 'Com 4 divisões' || r.dim_3_t === 'Com 5 divisões') && r.dim_4_t === 'Total'),
};

const national = {};
for (const [key, src, filter] of [
  ['preco_m2', price, cat('dim_3_t', 'Total')], ['vendas', sales], ['preco_t2', typology, cat('dim_3_t', 'T2')],
  ['preco_t3', typology, cat('dim_3_t', 'T3')], ['renda_m2', rent], ['rendimento', income],
]) {
  const r = src.rows.find(x => x.geocod === 'PT' && (!filter || filter(x)));
  national[key] = r ? num(r.valor) : null;
}
derive(national);

function derive(p) {
  const fam = [p.preco_t2, p.preco_t3].filter(v => v != null);
  p.preco_familia_m2 = fam.length ? Math.round(fam.reduce((a, b) => a + b, 0) / fam.length) : null;
  // INE publishes prices by typology only where there are enough sales (≈60 concelhos): elsewhere use the overall €/m².
  if (p.preco_familia_m2 == null && p.preco_m2 != null) { p.preco_familia_m2 = p.preco_m2; p.familia_estimada = true; }
  p.casa_familia = p.preco_familia_m2 != null ? p.preco_familia_m2 * FAMILY_AREA : null;
  p.anos_rendimento = p.casa_familia != null && p.rendimento ? round(p.casa_familia / p.rendimento, 1) : null;
  p.esforco_renda = p.renda_m2 != null && p.rendimento ? round((p.renda_m2 * RENT_AREA * 12) / p.rendimento * 100, 0) : null;
  p.pct_parque_familia = p.alojamentos ? round(p.alojamentos_familia / p.alojamentos * 100, 1) : null;
  p.pct_novos_t2t3 = p.fogos_novos ? round(p.fogos_novos_t2t3 / p.fogos_novos * 100, 1) : null;
  return p;
}
function round(v, d) { const f = 10 ** d; return Math.round(v * f) / f; }

function attach(fc, level) {
  for (const f of fc.features) {
    for (const [key, m] of Object.entries(metrics)) {
      const v = m[level].get(f.properties.id);
      if (v != null) f.properties[key] = v;
    }
    derive(f.properties);
    for (const k of Object.keys(f.properties)) if (f.properties[k] == null) delete f.properties[k];
  }
  return fc;
}

// Districts are not an INE statistical unit: sums add up; medians are approximated by the
// sales-weighted (prices) or dwelling-weighted (income, rent) mean of their concelhos.
function aggregateDistricts(distritos, concelhos) {
  for (const d of distritos.features) {
    const kids = concelhos.features.map(f => f.properties).filter(p => p.parent === d.properties.id);
    const p = d.properties;
    p.concelhos = kids.length;
    for (const k of ['vendas', 'fogos_novos', 'fogos_novos_t2t3', 'alojamentos', 'alojamentos_familia']) {
      const s = kids.reduce((a, c) => a + (c[k] ?? 0), 0);
      if (s) p[k] = s;
    }
    const wmean = (k, w) => {
      const xs = kids.filter(c => c[k] != null && c[w]);
      const tw = xs.reduce((a, c) => a + c[w], 0);
      return tw ? Math.round(xs.reduce((a, c) => a + c[k] * c[w], 0) / tw * 100) / 100 : null;
    };
    for (const k of ['preco_m2', 'preco_existentes', 'preco_novos', 'preco_t01', 'preco_t2', 'preco_t3', 'preco_t4']) p[k] = wmean(k, 'vendas') && Math.round(wmean(k, 'vendas'));
    p.renda_m2 = wmean('renda_m2', 'alojamentos');
    p.rendimento = wmean('rendimento', 'alojamentos') && Math.round(wmean('rendimento', 'alojamentos'));
    p.aproximado = true;
    derive(p);
    for (const k of Object.keys(p)) if (p[k] == null) delete p[k];
  }
  return distritos;
}

console.log('Boundaries');
const geo = await boundaries();
attach(geo.concelho, 'concelho');
attach(geo.freguesia, 'freguesia');
aggregateDistricts(geo.distrito, geo.concelho);

console.log('Writing');
for (const level of ['distrito', 'concelho', 'freguesia']) write(`public/data/${level}.geojson`, geo[level]);
write('public/data/meta.json', {
  built: new Date().toISOString().slice(0, 10),
  familyArea: FAMILY_AREA, rentArea: RENT_AREA,
  national,
  periods: { preco: price.period, vendas: sales.period, tipologia: typology.period, renda: rent.period, rendimento: income.period, obras: built.period, censos: stock.period },
  sources: {
    preco: '0014763', vendas: '0014764', tipologia: '0014759', renda: '0014773', rendimento: '0012712', obras: '0013248', censos: '0014625',
  },
});
console.log('Surfaces');
// Metrics that make sense as a continuous surface (prices, rents, income and ratios, not counts).
const SURFACE_METRICS = ['preco_m2', 'preco_familia_m2', 'renda_m2', 'rendimento', 'anos_rendimento', 'esforco_renda', 'pct_parque_familia'];
writeSurfaces('public/data/surface', geo.concelho, geo.freguesia, SURFACE_METRICS);

const covered = level => geo[level].features.filter(f => f.properties.preco_m2 != null).length + '/' + geo[level].features.length;
console.log(`Coverage (preço/m²): distritos ${covered('distrito')}, concelhos ${covered('concelho')}, freguesias ${covered('freguesia')}`);
