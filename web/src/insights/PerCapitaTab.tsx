import { useEffect, useMemo, useState } from 'react';
import type { StatsFile } from '@shared';
import { useStore } from '../data/store';
import { loadStats } from '../data/loader';
import { countryName, formatCount } from '../ui/format';
import { MIN_GAMES, TOP_COUNTRIES, capitaRows, formatPerMillion, formatPopulation, shadeFor, type CapitaMetric } from './helpers';
import { Bar, LoadGate, Segmented } from './parts';
import { useLoaded } from './useLoaded';

const COLOR = '#56B4E9';

function Body({ stats }: { stats: StatsFile }) {
  const [metric, setMetric] = useState<CapitaMetric>('perMillion');
  const [all, setAll] = useState(false);
  const selectPlace = useStore((s) => s.selectPlace);
  const setCountryShade = useStore((s) => s.setCountryShade);

  const rows = useMemo(() => capitaRows(stats.countries, metric), [stats, metric]);
  const shade = useMemo(() => shadeFor(rows), [rows]);

  useEffect(() => {
    setCountryShade(shade);
    return () => setCountryShade(null);
  }, [shade, setCountryShade]);

  const shown = all ? rows : rows.slice(0, TOP_COUNTRIES);
  const max = rows[0]?.value ?? 0;
  const src = stats.populationSource;

  return (
    <>
      <Segmented
        label="Measure"
        value={metric}
        onChange={setMetric}
        options={[
          { value: 'perMillion', label: 'Per million people' },
          { value: 'total', label: 'Total games' },
        ]}
      />
      <p className="ow-muted ow-small">
        Countries that lead at least {MIN_GAMES} games. The globe is shaded by the same measure on a square-root scale.
      </p>
      {rows.length === 0 ? (
        <p className="ow-muted">No country leads enough games to show.</p>
      ) : (
        <ol className="ins-list" aria-label={metric === 'perMillion' ? 'Games led per million people, by country' : 'Games led, by country'}>
          {shown.map((r, i) => (
            <li key={r.code}>
              <button type="button" className="ins-row" onClick={() => selectPlace({ level: 'country', key: r.code })}>
                <span className="ins-rank ow-mono ow-muted">{i + 1}</span>
                <span className="ins-name">{countryName(r.code)}</span>
                <Bar fraction={max > 0 ? r.value / max : 0} color={COLOR} />
                <span className="ins-value ow-mono">{metric === 'perMillion' ? formatPerMillion(r.value) : formatCount(r.value)}</span>
                <span className="ins-sub ow-muted ow-small">
                  <span className="ow-mono">{formatCount(r.gamesLed)}</span> games led
                  {r.population !== null && (
                    <>
                      {' · '}
                      <span className="ow-mono">{formatPopulation(r.population)}</span> people
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {rows.length > TOP_COUNTRIES && (
        <button type="button" className="ow-more-btn" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show top 25' : 'Show all'}
          {!all && <span className="ow-mono ow-muted"> ({rows.length})</span>}
        </button>
      )}
      <p className="ow-muted ow-small">
        Population: {src.name}
        {src.retrieved ? `, retrieved ${src.retrieved}` : ''}.
      </p>
    </>
  );
}

export function PerCapitaTab() {
  const [state, retry] = useLoaded(loadStats);
  return (
    <LoadGate state={state} retry={retry} what="country statistics">
      {(stats) => <Body stats={stats} />}
    </LoadGate>
  );
}
