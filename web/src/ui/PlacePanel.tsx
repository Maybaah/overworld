import { useEffect, useMemo, useState } from 'react';
import type { Company } from '@shared';
import { useStore } from '../data/store';
import { loadCompanyGames, type CompanyGameEntry } from '../data/loader';
import { ROLE_META } from '../data/roles';
import { CloseButton, LimitedList, LinkButton, SourceLink } from './parts';
import { countryName, formatCount, placeLabel } from './format';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ow-stat">
      <dt className="ow-muted">{label}</dt>
      <dd className="ow-mono">{typeof value === 'number' ? formatCount(value) : value}</dd>
    </div>
  );
}

export function PlacePanel() {
  const place = useStore((s) => s.selectedPlace);
  const indexes = useStore((s) => s.indexes);
  const timeline = useStore((s) => s.timeline);
  const year = useStore((s) => s.year);
  const selectPlace = useStore((s) => s.selectPlace);

  if (!place || !indexes || !timeline) return null;

  const companyLink = (c: Company) => (
    <li key={c.id} className="ow-row ow-row-inline">
      <LinkButton onClick={() => selectPlace({ level: 'company', key: c.id })}>{c.name}</LinkButton>
      <span className="ow-mono ow-muted">{formatCount(timeline.countAt('company', c.id, year))}</span>
    </li>
  );

  const studiosByLeads = (ids: number[]) =>
    ids
      .map((id) => indexes.companyById.get(id))
      .filter((c): c is Company => !!c)
      .map((c) => ({ c, n: timeline.countAt('company', c.id, year) }))
      .sort((a, b) => b.n - a.n || a.c.name.localeCompare(b.c.name))
      .map((x) => x.c);

  let title = '';
  let body = null;
  const bodyKey = `${place.level}:${place.key}`;

  if (place.level === 'country') {
    const code = String(place.key);
    const entry = indexes.countries.find((c) => c.code === code);
    title = countryName(code);
    const cities = indexes.cities
      .filter((c) => c.country === code)
      .map((c) => ({ c, n: timeline.countAt('city', c.key, year) }))
      .sort((a, b) => b.n - a.n || a.c.name.localeCompare(b.c.name));
    const studios = studiosByLeads(entry?.companyIds ?? []);
    body = (
      <>
        <dl className="ow-stats">
          <Stat label="Studios" value={studios.length} />
          <Stat label={`Games led by ${year}`} value={timeline.countAt('country', code, year)} />
        </dl>
        {cities.length > 0 && (
          <section>
            <h3 className="ow-subtitle">Cities</h3>
            <LimitedList
              label="Cities"
              items={cities}
              render={({ c, n }) => (
                <li key={c.key} className="ow-row ow-row-inline">
                  <LinkButton onClick={() => selectPlace({ level: 'city', key: c.key })}>{c.name}</LinkButton>
                  <span className="ow-mono ow-muted">{formatCount(n)}</span>
                </li>
              )}
            />
          </section>
        )}
        <section>
          <h3 className="ow-subtitle">Top studios</h3>
          {studios.length === 0 ? (
            <p className="ow-muted">No studios here.</p>
          ) : (
            <LimitedList label="Studios" items={studios} render={companyLink} />
          )}
        </section>
      </>
    );
  } else if (place.level === 'city') {
    const city = indexes.cities.find((c) => c.key === String(place.key));
    title = city?.name ?? 'Unknown city';
    const studios = studiosByLeads(city?.companyIds ?? []);
    body = (
      <>
        <p className="ow-muted">{city ? countryName(city.country) : ''}</p>
        <dl className="ow-stats">
          <Stat label="Studios" value={studios.length} />
          <Stat label={`Games led by ${year}`} value={city ? timeline.countAt('city', city.key, year) : 0} />
        </dl>
        <section>
          <h3 className="ow-subtitle">Studios</h3>
          {studios.length === 0 ? (
            <p className="ow-muted">No studios here.</p>
          ) : (
            <LimitedList label="Studios" items={studios} render={companyLink} />
          )}
        </section>
      </>
    );
  } else {
    const company = indexes.companyById.get(Number(place.key));
    title = company?.name ?? 'Unknown company';
    body = company ? <CompanyBody company={company} /> : <p className="ow-muted">Company not found.</p>;
  }

  return (
    <aside key={title} className="ow-panel ow-place" aria-label={`Place: ${title}`}>
      <div className="ow-panel-head">
        <div className="ow-card-title">
          <h2 className="ow-title">{title}</h2>
        </div>
        <CloseButton label="Close place" onClick={() => selectPlace(null)} />
      </div>
      <div className="ow-panel-body" key={bodyKey}>
        {body}
      </div>
    </aside>
  );
}

