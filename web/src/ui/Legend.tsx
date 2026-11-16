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
                {locked && (
                  <svg className="ow-lock" width="12" height="12" viewBox="0 0 12 12" role="img" aria-label="Lead developer is always shown">
                    <title>Lead developer is always shown</title>
                    <rect x="2" y="5.5" width="8" height="5.5" rx="1.2" fill="currentColor" />
                    <path d="M4 5.5V4a2 2 0 014 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                )}
                {counts && <span className="ow-mono ow-muted ow-legend-count">{counts[i]}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
