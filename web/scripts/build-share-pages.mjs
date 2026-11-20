import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { absoluteUrl, countryName, escapeHtml, head, normaliseBasePath, resolveSite } from './page-utils.mjs';
import { buildSeoPages, gameDescription, gameImage, gameTitle, renderGamePage } from './seo-pages.mjs';

export { absoluteUrl, countryName, escapeHtml, gameDescription, gameImage, gameTitle, normaliseBasePath, renderGamePage, resolveSite };

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
  for (const kind of Object.keys(GENERIC)) await put(`share/${kind}/index.html`, renderGenericPage(kind, site));
  log(`Share pages: wrote ${written} generic pages, ${(bytes / 1024).toFixed(0)} KiB of content`);
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