function CompanyBody({ company }: { company: Company }) {
  const indexes = useStore((s) => s.indexes)!;
  const selectPlace = useStore((s) => s.selectPlace);
  const selectGame = useStore((s) => s.selectGame);
  const [others, setOthers] = useState<Map<number, CompanyGameEntry[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    loadCompanyGames().then(
      (map) => {
        if (live) setOthers(map);
      },
      (err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const parent = company.parentId !== null ? indexes.companyById.get(company.parentId) : undefined;
  const led = indexes.gamesByLeadCompany.get(company.id) ?? [];

  const otherWork = useMemo(() => {
    if (!others) return null;
    const byGame = new Map<number, string[]>();
    for (const e of others.get(company.id) ?? []) {
      if (e.role === 'lead_developer') continue;
      const labels = byGame.get(e.gameId);
      const label = ROLE_META[e.role].label;
      if (labels) {
        if (!labels.includes(label)) labels.push(label);
      } else byGame.set(e.gameId, [label]);
    }
    const rows: { id: number; name: string; year: number | null; roles: string }[] = [];
    for (const [id, labels] of byGame) {
      const g = indexes.gameById.get(id);
      if (g) rows.push({ id, name: g.name, year: g.year, roles: labels.join(', ') });
    }
    return rows;
  }, [others, company.id, indexes]);

  return (
    <>
      <div>
        <p className="ow-muted">{placeLabel(company)}</p>
        {company.locationSource && (
          <p className="ow-muted ow-small">
            Location from <SourceLink source={company.locationSource} />
          </p>
        )}
      </div>
      <dl className="ow-stats">
        {company.founded !== null && <Stat label="Founded" value={String(company.founded)} />}
        <Stat label="Games led" value={company.leadCount} />
        <Stat label="Games involved in" value={company.gameCount} />
      </dl>
      {parent && (
        <p>
          <span className="ow-muted">Parent company: </span>
          <LinkButton onClick={() => selectPlace({ level: 'company', key: parent.id })}>{parent.name}</LinkButton>
        </p>
      )}
      <section>
        <h3 className="ow-subtitle">Games led</h3>
        {led.length === 0 ? (
          <p className="ow-muted">No games led.</p>
        ) : (
          <LimitedList
            label="Games led"
            items={led}
            render={(g) => (
              <li key={g.id} className="ow-row ow-row-inline">
                <LinkButton onClick={() => void selectGame(g.id)}>{g.name}</LinkButton>
                <span className="ow-mono ow-muted">{g.year ?? 'n/a'}</span>
              </li>
            )}
          />
        )}
      </section>
      <section>
        <h3 className="ow-subtitle">Other work</h3>
        {error ? (
          <div role="alert" className="ow-error">
            <p>Could not load other work: {error}</p>
            <button type="button" className="ow-more-btn" onClick={() => setAttempt(attempt + 1)}>
              Try again
            </button>
          </div>
        ) : otherWork === null ? (
          <p className="ow-muted" role="status">
            Loading…
          </p>
        ) : otherWork.length === 0 ? (
          <p className="ow-muted">No other roles recorded.</p>
        ) : (
          <LimitedList
            label="Other work"
            items={otherWork}
            render={(r) => (
              <li key={r.id} className="ow-row">
                <div className="ow-row-main">
                  <LinkButton onClick={() => void selectGame(r.id)}>{r.name}</LinkButton>
                  <span className="ow-mono ow-muted">{r.year ?? 'n/a'}</span>
                </div>
                <div className="ow-muted ow-small">{r.roles}</div>
              </li>
            )}
          />
        )}
      </section>
    </>
  );
}
