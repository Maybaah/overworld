import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from '../data/store';
import { FlowsTab } from './FlowsTab';
import { GenresTab } from './GenresTab';
import { PerCapitaTab } from './PerCapitaTab';
import { PublishersTab } from './PublishersTab';
import './insights.css';

const TABS = [
  { id: 'capita', label: 'Per capita', title: 'Games led per million people', Body: PerCapitaTab },
  { id: 'genres', label: 'Genres by region', title: 'Genres by region', Body: GenresTab },
  { id: 'publishers', label: 'Indie and major', title: 'Indie and major publishers over time', Body: PublishersTab },
  { id: 'flows', label: 'Where the work goes', title: 'Where the work goes', Body: FlowsTab },
] as const;

export function InsightsPanel() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(
    () => () => {
      const s = useStore.getState();
      s.setCountryShade(null);
      s.setExtras([], []);
    },
    [],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next = active;
    if (e.key === 'ArrowRight') next = (active + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (active + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };

  const tab = TABS[active]!;
  const Body = tab.Body;

  return (
    <section className="ow-panel ins" aria-label="Insights">
      <div className="ins-tabs" role="tablist" aria-label="Insights" onKeyDown={onKeyDown}>
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`ins-tab-${t.id}`}
            className="ins-tab"
            aria-selected={i === active}
            aria-controls={`ins-panel-${t.id}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="ins-body" role="tabpanel" id={`ins-panel-${tab.id}`} aria-labelledby={`ins-tab-${tab.id}`}>
        <h2 className="ow-title">{tab.title}</h2>
        <Body key={tab.id} />
      </div>
    </section>
  );
}
