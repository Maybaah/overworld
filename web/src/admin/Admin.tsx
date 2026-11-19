import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { countryName, formatCount } from '../ui/format';
import { ActivityChart, RankList } from './charts';
import {
  RANGES,
  currentSession,
  fetchStats,
  onSessionChange,
  sendMagicLink,
  signOut,
  supabase,
  takeAuthError,
  type AdminStats,
  type Range,
  type Ranked,
} from './api';
import { mockStats } from './fixture';

const RANGE_LABEL: Record<Range, string> = { '24h': '24 hours', '7d': '7 days', '30d': '30 days', all: 'All time' };

const METRICS = [
  { id: 1, label: 'Tabs' },
  { id: 2, label: 'Game opens' },
  { id: 3, label: 'Searches' },
  { id: 4, label: 'Shares' },
  { id: 5, label: 'My globe lookups' },
] as const;

const EVENT_NAME: Record<string, string> = {
  ready: 'Saw the globe',
  game_open: 'Opened a game',
  place_open: 'Opened a place',
  mode: 'Switched mode',
  search: 'Searched',
  insights_tab: 'Read Insights',
  year_play: 'Played the years',
  myglobe: 'Tried My globe',
  share: 'Shared',
  error: 'Hit an error',
};

const NAMES: Record<string, Record<string, string>> = {
  device: { desktop: 'Desktop', phone: 'Phone', tablet: 'Tablet' },
  entry: { landing: 'Home page', game: 'Game link', place: 'Place link', mode: 'Mode link', share: 'Share page' },
  mode: { explore: 'Explore', guess: 'Guess', myglobe: 'My globe', insights: 'Insights' },
  tab: { capita: 'Per capita', genres: 'Genres by region', publishers: 'Indie and major', flows: 'Where the work goes' },
  action: { copy_link: 'Copy link', download: 'Download image', native: 'System share' },
  kind: { game: 'A game', myglobe: 'My globe', guess: 'Guess result' },
  result: {
    ok: 'Profile loaded',
    sample: 'Sample library',
    invalid_profile: 'Invalid input',
    profile_not_found: 'Profile not found',
    private_profile: 'Private profile',
    steam_unavailable: 'Steam unavailable',
    rate_limited: 'Rate limited',
    not_configured: 'Proxy not configured',
    network: 'Network error',
    data_unavailable: 'Data unavailable',
  },
};

const READY_ORDER = ['0-2 s', '2-4 s', '4-8 s', '8-16 s', '16 s+'];

const named = (group: string) => (k: string) => NAMES[group]?.[k] ?? k;

function sortedBuckets(rows: Ranked | undefined): Ranked {
  const m = new Map(rows ?? []);
  return READY_ORDER.filter((k) => m.has(k)).map((k) => [k, m.get(k)!]);
}

function ago(t: number | null, now: number): string {
  if (t === null) return 'never';
  const m = Math.round((now - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

type Auth = { kind: 'loading' } | { kind: 'mock' } | { kind: 'unconfigured' } | { kind: 'signedOut' } | { kind: 'signedIn'; session: Session };

export function Admin() {
  const mock = useMemo(() => new URLSearchParams(location.search).get('mock') === '1', []);
  const [auth, setAuth] = useState<Auth>(() => (mock ? { kind: 'mock' } : supabase() ? { kind: 'loading' } : { kind: 'unconfigured' }));
  const [authError] = useState(() => (mock ? null : takeAuthError()));

  useEffect(() => {
    if (mock || !supabase()) return;
    let live = true;
    void currentSession().then((session) => {
      if (live) setAuth(session ? { kind: 'signedIn', session } : { kind: 'signedOut' });
    });
    const off = onSessionChange((session) => setAuth(session ? { kind: 'signedIn', session } : { kind: 'signedOut' }));
    return () => {
      live = false;
      off();
    };
  }, [mock]);

  if (auth.kind === 'loading') return <Shell><p className="adm-muted">Loading…</p></Shell>;
  if (auth.kind === 'unconfigured') return <Unconfigured />;
  if (auth.kind === 'signedOut') return <SignIn error={authError} />;
  return <Dashboard mock={auth.kind === 'mock'} email={auth.kind === 'signedIn' ? auth.session.user.email : undefined} />;
}

function Shell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="adm">
      <header className="adm-head">
        <h1 className="adm-title">
          Overworld <span className="adm-muted">stats</span>
        </h1>
        {actions}
      </header>
      {children}
    </div>
  );
}

function Unconfigured() {
  return (
    <Shell>
      <section className="adm-card adm-narrow">
        <h2 className="adm-h2">No backend configured</h2>
        <p>
          This build has no Supabase project. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> and rebuild. The steps are in{' '}
          <code>docs/SELF-HOSTING.md</code>.
        </p>
        <p>
          <a className="adm-link" href="?mock=1">
            Open with sample data
          </a>
        </p>
      </section>
    </Shell>
  );
}

function SignIn({ error }: { error: string | null }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' } | { kind: 'error'; message: string }>(
    error ? { kind: 'error', message: error } : { kind: 'idle' },
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      setState({ kind: 'error', message: 'Enter an email address.' });
      return;
    }
    setState({ kind: 'sending' });
    const failure = await sendMagicLink(address);
    setState(failure ? { kind: 'error', message: failure } : { kind: 'sent' });
  };

  return (
    <Shell>
      <form className="adm-card adm-narrow" onSubmit={(e) => void submit(e)}>
        <h2 className="adm-h2">Sign in</h2>
        <p className="adm-muted">Only addresses on the admin list can read the stats. A sign-in link is sent by email.</p>
        <label className="adm-label" htmlFor="adm-email">
          Email
        </label>
        <input
          id="adm-email"
          className="adm-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state.kind === 'sending'}
        />
        <button type="submit" className="adm-btn adm-btn-primary" disabled={state.kind === 'sending'}>
          {state.kind === 'sending' ? 'Sending…' : 'Send sign-in link'}
        </button>
        <p className="adm-status" role="status">
          {state.kind === 'sent' ? 'Check your inbox and open the link on this device.' : state.kind === 'error' ? state.message : ''}
        </p>
      </form>
    </Shell>
  );
}

