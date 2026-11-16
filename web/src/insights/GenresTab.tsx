import { useEffect, useMemo, useState } from 'react';
import type { StatsFile } from '@shared';
import { useStore } from '../data/store';
import { loadStats } from '../data/loader';
import { formatCount } from '../ui/format';
import { formatPercent, shareOf, topWithOther } from './helpers';
import { Bar, LoadGate, Segmented } from './parts';
import { useLoaded } from './useLoaded';

const COLOR = '#1DB88E';
const TOP = 6;

type View = 'region' | 'genre';

function Body({ stats }: { stats: StatsFile }) {
  const meta = useStore((s) => s.meta);
  const setCountryShade = useStore((s) => s.setCountryShade);
  const [view, setView] = useState<View>('region');

  useEffect(() => {
    setCountryShade(null);
  }, [setCountryShade]);

  const names = useMemo(() => new Map((meta?.genres ?? []).map((g) => [String(g.id), g.name])), [meta]);
  const genreName = (id: string) => names.get(id) ?? `Genre ${id}`;

  const regions = useMemo(() => stats.regions.filter((r) => r.gamesLed > 0).sort((a, b) => b.gamesLed - a.gamesLed || a.region.localeCompare(b.region)), [stats]);

  const genreOptions = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of regions) for (const [id, n] of Object.entries(r.genres)) totals.set(id, (totals.get(id) ?? 0) + n);
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id]) => ({ id, name: genreName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [regions, names]);

  const [genre, setGenre] = useState<string | null>(null);
  const activeGenre = genre && genreOptions.some((g) => g.id === genre) ? genre : (genreOptions[0]?.id ?? null);

  const byRegion = useMemo(
    () =>
      regions.map((r) => {
        const { top, otherKinds } = topWithOther(r.genres, TOP);
        return { region: r.region, gamesLed: r.gamesLed, top: top.map((t) => ({ ...t, share: shareOf(t.count, r.gamesLed) })), otherKinds };
      }),
    [regions],
  );
  const maxShareRegion = byRegion.reduce((m, r) => Math.max(m, r.top[0]?.share ?? 0), 0);

  const byGenre = useMemo(
    () =>
      activeGenre === null
        ? []
        : regions.map((r) => ({
            region: r.region,
            gamesLed: r.gamesLed,
            count: r.genres[activeGenre] ?? 0,
            share: shareOf(r.genres[activeGenre] ?? 0, r.gamesLed),
          })),
    [regions, activeGenre],
  );
  const maxShareGenre = byGenre.reduce((m, r) => Math.max(m, r.share), 0);

  if (regions.length === 0) return <p className="ow-muted">No regional data.</p>;

  return (
    <>
      <Segmented
        label="View"
        value={view}
        onChange={setView}
        options={[
          { value: 'region', label: 'Top genres per region' },
          { value: 'genre', label: 'One genre everywhere' },
        ]}
      />
      <p className="ow-muted ow-small">
        Share of the games led in each region. A game can have several genres, so shares can add up to more than 100%.
      </p>
      {view === 'region' ? (
        byRegion.map((r) => (
          <section key={r.region} aria-label={`${r.region}: top genres`}>
            <h4 className="ins-h4">
              {r.region} <span className="ow-mono ow-muted">{formatCount(r.gamesLed)} games</span>
            </h4>
            <ul className="ins-list">
              {r.top.map((t) => (
                <li key={t.id} className="ins-row ins-row-static">
                  <span className="ins-name">{genreName(t.id)}</span>
                  <Bar fraction={maxShareRegion > 0 ? t.share / maxShareRegion : 0} color={COLOR} />
                  <span className="ins-value ow-mono">{formatPercent(t.share)}</span>
                </li>
              ))}
            </ul>
            {r.otherKinds > 0 && <p className="ow-muted ow-small">{r.otherKinds} more genres not shown.</p>}
          </section>
        ))
      ) : (
        <>
          <label className="ins-field">
            <span>Genre</span>
            <select className="ins-select" value={activeGenre ?? ''} onChange={(e) => setGenre(e.target.value)}>
              {genreOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <ul className="ins-list" aria-label={`Share of games in each region that are ${activeGenre ? genreName(activeGenre) : ''}`}>
            {byGenre.map((r) => (
              <li key={r.region} className="ins-row ins-row-static">
                <span className="ins-name">{r.region}</span>
                <Bar fraction={maxShareGenre > 0 ? r.share / maxShareGenre : 0} color={COLOR} />
                <span className="ins-value ow-mono">{formatPercent(r.share)}</span>
                <span className="ins-sub ow-muted ow-small">
                  <span className="ow-mono">{formatCount(r.count)}</span> of <span className="ow-mono">{formatCount(r.gamesLed)}</span> games
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export function GenresTab() {
  const [state, retry] = useLoaded(loadStats);
  return (
    <LoadGate state={state} retry={retry} what="regional statistics">
      {(stats) => <Body stats={stats} />}
    </LoadGate>
  );
}
