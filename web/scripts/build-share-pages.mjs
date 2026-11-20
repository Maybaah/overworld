import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { absoluteUrl, countryName, escapeHtml, head, normaliseBasePath, resolveSite } from './page-utils.mjs';
import { buildSeoPages } from './seo-pages.mjs';

export { absoluteUrl, countryName, escapeHtml, normaliseBasePath, resolveSite };

const IGDB = 'https://images.igdb.com/igdb/image/upload/t_720p/';
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

function redirectScript(site, target, keepQuery) {
  return `<script src="${escapeHtml(site.basePath)}go.js" data-to="${escapeHtml(target)}"${keepQuery ? ' data-keep' : ''}></script>`;
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
    redirectScript(site, target, false),
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
    redirectScript(site, target, true),
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
  for (const game of games.slice(0, SHARE_PAGE_LIMIT)) {
    const html = renderGamePage({ game, lead: companyById.get(game.leadCompanyId), detail: details.get(game.id) ?? null, companyById }, site);
    await put(`g/${game.id}/index.html`, html);
  }
  for (const kind of Object.keys(GENERIC)) await put(`share/${kind}/index.html`, renderGenericPage(kind, site));
  log(`Share pages: wrote ${written} pages (${Math.min(games.length, SHARE_PAGE_LIMIT)} of ${games.length} games + ${Object.keys(GENERIC).length} generic), ${(bytes / 1024).toFixed(0)} KiB of content`);
  await buildSeoPages({ distDir, site, games, companyById, details, log });
  return { written, bytes };
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entry) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { loadEnv } = await import('vite');
  const env = { ...loadEnv(process.env.MODE ?? 'production', webDir, ''), ...process.env };
  await buildSharePages({ distDir: path.join(webDir, 'dist'), env });
}
