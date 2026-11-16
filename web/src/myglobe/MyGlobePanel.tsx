import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../data/store';
import { loadSteamMap } from '../data/loader';
import { countryName, formatCount } from '../ui/format';
import { computeOrigins, countryRows, sampleLibrary, type OwnedGame, type Origins } from './origins';
import { summarizeOrigins } from './share';
import { parseSteamInput } from './steamInput';
import './myglobe.css';

export { summaryToShareParams, shareParamsToSummary } from './share';

type ErrorCode =
  | 'invalid_profile'
  | 'profile_not_found'
  | 'private_profile'
  | 'steam_unavailable'
  | 'rate_limited'
  | 'not_configured'
  | 'network'
  | 'data_unavailable';

interface Failure {
  code: ErrorCode;
  reason?: string;
}

type View =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; failure: Failure }
  | { status: 'result'; origins: Origins; sample: boolean };

const KNOWN_CODES: ErrorCode[] = [
  'invalid_profile',
  'profile_not_found',
  'private_profile',
  'steam_unavailable',
  'rate_limited',
  'not_configured',
];

export function errorMessage(failure: Failure): string {
  switch (failure.code) {
    case 'invalid_profile':
      return failure.reason ?? 'That does not look like a Steam profile. Paste a profile link, a custom profile name or a SteamID64.';
    case 'profile_not_found':
      return 'No Steam profile was found with that name. Check the spelling, or paste the full profile link.';
    case 'private_profile':
      return 'This profile or its game list is private, so Steam shows us nothing. In Steam, open Edit profile, then Privacy settings, and set Game details to Public. Then try again.';
    case 'steam_unavailable':
      return 'Steam did not answer in time. Try again in a minute.';
    case 'rate_limited':
      return 'Too many requests right now. Wait a minute and try again.';
    case 'not_configured':
      return 'My globe is not connected to Steam on this server yet. You can still try a sample library.';
    case 'data_unavailable':
      return 'Overworld data is not loaded yet. Try again in a moment.';
    default:
      return 'Could not reach the Overworld server. Check your connection and try again.';
  }
}

function proxyBase(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return (env.VITE_STEAM_PROXY_URL ?? '').replace(/\/+$/, '');
}

function isOwnedGames(v: unknown): v is OwnedGame[] {
  return (
    Array.isArray(v) &&
    v.every((g) => typeof g === 'object' && g !== null && Number.isInteger((g as OwnedGame).appId) && typeof (g as OwnedGame).minutes === 'number')
  );
}

