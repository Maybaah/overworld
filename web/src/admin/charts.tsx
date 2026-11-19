import { useState, type KeyboardEvent } from 'react';
import { formatCount } from '../ui/format';
import type { Ranked } from './api';

const W = 960;
const H = 220;
const M = { top: 12, right: 12, bottom: 26, left: 44 };

export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function bucketLabel(t: number, bucket: 'hour' | 'day', long = false): string {
  const d = new Date(t);
  if (bucket === 'day') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(long ? { weekday: 'short' } : {}) });
  return long
    ? d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function ActivityChart({ points, bucket, label }: { points: [number, number][]; bucket: 'hour' | 'day'; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const max = niceMax(Math.max(0, ...points.map((p) => p[1])));
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const slot = n > 0 ? iw / n : iw;
  const gap = slot > 6 ? 2 : slot > 3 ? 1 : 0;
  const bw = Math.max(1, slot - gap);
  const y = (v: number) => M.top + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (n === 0) return;
    if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };

  const hp = hover !== null ? points[hover] : undefined;
  const tipLeft = hover !== null ? ((M.left + slot * hover + slot / 2) / W) * 100 : 0;

  return (
    <div className="adm-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label} per ${bucket}`}
        tabIndex={0}
        onKeyDown={onKey}
        onMouseLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="adm-gridline" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text className="adm-axis" x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {formatCount(t)}
            </text>
          </g>
        ))}
        {points.map(([t, v], i) => {
          const x = M.left + slot * i + gap / 2;
          const h = Math.max(0, M.top + ih - y(v));
          return (
            <g key={t}>
              {v > 0 && <path className={`adm-bar${hover === i ? ' is-hover' : ''}`} d={barPath(x, M.top + ih, bw, h)} />}
              <rect
                className="adm-hit"
                x={M.left + slot * i}
                y={M.top}
                width={slot}
                height={ih}
                onMouseEnter={() => setHover(i)}
              />
              {i % labelEvery === 0 && (
                <text className="adm-axis" x={x + bw / 2} y={H - 8} textAnchor="middle">
                  {bucketLabel(t, bucket)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hp && (
        <div className="adm-tip" style={{ left: `${tipLeft}%` }} role="status">
          <span className="adm-tip-k">{bucketLabel(hp[0], bucket, true)}</span>
          <span className="adm-tip-v">
            {formatCount(hp[1])} {label.toLowerCase()}
          </span>
        </div>
      )}
      <details className="adm-table-toggle">
        <summary>Show as table</summary>
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">{bucket === 'hour' ? 'Hour' : 'Day'}</th>
              <th scope="col" className="adm-num">
                {label}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map(([t, v]) => (
              <tr key={t}>
                <td>{bucketLabel(t, bucket, true)}</td>
                <td className="adm-num">{formatCount(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function barPath(x: number, base: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  const top = base - h;
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
}

export function RankList({
  rows,
  total,
  name = (k) => k,
  empty = 'Nothing yet.',
  limit = 10,
  label,
}: {
  rows: Ranked | undefined;
  total?: number;
  name?: (key: string) => string;
  empty?: string;
  limit?: number;
  label: string;
}) {
  const list = (rows ?? []).slice(0, limit);
  if (list.length === 0) return <p className="adm-empty">{empty}</p>;
  const max = Math.max(...list.map((r) => r[1]));
  return (
    <table className="adm-rank" aria-label={label}>
      <tbody>
        {list.map(([k, n]) => (
          <tr key={k}>
            <th scope="row" title={name(k)}>
              <span className="adm-rank-name">{name(k)}</span>
              <span className="adm-rank-bar" style={{ width: `${(n / max) * 100}%` }} aria-hidden="true" />
            </th>
            <td className="adm-num">{formatCount(n)}</td>
            {total !== undefined && <td className="adm-num adm-pct">{total > 0 ? `${Math.round((n / total) * 100)}%` : '–'}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
