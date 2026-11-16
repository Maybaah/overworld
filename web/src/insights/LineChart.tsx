import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { formatCount } from '../ui/format';
import { formatPercent, niceMax } from './helpers';

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
}

const W = 408;
const H = 232;
const M = { top: 12, right: 64, bottom: 24, left: 40 };

function formatValue(v: number | null, share: boolean): string {
  if (v === null) return 'no games';
  return share ? formatPercent(v) : formatCount(v);
}

export function LineChart({
  years,
  series,
  share,
  label,
}: {
  years: number[];
  series: ChartSeries[];
  share: boolean;
  label: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const n = years.length;
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const rawMax = series.reduce((m, s) => s.values.reduce<number>((mm, v) => Math.max(mm, v ?? 0), m), 0);
  const yMax = share ? Math.min(1, niceMax(rawMax)) : niceMax(rawMax);
  const x = (i: number) => M.left + (n > 1 ? (i / (n - 1)) * plotW : 0);
  const y = (v: number) => M.top + plotH - (v / yMax) * plotH;

  const xTicks = years.map((yr, i) => ({ yr, i })).filter(({ yr, i }) => yr % 10 === 0 || i === n - 1);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  const paths = series.map((s) => {
    let d = '';
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });

  const lastValues = series.map((s, si) => {
    let li = s.values.length - 1;
    while (li > 0 && s.values[li] === null) li--;
    return { si, y: y(s.values[li] ?? 0) };
  });
  const labelY = new Map<number, number>();
  let prev = -Infinity;
  for (const l of [...lastValues].sort((a, b) => a.y - b.y)) {
    const placed = Math.max(l.y, prev + 14);
    labelY.set(l.si, placed);
    prev = placed;
  }

  const move = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    setIndex(Math.max(0, Math.min(n - 1, Math.round(((px - M.left) / plotW) * (n - 1)))));
  };

  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    const cur = index ?? n - 1;
    let next = cur;
    if (e.key === 'ArrowLeft') next = cur - 1;
    else if (e.key === 'ArrowRight') next = cur + 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else return;
    e.preventDefault();
    setIndex(Math.max(0, Math.min(n - 1, next)));
  };

  const active = index ?? n - 1;
  const readout = `${years[active]}: ${series.map((s) => `${s.label} ${formatValue(s.values[active] ?? null, share)}`).join(', ')}`;

  return (
    <div className="ins-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="ins-svg"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="horizontal"
        aria-valuemin={years[0]}
        aria-valuemax={years[n - 1]}
        aria-valuenow={years[active]}
        aria-valuetext={readout}
        onMouseMove={move}
        onMouseLeave={() => setIndex(null)}
        onKeyDown={key}
        onBlur={() => setIndex(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className="ins-grid" />
            <text x={M.left - 6} y={y(t) + 4} textAnchor="end" className="ins-tick">
              {share ? formatPercent(t) : formatCount(Math.round(t))}
            </text>
          </g>
        ))}
        {xTicks.map(({ yr, i }) => (
          <text key={yr} x={x(i)} y={H - 6} textAnchor={i === n - 1 && yr % 10 !== 0 ? 'end' : 'middle'} className="ins-tick">
            {yr}
          </text>
        ))}
        {series.map((s, si) => (
          <path key={s.id} d={paths[si]} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
        ))}
        {series.map((s, si) => (
          <text key={`l-${s.id}`} x={W - M.right + 6} y={(labelY.get(si) ?? 0) + 4} fill={s.color} className="ins-line-label">
            {s.label}
          </text>
        ))}
        {index !== null && (
          <g>
            <line x1={x(index)} x2={x(index)} y1={M.top} y2={M.top + plotH} className="ins-cursor" />
            {series.map((s) => {
              const v = s.values[index];
              return v === null || v === undefined ? null : <circle key={s.id} cx={x(index)} cy={y(v)} r={3.5} fill={s.color} />;
            })}
          </g>
        )}
      </svg>
      <p className="ins-readout ow-mono" aria-live="polite">
        {readout}
      </p>
    </div>
  );
}
