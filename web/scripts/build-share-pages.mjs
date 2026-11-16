import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const IGDB = 'https://images.igdb.com/igdb/image/upload/t_720p/';
const SITE_NAME = 'Overworld';
const GENERIC = {
  guess: {
    title: 'Overworld guess mode: where was it made?',
    description: 'Guess where five video games were made and compare your score. Overworld shows where games are made on a 3D globe.',
  },
  myglobe: {
    title: 'My globe on Overworld: where my games come from',
    description: 'See which countries the games in a Steam library come from. Overworld shows where video games are made on a 3D globe.',
  },
};

export const HEADER_NOTE =
  'Previews for games are generated per game. Previews for guess results and My globe summaries are generic: a static site cannot render them per result.';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function scriptString(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function normaliseBasePath(base) {
  let b = base && base.trim() !== '' ? base.trim() : '/';
  if (!b.startsWith('/')) b = `/${b}`;
  return b.endsWith('/') ? b : `${b}/`;
}

export function resolveSite(env = {}) {
  const raw = (env.SITE_URL ?? '').trim();
  let siteUrl = null;
  let sitePath = null;
  if (raw !== '') {
    try {
      const u = new URL(raw);
      siteUrl = `${u.origin}${normaliseBasePath(u.pathname)}`;
      sitePath = normaliseBasePath(u.pathname);
    } catch {
      siteUrl = null;
    }
  }
  const basePath = normaliseBasePath(env.VITE_BASE ?? sitePath ?? '/');
  return { siteUrl, basePath };
}

export function absoluteUrl(site, relative) {
  const rel = relative.replace(/^\/+/, '');
  return site.siteUrl ? `${site.siteUrl}${rel}` : `${site.basePath}${rel}`;
}

let regionNames;
export function countryName(code) {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

function placeOf(company) {
  if (!company || !company.country) return null;
  const country = countryName(company.country);
  return company.city ? `${company.city}, ${country}` : country;
}

export function gameTitle(game, lead) {
  const year = game.year !== null && game.year !== undefined ? ` (${game.year})` : '';
  const place = placeOf(lead);
  return `${game.name}${year}${place ? ` — made in ${place}` : ''}`;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function gameDescription(lead, detail, companyById, leadCompanyId) {
  const others = new Set();
  const countries = new Set();
  for (const r of detail?.roles ?? []) {
    if (r.companyId === leadCompanyId || others.has(r.companyId)) continue;
    others.add(r.companyId);
    const country = companyById.get(r.companyId)?.country;
    if (country) countries.add(country);
  }
  const parts = [];
  if (lead) parts.push(`Lead studio: ${lead.name}.`);
  if (others.size > 0) {
    const noun = others.size === 1 ? (lead ? 'other company' : 'company') : lead ? 'other companies' : 'companies';
    const where = countries.size > 0 ? ` in ${plural(countries.size, 'country', 'countries')}` : '';
    parts.push(`${others.size} ${noun}${where} worked on it.`);
  }
  return parts.length > 0 ? parts.join(' ') : 'See where this game was made on Overworld.';
}

export function gameImage(game, detail, site) {
  const shot = detail?.screenshots?.find((s) => typeof s === 'string' && s !== '');
  if (shot) return `${IGDB}${shot}.jpg`;
  if (game.cover) return `${IGDB}${game.cover}.jpg`;
  return absoluteUrl(site, 'og-default.png');
}

function head({ title, description, canonical, image, redirect }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const lines = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
  ];
  if (redirect) lines.push(redirect);
  return lines.join('\n');
}

export function renderGamePage({ game, lead, detail, companyById }, site) {
  const title = gameTitle(game, lead);
  const target = `${site.basePath}?game=${game.id}`;
  const body = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    head({
      title,
      description: gameDescription(lead, detail, companyById, game.leadCompanyId),
      canonical: absoluteUrl(site, `g/${game.id}/`),
      image: gameImage(game, detail, site),
      redirect: `<meta http-equiv="refresh" content="0;url=${escapeHtml(target)}">`,
    }),
    '</head>',
    '<body>',
    `<script>location.replace(${scriptString(target)});</script>`,
    `<p><a href="${escapeHtml(target)}">Open ${escapeHtml(game.name)} on Overworld</a></p>`,
    '</body>',
    '</html>',
    '',
  ];
  return body.join('\n');
}

export function renderGenericPage(kind, site) {
  const info = GENERIC[kind];
  const target = site.basePath;
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    head({
      title: info.title,
      description: info.description,
      canonical: absoluteUrl(site, `share/${kind}/`),
      image: absoluteUrl(site, 'og-default.png'),
      redirect: null,
    }),
    `<noscript><meta http-equiv="refresh" content="0;url=${escapeHtml(target)}"></noscript>`,
    '</head>',
    '<body>',
    `<script>location.replace(${scriptString(target)} + location.search + location.hash);</script>`,
    `<p><a href="${escapeHtml(target)}">Open Overworld</a></p>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function loadData(dataDir) {
  const games = await readJson(path.join(dataDir, 'games.json'));
  const companies = await readJson(path.join(dataDir, 'companies.json'));
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const details = new Map();
  const detailsDir = path.join(dataDir, 'details');
  if (existsSync(detailsDir)) {
    for (const name of await readdir(detailsDir)) {
      if (!name.endsWith('.json')) continue;
      for (const d of await readJson(path.join(detailsDir, name))) details.set(d.id, d);
    }
  }
  return { games, companyById, details };
}

// Keep in sync with SHARE_PAGE_LIMIT in src/share/urlState.ts.
const SHARE_PAGE_LIMIT = 10_000;

export async function buildSharePages({ distDir, env = process.env, log = console.log }) {
  log(`Share pages: ${HEADER_NOTE}`);
  const dataDir = path.join(distDir, 'data');
  if (!existsSync(path.join(dataDir, 'games.json'))) {
    log(`Share pages skipped: no data folder at ${dataDir}`);
    return { written: 0, bytes: 0 };
  }
  const site = resolveSite(env);
  if (!site.siteUrl) {
    log('Warning: SITE_URL is not set. Link previews need absolute URLs, so social sites will not show images or titles until it is set (for example https://user.github.io/overworld).');
  }
  const { games, companyById, details } = await loadData(dataDir);
  let written = 0;
  let bytes = 0;
  const put = async (rel, html) => {
    const file = path.join(distDir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, html);
    written += 1;
    bytes += Buffer.byteLength(html);
  };
  // games.json is in popularity order; pages beyond the limit would only add hundreds of megabytes.
  for (const game of games.slice(0, SHARE_PAGE_LIMIT)) {
    const html = renderGamePage({ game, lead: companyById.get(game.leadCompanyId), detail: details.get(game.id) ?? null, companyById }, site);
    await put(`g/${game.id}/index.html`, html);
  }
  for (const kind of Object.keys(GENERIC)) await put(`share/${kind}/index.html`, renderGenericPage(kind, site));
  log(`Share pages: wrote ${written} pages (${Math.min(games.length, SHARE_PAGE_LIMIT)} of ${games.length} games + ${Object.keys(GENERIC).length} generic), ${(bytes / 1024).toFixed(0)} KiB of content`);
  return { written, bytes };
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entry) {
  const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  await buildSharePages({ distDir });
}