async function fetchOwned(profile: string): Promise<{ games: OwnedGame[] } | { failure: Failure }> {
  let res: Response;
  try {
    res = await fetch(`${proxyBase()}/api/steam/owned?profile=${encodeURIComponent(profile)}`);
  } catch {
    return { failure: { code: 'network' } };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const record = (typeof body === 'object' && body !== null ? body : {}) as { games?: unknown; error?: unknown; reason?: unknown };
  if (res.ok) {
    return isOwnedGames(record.games) ? { games: record.games } : { failure: { code: 'steam_unavailable' } };
  }
  const code = KNOWN_CODES.find((c) => c === record.error);
  if (code) return { failure: { code, reason: typeof record.reason === 'string' ? record.reason : undefined } };
  return { failure: { code: res.status >= 500 || res.status === 404 ? 'network' : 'steam_unavailable' } };
}

function shareText(origins: Origins, total: number): string {
  const s = summarizeOrigins(origins);
  const list = s.countries.map((c) => `${countryName(c.code)} ${c.percent}%`).join(', ');
  const lead = s.countries[0]
    ? `${s.countries[0].percent}% of my Steam games come from ${countryName(s.countries[0].code)}.`
    : 'I looked up where my Steam games come from.';
  const tail = `${formatCount(s.matched)} of ${formatCount(s.owned)} games found in Overworld's ${formatCount(total)}.`;
  return [lead, list ? `Top countries: ${list}.` : '', tail].filter(Boolean).join(' ');
}

function Bar({ percent }: { percent: number }) {
  return (
    <span className="omg-bar" aria-hidden="true">
      <span className="omg-bar-fill" style={{ width: `${percent}%` }} />
    </span>
  );
}

export function MyGlobePanel() {
  const indexes = useStore((s) => s.indexes);
  const setGameFilter = useStore((s) => s.setGameFilter);
  const selectPlace = useStore((s) => s.selectPlace);

  const [text, setText] = useState('');
  const [view, setView] = useState<View>({ status: 'idle' });
  const [by, setBy] = useState<'games' | 'playtime'>('games');
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  const run = useRef(0);
  const filtered = useRef(false);

  useEffect(
    () => () => {
      run.current++;
      if (filtered.current) useStore.getState().setGameFilter(null);
    },
    [],
  );

  const applyResult = (origins: Origins, sample: boolean) => {
    if (origins.gameIds.size > 0) {
      setGameFilter(origins.gameIds);
      filtered.current = true;
    } else {
      setGameFilter(null);
      filtered.current = false;
    }
    setCopied(null);
    setView({ status: 'result', origins, sample });
  };

  const fail = (failure: Failure) => {
    setGameFilter(null);
    filtered.current = false;
    setView({ status: 'error', failure });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (view.status === 'loading') return;
    const id = ++run.current;
    const parsed = parseSteamInput(text);
    if (parsed.kind === 'invalid') {
      fail({ code: 'invalid_profile', reason: parsed.reason });
      return;
    }
    if (!indexes) {
      fail({ code: 'data_unavailable' });
      return;
    }
    setView({ status: 'loading' });
    const profile = parsed.kind === 'steamid' ? parsed.id : parsed.name;
    const [owned, map] = await Promise.all([fetchOwned(profile), loadSteamMap().catch(() => null)]);
    if (id !== run.current) return;
    if ('failure' in owned) return fail(owned.failure);
    if (!map) return fail({ code: 'data_unavailable' });
    applyResult(computeOrigins(owned.games, map, indexes), false);
  };

  const trySample = async () => {
    if (view.status === 'loading') return;
    const id = ++run.current;
    if (!indexes) {
      fail({ code: 'data_unavailable' });
      return;
    }
    setView({ status: 'loading' });
    const map = await loadSteamMap().catch(() => null);
    if (id !== run.current) return;
    if (!map) return fail({ code: 'data_unavailable' });
    const library = sampleLibrary(map, indexes, 60);
    if (library.length === 0) return fail({ code: 'data_unavailable' });
    applyResult(computeOrigins(library, map, indexes), true);
  };

  const clear = () => {
    run.current++;
    setGameFilter(null);
    filtered.current = false;
    selectPlace(null);
    setView({ status: 'idle' });
  };

  const total = indexes?.games.length ?? 0;
  const origins = view.status === 'result' ? view.origins : null;
  const rows = useMemo(() => (origins ? countryRows(origins, by, 8) : null), [origins, by]);
  const text_ = useMemo(() => (origins ? shareText(origins, total) : ''), [origins, total]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text_);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };

  const busy = view.status === 'loading';

  return (
    <aside className="ow-panel omg" aria-label="My globe">
      <div className="ow-panel-head">
        <div className="ow-card-title">
          <h2 className="ow-title">My globe</h2>
          <p className="ow-muted">See where the games you own were made.</p>
        </div>
      </div>
      <div className="ow-panel-body">
        <form className="omg-form" onSubmit={(e) => void submit(e)}>
          <label className="omg-label" htmlFor="omg-profile">
            Steam profile
          </label>
          <input
            id="omg-profile"
            className="omg-input"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-describedby="omg-hint"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
          <p id="omg-hint" className="ow-muted ow-small">
            A profile link such as steamcommunity.com/id/yourname, a custom profile name, or a 17-digit SteamID64. Your game details must be public.
          </p>
          <div className="omg-actions">
            <button type="submit" className="omg-primary" disabled={busy}>
              Show my globe
            </button>
            <button type="button" className="ow-more-btn omg-secondary" onClick={() => void trySample()} disabled={busy}>
              Try a sample library
            </button>
          </div>
        </form>

        <div role="status" aria-live="polite" className="omg-status">
          {view.status === 'loading' && <p className="ow-muted">Loading your library…</p>}
        </div>

        {view.status === 'error' && (
          <div role="alert" className="ow-error">
            <p>{errorMessage(view.failure)}</p>
          </div>
        )}

        {origins && rows && (
          <>
            {view.status === 'result' && view.sample && (
              <p className="ow-muted ow-small">This is a sample library built from popular games, not a real profile.</p>
            )}
            <section aria-label="Summary">
              <p className="omg-headline">
                {rows.rows[0]
                  ? `${rows.rows[0].percent}% of your games come from ${countryName(rows.rows[0].code)}`
                  : origins.matched === 0
                    ? 'None of your games were found in Overworld'
                    : 'None of your games have a known studio location'}
              </p>
              <p className="ow-muted">
                <span className="ow-mono">{formatCount(origins.matched)}</span> of <span className="ow-mono">{formatCount(origins.owned)}</span> games found in Overworld&apos;s{' '}
                <span className="ow-mono">{formatCount(total)}</span>
              </p>
              {origins.unknownLocation > 0 && (
                <p className="ow-muted ow-small">
                  {formatCount(origins.unknownLocation)} found {origins.unknownLocation === 1 ? 'game has' : 'games have'} no known studio location and{' '}
                  {origins.unknownLocation === 1 ? 'is' : 'are'} left out of the percentages.
                </p>
              )}
            </section>

            {rows.rows.length > 0 && (
              <section>
                <div className="omg-section-head">
                  <h3 className="ow-subtitle">Countries</h3>
                  <div className="omg-toggle" role="group" aria-label="Rank countries by">
                    <button type="button" aria-pressed={by === 'games'} onClick={() => setBy('games')}>
                      By games
                    </button>
                    <button type="button" aria-pressed={by === 'playtime'} onClick={() => setBy('playtime')}>
                      By playtime
                    </button>
                  </div>
                </div>
                <ul className="ow-list" aria-label="Countries">
                  {rows.rows.map((r) => (
                    <li key={r.code}>
                      <button type="button" className="omg-row" onClick={() => selectPlace({ level: 'country', key: r.code! })}>
                        <span className="omg-row-top">
                          <span className="ow-link-btn">{countryName(r.code)}</span>
                          <span className="ow-mono ow-muted">
                            {r.percent}% · {formatCount(r.games)}
                          </span>
                        </span>
                        <Bar percent={r.percent} />
                      </button>
                    </li>
                  ))}
                  {rows.other && (
                    <li>
                      <div className="omg-row omg-row-static">
                        <span className="omg-row-top">
                          <span className="ow-muted">Other ({rows.other.countries})</span>
                          <span className="ow-mono ow-muted">
                            {rows.other.percent}% · {formatCount(rows.other.games)}
                          </span>
                        </span>
                        <Bar percent={rows.other.percent} />
                      </div>
                    </li>
                  )}
                </ul>
              </section>
            )}

            {origins.byCity.length > 0 && (
              <section>
                <h3 className="ow-subtitle">Top cities</h3>
                <ul className="ow-list" aria-label="Top cities">
                  {origins.byCity.map((c) => (
                    <li key={c.key} className="ow-row-inline">
                      <button type="button" className="ow-link-btn" onClick={() => selectPlace({ level: 'city', key: c.key })}>
                        {c.name}, {countryName(c.country)}
                      </button>
                      <span className="ow-mono ow-muted">{formatCount(c.games)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {origins.byStudio.length > 0 && (
              <section>
                <h3 className="ow-subtitle">Top studios</h3>
                <ul className="ow-list" aria-label="Top studios">
                  {origins.byStudio.map((s) => (
                    <li key={s.companyId} className="ow-row-inline">
                      <button type="button" className="ow-link-btn" onClick={() => selectPlace({ level: 'company', key: s.companyId })}>
                        {s.name}
                      </button>
                      <span className="ow-mono ow-muted">{formatCount(s.games)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-label="Share">
              <h3 className="ow-subtitle">Share</h3>
              <textarea className="omg-share" readOnly rows={4} value={text_} aria-label="Summary to copy" onFocus={(e) => e.currentTarget.select()} />
              <div className="omg-actions">
                <button type="button" className="ow-more-btn" onClick={() => void copy()}>
                  Copy text
                </button>
                <span className="ow-muted ow-small" role="status">
                  {copied === 'done' ? 'Copied.' : copied === 'failed' ? 'Could not copy. Select the text and copy it.' : ''}
                </span>
              </div>
            </section>

            <button type="button" className="ow-more-btn omg-clear" onClick={clear}>
              Clear
            </button>
          </>
        )}

        <div className="omg-footer">
          <p className="ow-muted ow-small">Nothing is stored: your profile and library are used only to build this view.</p>
          <p className="ow-muted ow-small">Game library data from Steam. Overworld is not affiliated with Valve or Steam.</p>
        </div>
      </div>
    </aside>
  );
}
