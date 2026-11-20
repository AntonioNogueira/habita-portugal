import { NO_DATA, RAMP } from '../lib/colors';
import { LEVEL_LABEL, type Level, type Metric } from '../lib/metrics';

export default function Legend({ metric, breaks, level, fitted }: { metric: Metric; breaks: number[]; level: Level; fitted?: boolean }) {
  const fmt = (v: number) => metric.format(v).replace(/\/m²$/, '');
  const stops = breaks;
  const gradient = `linear-gradient(to right, ${RAMP.slice(0, Math.max(stops.length, 2)).map((c, i, a) => `${c} ${(i / (a.length - 1)) * 100}%`).join(', ')})`;
  const at = (i: number) => (stops.length > 1 ? (i / (stops.length - 1)) * 100 : 0);
  const labelled = [0, 2, 4, 6].filter(i => i < stops.length);
  return (
    <div className="pointer-events-auto rounded-lg bg-white/95 p-3 text-xs shadow-md ring-1 ring-black/5 w-[260px] max-w-[calc(100vw-24px)]">
      <div className="font-medium text-[13px] leading-tight">{metric.short}</div>
      <div className="mb-2 text-[11px] text-[var(--ink-2)]">por {LEVEL_LABEL[level].toLowerCase()} · zoom para mudar de nível</div>
      <div className="relative mx-2">
        <div className="h-3 rounded" style={{ background: gradient }} />
        {stops.map((_, i) => <div key={i} className="absolute top-3 h-1.5 w-px bg-[var(--ink-3)]" style={{ left: `${at(i)}%` }} />)}
        <div className="relative mt-2 h-4 text-[10px] text-[var(--ink-2)] tabular-nums">
          {labelled.map(i => (
            <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${at(i)}%` }}>{fmt(stops[i])}</span>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-[var(--ink-3)]">{fitted ? 'escala ajustada à área visível' : 'escala nacional por percentis'}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: NO_DATA }} /> sem dados publicados
      </div>
    </div>
  );
}
