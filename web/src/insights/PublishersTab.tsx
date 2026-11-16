import { useEffect, useMemo, useState } from 'react';
import type { StatsFile } from '@shared';
import { useStore } from '../data/store';
import { loadStats } from '../data/loader';
import { formatCount } from '../ui/format';
import { formatPercent, yearSeries } from './helpers';
import { LineChart, type ChartSeries } from './LineChart';
import { LoadGate, Segmented } from './parts';
import { useLoaded } from './useLoaded';

const ALL_COLOR = '#A0A7B4';
const INDIE_COLOR = '#E69F00';
const MAJOR_COLOR = '#56B4E9';

type Measure = 'counts' | 'share';

function Body({ stats }: { stats: StatsFile }) {
  const setCountryShade = useStore((s) => s.setCountryShade);
  const [measure, setMeasure] = useState<Measure>('counts');
  const [table, setTable] = useState(false);

  useEffect(() => {
    setCountryShade(null);
  }, [setCountryShade]);

  const points = useMemo(() => yearSeries(stats.years), [stats]);
  const share = measure === 'share';
  const series = useMemo<ChartSeries[]>(() => {
    const out: ChartSeries[] = [];
    if (!share) out.push({ id: 'all', label: 'All games', color: ALL_COLOR, values: points.map((p) => p.total) });
    out.push({ id: 'indie', label: 'Indie', color: INDIE_COLOR, values: points.map((p) => (share ? p.indieShare : p.indie)) });
    out.push({ id: 'major', label: 'Major', color: MAJOR_COLOR, values: points.map((p) => (share ? p.majorShare : p.major)) });
    return out;
  }, [points, share]);

  if (points.length === 0) return <p className="ow-muted">No release years in the data.</p>;

  const first = points[0]!.year;
  const last = points[points.length - 1]!.year;
  const chartLabel = `${share ? 'Share of all games' : 'Games'} released per year, ${first} to ${last}: ${series.map((s) => s.label.toLowerCase()).join(', ')}. Arrow keys move between years.`;
  const cell = (v: number | null) => (share ? (v === null ? 'n/a' : formatPercent(v)) : formatCount(v ?? 0));

  return (
    <>
      <div className="ins-toolbar">
        <Segmented
          label="Measure"
          value={measure}
          onChange={setMeasure}
          options={[
            { value: 'counts', label: 'Counts' },
            { value: 'share', label: 'Share of all games' },
          ]}
        />
        <button type="button" className="ins-seg-btn ins-toggle" aria-pressed={table} onClick={() => setTable(!table)}>
          Show as table
        </button>
      </div>
      {table ? (
        <div className="ins-table-wrap" tabIndex={0} role="region" aria-label="Chart data table">
          <table className="ins-table ow-mono">
            <caption className="ow-sr-only">{chartLabel}</caption>
            <thead>
              <tr>
                <th scope="col">Year</th>
                {!share && <th scope="col">All games</th>}
                <th scope="col">Indie</th>
                <th scope="col">Major</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.year}>
                  <th scope="row">{p.year}</th>
                  {!share && <td>{cell(p.total)}</td>}
                  <td>{cell(share ? p.indieShare : p.indie)}</td>
                  <td>{cell(share ? p.majorShare : p.major)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <LineChart years={points.map((p) => p.year)} series={series} share={share} label={chartLabel} />
      )}
      <p className="ow-muted ow-small">
        Indie means the game carries the IGDB genre Indie. Major means published by a major publisher.
      </p>
      <p>
        A major publisher here is one of the {stats.majorPublishers.length} companies that published the most games in this data set, or a company one of them
        owns. No source labels games as AAA.
      </p>
      <details className="ins-details">
        <summary>The {stats.majorPublishers.length} major publishers</summary>
        <ol className="ins-pubs">
          {stats.majorPublishers.map((m) => (
            <li key={m.companyId}>
              <span>{m.name}</span> <span className="ow-mono ow-muted">{formatCount(m.games)}</span>
            </li>
          ))}
        </ol>
      </details>
    </>
  );
}

export function PublishersTab() {
  const [state, retry] = useLoaded(loadStats);
  return (
    <LoadGate state={state} retry={retry} what="release statistics">
      {(stats) => <Body stats={stats} />}
    </LoadGate>
  );
}
