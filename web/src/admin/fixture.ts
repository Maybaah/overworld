import type { AdminStats, Range, Ranked, SeriesRow } from './api';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 2 ** 32;
  };
}

function scale(rows: Ranked, f: number): Ranked {
  return rows.map(([k, n]) => [k, Math.max(1, Math.round(n * f))]);
}

const GAMES: Ranked = [
  ['The Witcher 3: Wild Hunt', 412],
  ['Half-Life', 388],
  ['Elden Ring', 341],
  ['Stardew Valley', 297],
  ['Minecraft', 281],
  ['Disco Elysium', 240],
  ['Hollow Knight', 221],
  ['Grand Theft Auto V', 204],
  ['S.T.A.L.K.E.R.: Shadow of Chernobyl', 188],
  ['Baldur’s Gate 3', 176],
  ['Tetris', 150],
  ['Hades', 139],
];

const SEARCHED: Ranked = [
  ['Minecraft', 160],
  ['Elden Ring', 151],
  ['Half-Life', 120],
  ['Cyberpunk 2077', 110],
  ['Hollow Knight', 82],
  ['Celeste', 74],
  ['Dota 2', 61],
  ['Factorio', 55],
];

const COUNTRIES_OPENED: Ranked = [
  ['Japan', 520],
  ['United States', 470],
  ['Poland', 302],
  ['Ukraine', 255],
  ['Sweden', 211],
  ['Canada', 190],
  ['France', 160],
  ['Finland', 121],
];

const CITIES: Ranked = [
  ['Tokyo, Japan', 310],
  ['Warsaw, Poland', 188],
  ['Kyiv, Ukraine', 142],
  ['Montreal, Canada', 131],
  ['Stockholm, Sweden', 98],
  ['Seattle, United States', 90],
];

const STUDIOS: Ranked = [
  ['CD Projekt Red', 120],
  ['Valve', 115],
  ['FromSoftware', 102],
  ['Nintendo EPD', 96],
  ['Supergiant Games', 61],
  ['4A Games', 44],
];

export function mockStats(range: Range, now = Date.now()): AdminStats {
  const hourly = range === '24h' || range === '7d';
  const thisHour = Math.floor(now / HOUR) * HOUR;
  const today = Math.floor(now / DAY) * DAY;
  const from = range === '24h' ? thisHour - 23 * HOUR : range === '7d' ? today - 6 * DAY : range === '30d' ? today - 29 * DAY : today - 120 * DAY;
  const step = hourly ? HOUR : DAY;
  const end = hourly ? thisHour : today;
  const rand = rng(range.length * 7919 + 17);
  const series: SeriesRow[] = [];
  for (let t = from; t <= end; t += step) {
    const hour = new Date(t).getUTCHours();
    const daily = hourly ? 0.35 + 0.65 * Math.max(0, Math.sin(((hour - 6) / 24) * Math.PI * 2) * 0.5 + 0.5) : 1;
    const growth = range === 'all' ? 0.3 + (0.7 * (t - from)) / (end - from || 1) : 1;
    const spike = !hourly && rand() > 0.93 ? 2.6 : 1;
    const tabs = Math.round((hourly ? 38 : 820) * daily * growth * spike * (0.8 + rand() * 0.4));
    series.push([
      t,
      tabs,
      Math.round(tabs * (1.6 + rand() * 0.5)),
      Math.round(tabs * (0.4 + rand() * 0.2)),
      Math.round(tabs * (0.05 + rand() * 0.03)),
      Math.round(tabs * (0.08 + rand() * 0.04)),
    ]);
  }
  const sum = (i: number) => series.reduce((s, r) => s + r[i]!, 0);
  const tabs = sum(1);
  const f = tabs / 2400;
  return {
    range,
    generatedAt: now,
    from,
    bucket: hourly ? 'hour' : 'day',
    totals: {
      session: tabs,
      game_open: sum(2),
      search: sum(3),
      share: sum(4),
      myglobe: sum(5),
      place_open: Math.round(tabs * 0.9),
      mode: Math.round(tabs * 0.7),
      year_play: Math.round(tabs * 0.12),
      insights_tab: Math.round(tabs * 0.3),
      ready: Math.round(tabs * 0.97),
      error: Math.round(tabs * 0.004),
    },
    series,
    top: {
      'game_open.title': scale(GAMES, f),
      'search.title': scale(SEARCHED, f),
      'place_open.country': scale(COUNTRIES_OPENED, f),
      'place_open.city': scale(CITIES, f),
      'place_open.company': scale(STUDIOS, f),
      'session.country': scale([['us', 640], ['de', 300], ['pl', 260], ['gb', 220], ['ua', 190], ['jp', 150], ['fr', 120], ['br', 90]], f),
      'session.device': scale([['desktop', 1500], ['phone', 780], ['tablet', 120]], f),
      'session.ref': scale([['news.ycombinator.com', 420], ['reddit.com', 380], ['t.co', 210], ['github.com', 140], ['google.com', 90]], f),
      'session.utm': scale([['newsletter / email / launch', 120], ['x / social', 60]], f),
      'session.entry': scale([['landing', 1700], ['game', 520], ['mode', 110], ['place', 70]], f),
      'reach.type': scale([['ready', 2330], ['game_open', 1650], ['place_open', 1300], ['mode', 1100], ['search', 800], ['insights_tab', 520], ['year_play', 260], ['myglobe', 210], ['share', 130], ['error', 9]], f),
      'mode.mode': scale([['insights', 760], ['myglobe', 520], ['explore', 400]], f),
      'insights_tab.tab': scale([['capita', 520], ['flows', 210], ['genres', 160], ['publishers', 110]], f),
      'share.action': scale([['copy_link', 90], ['download', 34], ['native', 28]], f),
      'share.kind': scale([['game', 110], ['myglobe', 42]], f),
      'myglobe.result': scale([['ok', 170], ['sample', 120], ['private_profile', 31], ['invalid_profile', 18], ['profile_not_found', 9], ['rate_limited', 2]], f),
      'ready.bucket': scale([['0-2 s', 610], ['2-4 s', 1120], ['4-8 s', 480], ['8-16 s', 110], ['16 s+', 20]], f),
    },
    recentErrors: [
      { t: now - 41 * 60_000, where: 'window', msg: 'WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost' },
      { t: now - 3 * HOUR, where: 'promise', msg: 'Failed to fetch [url]' },
      { t: now - 9 * HOUR, where: 'window', msg: "Cannot read properties of undefined (reading 'lat')" },
    ],
    rolledThrough: thisHour,
    maintAt: now - 7 * 60_000,
  };
}
