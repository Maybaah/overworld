import { useEffect, useMemo, useState } from 'react';
import type { FlowsFile } from '@shared';
import { useStore, type ExtraArc, type ExtraMarker } from '../data/store';
import { loadFlows } from '../data/loader';
import { countryName, formatCount } from '../ui/format';
import {
  ALL_WORK,
  LOW_DATA_LINKS,
  NEUTRAL_COLOR,
  WORK_GROUPS,
  arcWidth,
  distanceKm,
  flyAltitude,
  linkTotals,
  midpoint,
  topFlows,
} from './helpers';
import { Bar, LoadGate } from './parts';
import { useLoaded } from './useLoaded';

function Body({ flows }: { flows: FlowsFile }) {
  const indexes = useStore((s) => s.indexes);
  const setExtras = useStore((s) => s.setExtras);
  const flyTo = useStore((s) => s.flyTo);
  const selectGame = useStore((s) => s.selectGame);
  const [groupId, setGroupId] = useState(ALL_WORK);
  const [includeSame, setIncludeSame] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const totals = useMemo(() => linkTotals(flows.flows), [flows]);
  const rows = useMemo(() => topFlows(flows.flows, groupId, includeSame), [flows, groupId, includeSame]);
  const total = totals[groupId] ?? 0;
  const group = WORK_GROUPS.find((g) => g.id === groupId);
  const color = group?.color ?? NEUTRAL_COLOR;
  const max = rows[0]?.games ?? 0;

  useEffect(() => {
    setOpen(null);
  }, [groupId, includeSame]);

  useEffect(() => {
    if (!indexes) return;
    const point = (code: string) => indexes.countries.find((c) => c.code === code);
    const arcs: ExtraArc[] = [];
    const markers: ExtraMarker[] = [];
    for (const r of rows) {
      const a = point(r.from);
      const b = point(r.to);
      if (!a || !b) continue;
      const id = `flow:${groupId}:${r.from}:${r.to}`;
      if (r.from === r.to) {
        markers.push({ id, lat: a.lat, lng: a.lng, color, kind: 'ring' });
      } else {
        arcs.push({
          id,
          startLat: a.lat,
          startLng: a.lng,
          endLat: b.lat,
          endLng: b.lng,
          color,
          width: arcWidth(r.games, max),
        });
      }
    }
    setExtras(arcs, markers);

    const top = rows[0];
    const a = top && point(top.from);
    const b = top && point(top.to);
    if (top && a && b) {
      const mid = midpoint(a.lat, a.lng, b.lat, b.lng);
      flyTo(mid.lat, mid.lng, flyAltitude(distanceKm(a.lat, a.lng, b.lat, b.lng)));
    }
    return () => setExtras([], []);
  }, [rows, indexes, groupId, color, max, setExtras, flyTo]);

  return (
    <>
      <div className="ins-chips" role="group" aria-label="Kind of work">
        {[{ id: ALL_WORK, label: 'All outside work' }, ...WORK_GROUPS].map((g) => {
          const n = totals[g.id] ?? 0;
          return (
            <button
              key={g.id}
              type="button"
              className="ins-chip"
              aria-pressed={g.id === groupId}
              disabled={n === 0}
              onClick={() => setGroupId(g.id)}
            >
              {g.label} <span className="ow-mono">{formatCount(n)}</span>
            </button>
          );
        })}
      </div>
      <label className="ins-switch">
        <input type="checkbox" role="switch" checked={includeSame} onChange={(e) => setIncludeSame(e.target.checked)} />
        <span>Include work inside the same country</span>
      </label>
      {total < LOW_DATA_LINKS && (
        <p className="ow-muted ins-note" role="note">
          Only {formatCount(total)} links in the data. The sources used so far rarely record this kind of work.
        </p>
      )}
      <p className="ow-muted ow-small">
        From the lead studio’s country to the country of the company doing the work. Each link is one game and one country pair.
      </p>
      {rows.length === 0 ? (
        <p className="ow-muted">No flows to show for this selection.</p>
      ) : (
        <ol className="ins-list" aria-label="Largest flows of work between countries">
          {rows.map((r) => {
            const key = `${r.from}|${r.to}`;
            const expanded = open === key;
            const examples = r.examples.map((id) => indexes?.gameById.get(id)).filter((g) => g !== undefined);
            return (
              <li key={key}>
                <button type="button" className="ins-row ins-flow" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : key)}>
                  <span className="ins-name">
                    {countryName(r.from)} → {countryName(r.to)}
                  </span>
                  <Bar fraction={max > 0 ? r.games / max : 0} color={color} />
                  <span className="ins-value ow-mono">{formatCount(r.games)}</span>
                </button>
                {expanded && (
                  <ul className="ins-examples" aria-label={`Example games: ${countryName(r.from)} to ${countryName(r.to)}`}>
                    {examples.length === 0 && <li className="ow-muted ow-small">No example games.</li>}
                    {examples.map((g) => (
                      <li key={g.id}>
                        <button type="button" className="ow-link-btn" onClick={() => void selectGame(g.id)}>
                          {g.name}
                        </button>
                        {g.year !== null && <span className="ow-mono ow-muted"> {g.year}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

export function FlowsTab() {
  const [state, retry] = useLoaded(loadFlows);
  return (
    <LoadGate state={state} retry={retry} what="flows between countries">
      {(flows) => <Body flows={flows} />}
    </LoadGate>
  );
}
