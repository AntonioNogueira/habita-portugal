import { X } from 'lucide-react';
import { LEVEL_LABEL, metricByKey, type AreaProps, type Level, type Meta } from '../lib/metrics';

interface Props {
  level: Level;
  area: AreaProps;
  parents: string[];
  meta: Meta;
  onClose: () => void;
}

const TYPOLOGIES = [
  { key: 'preco_t01', label: 'T0 / T1' },
  { key: 'preco_t2', label: 'T2', family: true },
  { key: 'preco_t3', label: 'T3', family: true },
  { key: 'preco_t4', label: 'T4 ou mais' },
];

export default function AreaDetails({ level, area, parents, meta, onClose }: Props) {
  const v = (k: string) => (typeof area[k] === 'number' ? (area[k] as number) : null);
  const show = (k: string) => (v(k) == null ? '—' : metricByKey[k].format(v(k)!));
  const vsPT = (k: string) => {
    const a = v(k), n = meta.national[k];
    if (a == null || n == null || !n) return null;
    const d = Math.round((a / n - 1) * 100);
    return `${d > 0 ? '+' : ''}${d} % vs Portugal`;
  };
  const maxTyp = Math.max(...TYPOLOGIES.map(t => v(t.key) ?? 0), 1);
  const anos = v('anos_rendimento');
  const esforco = v('esforco_renda');
  const anosPT = meta.national.anos_rendimento;

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--ink-3)]">{LEVEL_LABEL[level]}{parents.length ? ` · ${parents.join(' · ')}` : ''}</div>
          <h2 className="text-lg font-semibold leading-tight">{area.name}</h2>
        </div>
        <button onClick={onClose} className="rounded p-1 text-[var(--ink-3)] hover:bg-black/5" aria-label="Fechar"><X size={16} /></button>
      </div>
      {area.aproximado && (
        <p className="mt-1 text-[11px] text-[var(--ink-3)]">O distrito não é uma unidade estatística do INE: os preços são a média dos concelhos ponderada pelas vendas.</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Kpi label="Preço mediano" value={show('preco_m2')} note={vsPT('preco_m2')} />
        <Kpi label="Vendas (12 meses)" value={show('vendas')} />
        <Kpi label="Renda mediana" value={show('renda_m2')} note={vsPT('renda_m2')} />
        <Kpi label="Rendimento do agregado" value={show('rendimento')} note={vsPT('rendimento')} />
      </div>

      <h3 className="mt-4 mb-1 text-sm font-medium">Preço por m² por tipologia</h3>
      <div className="space-y-1.5">
        {TYPOLOGIES.map(t => {
          const x = v(t.key);
          return (
            <div key={t.key} className="flex items-center gap-2 text-xs">
              <span className={`w-16 shrink-0 ${t.family ? 'font-medium' : 'text-[var(--ink-2)]'}`}>{t.label}</span>
              <div className="relative h-4 flex-1">
                {x != null && <div className="h-4 rounded-r" style={{ width: `${(x / maxTyp) * 100}%`, background: t.family ? '#256abf' : '#9ec5f4' }} />}
              </div>
              <span className="w-20 shrink-0 text-right tabular-nums">{x != null ? metricByKey.preco_m2.format(x) : <span className="text-[var(--ink-3)]">sem dados</span>}</span>
            </div>
          );
        })}
        <p className="text-[11px] text-[var(--ink-3)]">T2 e T3 (escuro) são as tipologias típicas de uma família de classe média.</p>
      </div>

      <h3 className="mt-4 mb-1 text-sm font-medium">Casa de família ({meta.familyArea} m², T2/T3)</h3>
      {area.familia_estimada && <p className="mb-1.5 text-[11px] text-[var(--ink-3)]">Sem preços por tipologia publicados aqui: estimado com o preço mediano geral por m².</p>}
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="Preço estimado" value={show('casa_familia')} note={vsPT('casa_familia')} />
        <Kpi label="Anos de rendimento" value={show('anos_rendimento')} note={anosPT == null || anos == null ? null : anos > anosPT ? 'menos acessível que a média' : 'mais acessível que a média'} tone={anosPT == null || anos == null ? undefined : anos > anosPT ? 'bad' : 'good'} />
        <Kpi label={`Esforço da renda (${meta.rentArea} m²)`} value={show('esforco_renda')} note={esforco == null ? null : esforco > 35 ? 'sobrecarga' : 'comportável'} tone={esforco == null ? undefined : esforco > 35 ? 'bad' : 'good'} />
        <Kpi label="Portugal: anos de rendimento" value={meta.national.anos_rendimento != null ? metricByKey.anos_rendimento.format(meta.national.anos_rendimento) : '—'} />
      </div>

      <h3 className="mt-4 mb-1 text-sm font-medium">Oferta para famílias</h3>
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="Casas com 4–5 divisões (2021)" value={show('pct_parque_familia')} />
        <Kpi label="Casas novas T2/T3" value={show('pct_novos_t2t3')} note={v('fogos_novos') != null ? `de ${show('fogos_novos')} concluídas` : null} />
      </div>
    </section>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string | null; tone?: 'good' | 'warn' | 'bad' }) {
  const toneColor = tone === 'bad' ? '#d03b3b' : tone === 'warn' ? '#b07800' : tone === 'good' ? '#0a7f0a' : 'var(--ink-3)';
  return (
    <div className="rounded-lg bg-[var(--surface)] p-2 ring-1 ring-[var(--line)]">
      <div className="text-[11px] leading-tight text-[var(--ink-2)]">{label}</div>
      <div className="text-[15px] font-semibold tabular-nums">{value}</div>
      {note && <div className="text-[11px]" style={{ color: toneColor }}>{tone === 'bad' ? '▲ ' : tone === 'good' ? '● ' : tone === 'warn' ? '◆ ' : ''}{note}</div>}
    </div>
  );
}