type Load = { kind: 'loading' } | { kind: 'ready'; stats: AdminStats } | { kind: 'denied' } | { kind: 'error'; message: string };

function Dashboard({ mock, email }: { mock: boolean; email?: string }) {
  const [range, setRange] = useState<Range>('7d');
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [seq, setSeq] = useState(0);

  const refresh = useCallback(() => setSeq((s) => s + 1), []);

  useEffect(() => {
    let live = true;
    setLoad((l) => (l.kind === 'ready' ? l : { kind: 'loading' }));
    if (mock) {
      setLoad({ kind: 'ready', stats: mockStats(range) });
      return;
    }
    void fetchStats(range).then((r) => {
      if (!live) return;
      if (r.ok) setLoad({ kind: 'ready', stats: r.stats });
      else setLoad(r.denied ? { kind: 'denied' } : { kind: 'error', message: r.message });
    });
    return () => {
      live = false;
    };
  }, [range, seq, mock]);

  useEffect(() => {
    if (mock) return;
    const id = setInterval(refresh, 5 * 60_000);
    return () => clearInterval(id);
  }, [mock, refresh]);

  const actions = (
    <div className="adm-actions">
      <div className="adm-seg" role="group" aria-label="Range">
        {RANGES.map((r) => (
          <button key={r} type="button" className="adm-seg-btn" aria-pressed={range === r} onClick={() => setRange(r)}>
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>
      <button type="button" className="adm-btn" onClick={refresh} disabled={mock}>
        Refresh
      </button>
      {!mock && (
        <button type="button" className="adm-btn" onClick={() => void signOut()} title={email}>
          Sign out
        </button>
      )}
    </div>
  );

  return (
    <Shell actions={actions}>
      {mock && <p className="adm-banner">Sample data. Nothing here is real.</p>}
      {load.kind === 'loading' && <p className="adm-muted">Loading stats…</p>}
      {load.kind === 'denied' && (
        <section className="adm-card adm-narrow">
          <h2 className="adm-h2">Not an admin</h2>
          <p>{email ?? 'This account'} is signed in but is not on the admin list.</p>
        </section>
      )}
      {load.kind === 'error' && (
        <section className="adm-card adm-narrow">
          <h2 className="adm-h2">Could not load the stats</h2>
          <p className="adm-muted">{load.message}</p>
        </section>
      )}
      {load.kind === 'ready' && <StatsView stats={load.stats} />}
    </Shell>
  );
}

function StatsView({ stats }: { stats: AdminStats }) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]>(METRICS[0]);
  const t = (k: string) => stats.totals[k] ?? 0;
  const tabs = t('session');
  const per = (k: string) => (tabs > 0 ? (t(k) / tabs).toFixed(1) : '–');
  const top = stats.top;
  const points = stats.series.map((r) => [r[0], r[metric.id]] as [number, number]);
  const reach = (top['reach.type'] ?? []).filter(([k]) => k !== 'error');

  const kpis = [
    { label: 'Tabs', value: tabs, note: `${stats.bucket === 'hour' ? 'hourly' : 'daily'} below` },
    { label: 'Game opens', value: t('game_open'), note: `${per('game_open')} per tab` },
    { label: 'Searches', value: t('search'), note: `${per('search')} per tab` },
    { label: 'Places opened', value: t('place_open'), note: `${per('place_open')} per tab` },
    { label: 'Shares', value: t('share'), note: `${per('share')} per tab` },
    { label: 'My globe lookups', value: t('myglobe'), note: `${per('myglobe')} per tab` },
    { label: 'Errors', value: t('error'), note: tabs > 0 ? `${((t('error') / tabs) * 100).toFixed(1)}% of tabs` : '–' },
  ];

  return (
    <>
      <section className="adm-kpis" aria-label="Totals">
        {kpis.map((k) => (
          <div key={k.label} className="adm-kpi">
            <span className="adm-kpi-label">{k.label}</span>
            <span className="adm-kpi-value">{formatCount(k.value)}</span>
            <span className="adm-kpi-note">{k.note}</span>
          </div>
        ))}
      </section>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2 className="adm-h2">{metric.label}</h2>
          <div className="adm-seg adm-seg-sm" role="group" aria-label="Measure">
            {METRICS.map((m) => (
              <button key={m.id} type="button" className="adm-seg-btn" aria-pressed={metric.id === m.id} onClick={() => setMetric(m)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <ActivityChart points={points} bucket={stats.bucket} label={metric.label} />
      </section>

      <div className="adm-grid">
        <Card title="What tabs did" note="Share of tabs">
          <RankList label="What tabs did" rows={reach} total={tabs} name={(k) => EVENT_NAME[k] ?? k} />
        </Card>
        <Card title="Load time" note="Until the globe showed">
          <RankList label="Load time" rows={sortedBuckets(top['ready.bucket'])} total={t('ready')} />
        </Card>
        <Card title="Games opened">
          <RankList label="Games opened" rows={top['game_open.title']} limit={12} />
        </Card>
        <Card title="Games found by search">
          <RankList label="Games found by search" rows={top['search.title']} limit={12} />
        </Card>
        <Card title="Countries opened">
          <RankList label="Countries opened" rows={top['place_open.country']} />
        </Card>
        <Card title="Cities opened">
          <RankList label="Cities opened" rows={top['place_open.city']} />
        </Card>
        <Card title="Studios opened">
          <RankList label="Studios opened" rows={top['place_open.company']} />
        </Card>
        <Card title="Visitors by country" note="From the edge, never the IP">
          <RankList label="Visitors by country" rows={top['session.country']} total={tabs} name={(k) => countryName(k.toUpperCase())} />
        </Card>
        <Card title="Referrers">
          <RankList label="Referrers" rows={top['session.ref']} total={tabs} empty="No referrers yet." />
        </Card>
        <Card title="Campaigns" note="UTM source / medium / campaign">
          <RankList label="Campaigns" rows={top['session.utm']} total={tabs} empty="No tagged links yet." />
        </Card>
        <Card title="Arrived at">
          <RankList label="Arrived at" rows={top['session.entry']} total={tabs} name={named('entry')} />
        </Card>
        <Card title="Devices">
          <RankList label="Devices" rows={top['session.device']} total={tabs} name={named('device')} />
        </Card>
        <Card title="Modes opened">
          <RankList label="Modes opened" rows={top['mode.mode']} name={named('mode')} />
        </Card>
        <Card title="Insights tabs">
          <RankList label="Insights tabs" rows={top['insights_tab.tab']} name={named('tab')} />
        </Card>
        <Card title="Shares">
          <RankList label="Share actions" rows={top['share.action']} total={t('share')} name={named('action')} />
          <RankList label="What was shared" rows={top['share.kind']} total={t('share')} name={named('kind')} />
        </Card>
        <Card title="My globe outcomes">
          <RankList label="My globe outcomes" rows={top['myglobe.result']} total={t('myglobe')} name={named('result')} />
        </Card>
      </div>

      <section className="adm-card">
        <h2 className="adm-h2">Recent errors</h2>
        {stats.recentErrors.length === 0 ? (
          <p className="adm-empty">No errors in this range.</p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Where</th>
                <th scope="col">Message</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentErrors.map((e, i) => (
                <tr key={`${e.t}-${i}`}>
                  <td className="adm-nowrap">{new Date(e.t).toLocaleString()}</td>
                  <td>{e.where ?? '–'}</td>
                  <td className="adm-mono">{e.msg ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="adm-foot adm-muted">
        Computed {ago(stats.generatedAt, Date.now())}. Hourly totals rolled through {stats.rolledThrough ? new Date(stats.rolledThrough).toLocaleString() : '–'}. Maintenance ran{' '}
        {ago(stats.maintAt, Date.now())}. Raw events are deleted after 48 hours.
      </footer>
    </>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="adm-card">
      <div className="adm-card-head">
        <h2 className="adm-h2">{title}</h2>
        {note && <span className="adm-muted adm-small">{note}</span>}
      </div>
      {children}
    </section>
  );
}
