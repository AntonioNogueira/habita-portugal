import { useEffect, useMemo, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { Home, Info } from 'lucide-react';
import Map from './components/Map';
import Legend from './components/Legend';
import AreaDetails from './components/AreaDetails';
import { quantileBreaks } from './lib/colors';
import { LEVEL_LABEL, METRICS, metricByKey, type AreaProps, type Level, type Meta } from './lib/metrics';

const LEVELS: Level[] = ['distrito', 'concelho', 'freguesia'];

export default function App() {
  const [data, setData] = useState<Record<Level, FeatureCollection> | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState('preco_m2');
  const [level, setLevel] = useState<Level>('distrito');
  const [selected, setSelected] = useState<{ level: Level; id: string } | null>(null);
  const [flyTo, setFlyTo] = useState<{ level: Level; id: string; n: number } | null>(null);

  useEffect(() => {
    Promise.all([...LEVELS.map(l => fetch(`data/${l}.geojson`).then(r => r.json())), fetch('data/meta.json').then(r => r.json())])
      .then(([d, c, f, m]) => { setData({ distrito: d, concelho: c, freguesia: f }); setMeta(m); })
      .catch(e => setError(String(e)));
  }, []);

  const breaks = useMemo(() => {
    const out = { distrito: [], concelho: [], freguesia: [] } as Record<Level, number[]>;
    if (!data) return out;
    for (const l of LEVELS) {
      // Freguesias share the concelho scale so colours compare when zooming in.
      const src = l === 'freguesia' ? 'concelho' : l;
      out[l] = quantileBreaks(data[src].features.map(f => f.properties?.[metric]).filter((v): v is number => typeof v === 'number'));
    }
    return out;
  }, [data, metric]);

  const byId = useMemo(() => {
    const out = {} as Record<Level, Record<string, AreaProps>>;
    for (const l of LEVELS) out[l] = Object.fromEntries((data?.[l].features ?? []).map(f => [f.properties!.id, f.properties as AreaProps]));
    return out;
  }, [data]);

  const m = metricByKey[metric];
  const ranking = useMemo(() => {
    if (!data) return [];
    return data[level].features.map(f => f.properties as AreaProps)
      .filter(p => typeof p[metric] === 'number')
      .sort((a, b) => (b[metric] as number) - (a[metric] as number));
  }, [data, level, metric]);

  const selArea = selected ? byId[selected.level]?.[selected.id] : null;
  const parents = (() => {
    if (!selected || !selArea) return [];
    if (selected.level === 'freguesia') {
      const c = byId.concelho[selArea.parent as string];
      return [c?.name, c && byId.distrito[c.parent as string]?.name].filter(Boolean) as string[];
    }
    if (selected.level === 'concelho') return [byId.distrito[selArea.parent as string]?.name].filter(Boolean) as string[];
    return [];
  })();
  const pick = (l: Level, id: string) => { setSelected({ level: l, id }); setFlyTo({ level: l, id, n: Date.now() }); };

  const groups = [...new Set(METRICS.map(x => x.group))];

  return (
    <div className="flex h-full flex-col-reverse md:flex-row">
      <aside className="h-[52%] w-full shrink-0 overflow-y-auto border-[var(--line)] bg-[var(--surface)] md:h-full md:w-[400px] md:border-r">
        <div className="space-y-4 p-4">
          <header>
            <div className="flex items-center gap-2">
              <Home size={20} className="text-[var(--accent)]" />
              <h1 className="text-xl font-semibold">Habita Portugal</h1>
            </div>
            <p className="mt-1 text-sm text-[var(--ink-2)]">Quanto custa uma casa para uma família de classe média, por distrito, concelho e freguesia.</p>
          </header>

          <div>
            <label htmlFor="metric" className="text-xs font-medium text-[var(--ink-2)]">Indicador no mapa</label>
            <select id="metric" value={metric} onChange={e => setMetric(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
              {groups.map(g => (
                <optgroup key={g} label={g}>
                  {METRICS.filter(x => x.group === g).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                </optgroup>
              ))}
            </select>
            <p className="mt-1.5 flex gap-1.5 text-xs text-[var(--ink-2)]"><Info size={14} className="mt-px shrink-0" />{m.help}</p>
            {meta && <p className="mt-1 text-[11px] text-[var(--ink-3)]">Período: {meta.periods[m.period]} · Fonte: INE</p>}
          </div>

          {meta && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="€/m² Portugal" value={meta.national.preco_m2 != null ? metricByKey.preco_m2.format(meta.national.preco_m2).replace('/m²', '') : '—'} />
              <Stat label="Casa 100 m² T2/T3" value={meta.national.casa_familia != null ? metricByKey.casa_familia.format(meta.national.casa_familia) : '—'} />
              <Stat label="Anos de rendimento" value={meta.national.anos_rendimento != null ? String(meta.national.anos_rendimento).replace('.', ',') : '—'} />
            </div>
          )}

          {selected && selArea && meta && (
            <AreaDetails level={selected.level} area={selArea} parents={parents} meta={meta} onClose={() => setSelected(null)} />
          )}

          {!!ranking.length && (
            <section>
              <h3 className="mb-1 text-sm font-medium">{LEVEL_LABEL[level]}s com valor mais alto</h3>
              <p className="mb-2 text-[11px] text-[var(--ink-3)]">{ranking.length} com dados · clique para ver no mapa</p>
              <ol className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] bg-white text-sm">
                {ranking.slice(0, 10).map((p, i) => (
                  <li key={p.id}>
                    <button onClick={() => pick(level, p.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/[0.03]">
                      <span className="w-5 text-xs text-[var(--ink-3)] tabular-nums">{i + 1}</span>
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="tabular-nums text-[var(--ink-2)]">{m.format(p[metric] as number)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <footer className="pb-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
            Dados: INE — Estatísticas de preços da habitação ao nível local, rendas, rendimento (IRS), obras concluídas e Censos 2021.
            Limites administrativos: CAOP (DGT). O INE só publica valores de freguesias com vendas suficientes; Açores e Madeira ainda não estão no mapa.
            {meta && <> Dados actualizados a {meta.built}.</>}
          </footer>
        </div>
      </aside>

      <main className="relative min-h-0 flex-1">
        {error && <div className="absolute inset-0 grid place-items-center text-sm text-red-700">Não foi possível carregar os dados: {error}</div>}
        {data && <Map data={data} metric={metric} breaks={breaks} selected={selected} flyTo={flyTo} onSelect={setSelected} onLevel={setLevel} />}
        <div className="pointer-events-none absolute bottom-6 left-3">
          <Legend metric={m} breaks={breaks[level]} level={level} />
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-2 ring-1 ring-[var(--line)]">
      <div className="text-[15px] font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] leading-tight text-[var(--ink-2)]">{label}</div>
    </div>
  );
}
