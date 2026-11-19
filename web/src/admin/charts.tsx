import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatCount } from '../ui/format';
import type { Ranked } from './api';

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
  const [W, setW] = useState(960);
  const box = useRef<HTMLDivElement>(null);
  const n = points.length;

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry?.contentRect.width ?? 0);
      if (w > 0) setW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = niceMax(Math.max(0, ...points.map((p) => p[1])));
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const slot = n > 0 ? iw / n : iw;
  const gap = slot > 6 ? 2 : slot > 3 ? 1 : 0;
  const bw = Math.max(1, slot - gap);
  const y = (v: number) => M.top + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const byDay = bucket === 'hour' && n > 48;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(W / 110))));
  const dayEvery = Math.max(1, Math.ceil(70 / (slot * 24)));
  const showLabel = (t: number, i: number) =>
    byDay ? new Date(t).getHours() === 0 && Math.round(i / 24) % dayEvery === 0 : i % labelEvery === 0;

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (n === 0) return;
    if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W - M.left;
    setHover(n > 0 && x >= 0 && x < iw ? Math.min(n - 1, Math.floor(x / slot)) : null);
  };

  const hp = hover !== null ? points[hover] : undefined;
  const tipLeft = hover !== null ? ((M.left + slot * hover + slot / 2) / W) * 100 : 0;

  return (
    <div className="adm-chart" ref={box}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label} per ${bucket}`}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHover(null)}
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
              {showLabel(t, i) && (
                <text className="adm-axis" x={byDay ? x : x + bw / 2} y={H - 8} textAnchor={byDay ? 'start' : 'middle'}>
                  {bucketLabel(t, byDay ? 'day' : bucket)}
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
