import { NO_DATA, RAMP } from '../lib/colors';
import { LEVEL_LABEL, type Level, type Metric } from '../lib/metrics';

export default function Legend({ metric, breaks, level }: { metric: Metric; breaks: number[]; level: Level }) {
  const fmt = (v: number) => metric.format(v).replace(/\/m²$/, '');
  const colors = RAMP.slice(0, breaks.length + 1);
  return (
    <div className="pointer-events-auto rounded-lg bg-white/95 p-3 text-xs shadow-md ring-1 ring-black/5 max-w-[260px]">
      <div className="font-medium text-[13px] leading-tight">{metric.short}</div>
      <div className="mb-2 text-[11px] text-[var(--ink-2)]">por {LEVEL_LABEL[level].toLowerCase()} · zoom para mudar de nível</div>
      <div className="flex gap-[2px]">
        {colors.map(c => <div key={c} className="h-3 flex-1 first:rounded-l last:rounded-r" style={{ background: c }} />)}
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-[var(--ink-2)]">
        {breaks.map((b, i) => (
          <span key={b} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((i + 1) / colors.length) * 100}%` }}>
            {i % 2 === 0 || breaks.length < 5 ? fmt(b) : ''}
          </span>
        ))}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: NO_DATA }} /> sem dados publicados
      </div>
    </div>
  );
}
