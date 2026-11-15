import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { ROLE_GROUPS } from '../data/roles';
import { Swatch } from './parts';

export function Legend() {
  const enabledRoles = useStore((s) => s.enabledRoles);
  const detail = useStore((s) => s.selectedGameDetail);
  const toggleRole = useStore((s) => s.toggleRole);
  const [open, setOpen] = useState(false);

  const counts = useMemo(() => {
    if (!detail) return null;
    return ROLE_GROUPS.map((g) => {
      const ids = new Set<number>();
      for (const r of detail.roles) if (g.roles.includes(r.role)) ids.add(r.companyId);
      return ids.size;
    });
  }, [detail]);

  return (
    <section className="ow-panel ow-legend" data-open={open} aria-label="Role filters">
      <button
        type="button"
        className="ow-legend-toggle"
        aria-expanded={open}
        aria-controls="ow-legend-list"
        onClick={() => setOpen(!open)}
      >
        Roles
      </button>
      <ul id="ow-legend-list" className="ow-legend-list">
        {ROLE_GROUPS.map((g, i) => {
          const locked = g.id === 'lead_developer';
          const on = locked || g.roles.every((r) => enabledRoles.has(r));
          return (
            <li key={g.id}>
              <button
                type="button"
                className="ow-legend-row"
                aria-pressed={on}
                aria-disabled={locked || undefined}
                data-off={!on}
                onClick={() => {
                  if (locked) return;
                  for (const r of g.roles) if (enabledRoles.has(r) === on) toggleRole(r);
                }}
              >
                <Swatch color={g.color} off={!on} />
                <span className="ow-legend-label">{g.label}</span>
                {locked && <span className="ow-muted ow-legend-note">always on</span>}
                {counts && <span className="ow-mono ow-muted ow-legend-count">{counts[i]}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
