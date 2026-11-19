import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { absoluteUrl, countryName, escapeHtml, head } from './page-utils.mjs';

export const STUDIO_MIN_LEAD = 3;
const COVER = 'https://images.igdb.com/igdb/image/upload/t_cover_small/';
const COVERED = 24;
const COUNTRY_GAMES = 100;
const COUNTRY_STUDIOS = 60;
const COUNTRY_CITIES = 24;
const ROLE_LABEL = {
  co_developer: 'co-development',
  port: 'port',
  publisher: 'publishing',
  localization: 'localization',
  qa: 'QA',
  art: 'art',
  audio: 'audio',
  support: 'support',
};

export function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function num(n) {
  return n.toLocaleString('en-US');
}

function plural(n, one, many) {
  return `${num(n)} ${n === 1 ? one : many}`;
}

function listWords(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function cityKey(country, city) {
  return `${country}|${city.normalize('NFD').replace(/\p{M}/gu, '')}`;
}

export function indexData({ games, companyById, details, stats, meta }) {
  const sorted = [...games].sort((a, b) => b.popularity - a.popularity || a.id - b.id);
  const ledBy = new Map();
  for (const g of sorted) {
    const list = ledBy.get(g.leadCompanyId);
    if (list) list.push(g);
    else ledBy.set(g.leadCompanyId, [g]);
  }
  const gameById = new Map(sorted.map((g) => [g.id, g]));
  const worked = new Map();
  for (const d of details.values()) {
    const game = gameById.get(d.id);
    if (!game) continue;
    for (const r of d.roles ?? []) {
      if (r.companyId === game.leadCompanyId || r.role === 'lead_developer') continue;
      let byGame = worked.get(r.companyId);
      if (!byGame) worked.set(r.companyId, (byGame = new Map()));
      let roles = byGame.get(game.id);
      if (!roles) byGame.set(game.id, (roles = new Set()));
      roles.add(r.role);
    }
  }

  const studios = [...ledBy.entries()]
    .filter(([, list]) => list.length >= STUDIO_MIN_LEAD)
    .map(([id, list]) => ({ company: companyById.get(id), games: list }))
    .filter((s) => s.company)
    .sort((a, b) => b.games.length - a.games.length || a.company.id - b.company.id);
  const taken = new Set();
  const studioSlug = new Map();
  for (const s of studios) {
    let slug = slugify(s.company.name) || `studio-${s.company.id}`;
    if (taken.has(slug)) slug = `${slug}-${s.company.id}`;
    taken.add(slug);
    studioSlug.set(s.company.id, slug);
  }

  const byCountry = new Map();
  for (const g of sorted) {
    const code = companyById.get(g.leadCompanyId)?.country;
    if (!code) continue;
    const list = byCountry.get(code);
    if (list) list.push(g);
    else byCountry.set(code, [g]);
  }
  const statByCode = new Map((stats?.countries ?? []).map((c) => [c.code, c]));
  const genreName = new Map((meta?.genres ?? []).map((g) => [String(g.id), g.name]));
  const countries = [...byCountry.entries()]
    .map(([code, list]) => ({ code, name: countryName(code), slug: slugify(countryName(code)) || code.toLowerCase(), games: list, stat: statByCode.get(code) ?? null }))
    .sort((a, b) => b.games.length - a.games.length || a.name.localeCompare(b.name));
  const countrySlug = new Map(countries.map((c) => [c.code, c.slug]));

  return { sorted, ledBy, worked, gameById, studios, studioSlug, countries, countrySlug, genreName };
}

function placeText(company) {
  if (!company?.country) return null;
  const country = countryName(company.country);
  return company.city ? `${company.city}, ${country}` : country;
}

function gameUrl(site, id) {
  return `${site.basePath}?game=${id}`;
}

function layout(site, { title, description, canonical, image, crumbs, main, jsonLd, globeUrl }) {
  const crumbList = crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absoluteUrl(site, c.href) }));
  const ld = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbList }, ...(jsonLd ?? [])];
  const nav = crumbs
    .map((c, i) => (i === crumbs.length - 1 ? `<span aria-current="page">${escapeHtml(c.name)}</span>` : `<a href="${escapeHtml(site.basePath + c.href)}">${escapeHtml(c.name)}</a>`))
    .join('<span class="sep">/</span>');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    head({ title, description, canonical, image, redirect: null }),
    `<link rel="icon" href="${escapeHtml(site.basePath)}favicon.svg" type="image/svg+xml">`,
    `<link rel="stylesheet" href="${escapeHtml(site.basePath)}pages.css">`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
    '</head>',
    '<body>',
    '<header class="top">',
    `<a class="brand" href="${escapeHtml(site.basePath)}"><img src="${escapeHtml(site.basePath)}favicon.svg" width="28" height="28" alt="">Overworld</a>`,
    `<a class="cta" href="${escapeHtml(globeUrl)}">Open the globe</a>`,
    '</header>',
    `<nav class="crumbs" aria-label="Breadcrumb">${nav}</nav>`,
    '<main>',
    main,
    '</main>',
    '<footer>',
    `<p><a href="${escapeHtml(site.basePath)}countries/">All countries</a> · <a href="${escapeHtml(site.basePath)}">The globe</a> · <a href="https://github.com/Maybaah/overworld">Source code</a></p>`,
    '<p>Data from IGDB, Wikidata, MobyGames, RAWG and Steam. Overworld is not affiliated with any of them or with any game company. Game titles and artwork belong to their owners.</p>',
    '</footer>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function gameItem(site, game, line, covered) {
  const img = covered && game.cover
    ? `<img src="${COVER}${escapeHtml(game.cover)}.jpg" width="45" height="64" loading="lazy" alt="">`
    : covered
      ? '<span class="nocover" aria-hidden="true"></span>'
      : '';
  return `<li${covered ? ' class="covered"' : ''}>${img}<div><a href="${escapeHtml(gameUrl(site, game.id))}">${escapeHtml(game.name)}</a><span>${escapeHtml(line)}</span></div></li>`;
}

function studioLink(site, idx, company) {
  const slug = idx.studioSlug.get(company.id);
  return slug ? `<a href="${escapeHtml(`${site.basePath}studios/${slug}/`)}">${escapeHtml(company.name)}</a>` : escapeHtml(company.name);
}

export function renderStudioPage(site, idx, studio, companyById) {
  const { company, games } = studio;
  const slug = idx.studioSlug.get(company.id);
  const place = placeText(company);
  const countryHref = company.country && idx.countrySlug.has(company.country) ? `countries/${idx.countrySlug.get(company.country)}/` : null;
  const workedOn = [...(idx.worked.get(company.id) ?? new Map()).entries()]
    .map(([id, roles]) => ({ game: idx.gameById.get(id), roles: [...roles].map((r) => ROLE_LABEL[r] ?? r) }))
    .filter((w) => w.game)
    .sort((a, b) => b.game.popularity - a.game.popularity);
  const years = games.map((g) => g.year).filter((y) => typeof y === 'number');
  const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : null;
  const top = games.slice(0, 3).map((g) => g.name);
  const parent = company.parentId ? companyById.get(company.parentId) : null;

  const title = `${company.name}${place ? ` (${place})` : ''}: games and studio location | Overworld`;
  const description = [
    `${company.name} is a game studio${place ? ` in ${place}` : ''}.`,
    `It led ${plural(games.length, 'game', 'games')}${span ? ` from ${span}` : ''}, including ${listWords(top)}.`,
    workedOn.length ? `It also worked on ${plural(workedOn.length, 'other game', 'other games')}.` : '',
  ].filter(Boolean).join(' ');

  const facts = [
    place ? `<div><dt>Based in</dt><dd>${company.city ? `${escapeHtml(company.city)}, ` : ''}${countryHref ? `<a href="${escapeHtml(site.basePath + countryHref)}">${escapeHtml(countryName(company.country))}</a>` : escapeHtml(countryName(company.country))}</dd></div>` : '',
    company.founded ? `<div><dt>Founded</dt><dd>${company.founded}</dd></div>` : '',
    `<div><dt>Games led</dt><dd>${num(games.length)}</dd></div>`,
    workedOn.length ? `<div><dt>Also worked on</dt><dd>${num(workedOn.length)}</dd></div>` : '',
    span ? `<div><dt>Years</dt><dd>${span}</dd></div>` : '',
    parent ? `<div><dt>Part of</dt><dd>${studioLink(site, idx, parent)}</dd></div>` : '',
  ].filter(Boolean).join('');

  const main = [
    `<h1>${escapeHtml(company.name)}</h1>`,
    `<p class="lead">${escapeHtml(description)}</p>`,
    `<dl class="facts">${facts}</dl>`,
    `<h2>Games led by ${escapeHtml(company.name)}</h2>`,
    `<ol class="games">${games.map((g, i) => gameItem(site, g, g.year ? String(g.year) : 'Year unknown', i < COVERED)).join('')}</ol>`,
    workedOn.length
      ? `<h2>Other games ${escapeHtml(company.name)} worked on</h2><ol class="games">${workedOn.map((w) => {
          const lead = companyById.get(w.game.leadCompanyId);
          const line = [w.game.year, w.roles.join(', '), lead ? `led by ${lead.name}` : null].filter(Boolean).join(' · ');
          return gameItem(site, w.game, line, false);
        }).join('')}</ol>`
      : '',
    `<p class="more"><a class="cta" href="${escapeHtml(`${site.basePath}?place=company:${company.id}`)}">See ${escapeHtml(company.name)} on the globe</a></p>`,
  ].join('\n');

  const org = { '@context': 'https://schema.org', '@type': 'Organization', name: company.name, url: absoluteUrl(site, `studios/${slug}/`) };
  if (company.founded) org.foundingDate = String(company.founded);
  if (company.country) org.address = { '@type': 'PostalAddress', addressCountry: company.country, ...(company.city ? { addressLocality: company.city } : {}) };

  return layout(site, {
    title,
    description,
    canonical: absoluteUrl(site, `studios/${slug}/`),
    image: absoluteUrl(site, 'og-default.png'),
    crumbs: [
      { name: 'Overworld', href: '' },
      ...(countryHref ? [{ name: countryName(company.country), href: countryHref }] : []),
      { name: company.name, href: `studios/${slug}/` },
    ],
    main,
    jsonLd: [org],
    globeUrl: `${site.basePath}?place=company:${company.id}`,
  });
}

export function renderCountryPage(site, idx, country, companyById) {
  const { code, name, slug, games, stat } = country;
  const studioCounts = new Map();
  const cityCounts = new Map();
  for (const g of games) {
    studioCounts.set(g.leadCompanyId, (studioCounts.get(g.leadCompanyId) ?? 0) + 1);
    const city = companyById.get(g.leadCompanyId)?.city;
    if (city) cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
  }
  const studios = [...studioCounts.entries()]
    .map(([id, n]) => ({ company: companyById.get(id), n }))
    .filter((s) => s.company)
    .sort((a, b) => b.n - a.n || a.company.name.localeCompare(b.company.name));
  const cities = [...cityCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const genres = Object.entries(stat?.genres ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => idx.genreName.get(id))
    .filter(Boolean);
  const top = games.slice(0, 3).map((g) => g.name);

  const title = `Video games made in ${name}: ${num(games.length)} games, ${num(studios.length)} studios | Overworld`;
  const description = [
    `${plural(games.length, 'game was', 'games were')} led by ${plural(studios.length, 'studio', 'studios')} in ${name}${cities.length ? `, most of them in ${listWords(cities.slice(0, 3).map(([c]) => c))}` : ''}.`,
    `The most played include ${listWords(top)}.`,
  ].join(' ');

  const facts = [
    `<div><dt>Games led</dt><dd>${num(games.length)}</dd></div>`,
    `<div><dt>Studios</dt><dd>${num(studios.length)}</dd></div>`,
    stat?.gamesPerMillion != null ? `<div><dt>Per million people</dt><dd>${stat.gamesPerMillion.toFixed(1)}</dd></div>` : '',
    genres.length ? `<div><dt>Top genres</dt><dd>${escapeHtml(genres.join(', '))}</dd></div>` : '',
  ].filter(Boolean).join('');

  const main = [
    `<h1>Video games made in ${escapeHtml(name)}</h1>`,
    `<p class="lead">${escapeHtml(description)}</p>`,
    `<dl class="facts">${facts}</dl>`,
    `<h2>Most played games from ${escapeHtml(name)}</h2>`,
    `<ol class="games">${games.slice(0, COUNTRY_GAMES).map((g, i) => {
      const lead = companyById.get(g.leadCompanyId);
      const line = [g.year, lead ? `${lead.name}${lead.city ? `, ${lead.city}` : ''}` : null].filter(Boolean).join(' · ');
      return gameItem(site, g, line, i < COVERED);
    }).join('')}</ol>`,
    games.length > COUNTRY_GAMES ? `<p class="note">and ${plural(games.length - COUNTRY_GAMES, 'more game', 'more games')} on the globe.</p>` : '',
    `<h2>Studios in ${escapeHtml(name)}</h2>`,
    `<ol class="rows">${studios.slice(0, COUNTRY_STUDIOS).map((s) => `<li>${studioLink(site, idx, s.company)}<span>${s.company.city ? `${escapeHtml(s.company.city)} · ` : ''}${plural(s.n, 'game', 'games')}</span></li>`).join('')}</ol>`,
    studios.length > COUNTRY_STUDIOS ? `<p class="note">and ${plural(studios.length - COUNTRY_STUDIOS, 'more studio', 'more studios')}.</p>` : '',
    cities.length
      ? `<h2>Cities</h2><ul class="chips">${cities.slice(0, COUNTRY_CITIES).map(([city, n]) => `<li><a href="${escapeHtml(`${site.basePath}?place=${encodeURIComponent(`city:${cityKey(code, city)}`)}`)}">${escapeHtml(city)}</a> <span>${num(n)}</span></li>`).join('')}</ul>`
      : '',
    `<p class="more"><a class="cta" href="${escapeHtml(`${site.basePath}?place=country:${code}`)}">See ${escapeHtml(name)} on the globe</a></p>`,
  ].join('\n');

  return layout(site, {
    title,
    description,
    canonical: absoluteUrl(site, `countries/${slug}/`),
    image: absoluteUrl(site, 'og-default.png'),
    crumbs: [
      { name: 'Overworld', href: '' },
      { name: 'Countries', href: 'countries/' },
      { name, href: `countries/${slug}/` },
    ],
    main,
    globeUrl: `${site.basePath}?place=country:${code}`,
  });
}

export function renderCountriesIndex(site, idx) {
  const total = idx.countries.reduce((n, c) => n + c.games.length, 0);
  const description = `Where video games are made: ${num(total)} games from ${num(idx.countries.length)} countries, ranked by how many games their studios led.`;
  const rows = idx.countries
    .map((c, i) => `<tr><td>${i + 1}</td><td><a href="${escapeHtml(`${site.basePath}countries/${c.slug}/`)}">${escapeHtml(c.name)}</a></td><td>${num(c.games.length)}</td><td>${c.stat?.studios != null ? num(c.stat.studios) : ''}</td><td>${c.stat?.gamesPerMillion != null ? c.stat.gamesPerMillion.toFixed(1) : ''}</td></tr>`)
    .join('');
  const main = [
    '<h1>Video games by country</h1>',
    `<p class="lead">${escapeHtml(description)}</p>`,
    `<div class="table"><table><thead><tr><th>#</th><th>Country</th><th>Games led</th><th>Studios</th><th>Per million people</th></tr></thead><tbody>${rows}</tbody></table></div>`,
  ].join('\n');
  return layout(site, {
    title: 'Video games by country: where games are made | Overworld',
    description,
    canonical: absoluteUrl(site, 'countries/'),
    image: absoluteUrl(site, 'og-default.png'),
    crumbs: [
      { name: 'Overworld', href: '' },
      { name: 'Countries', href: 'countries/' },
    ],
    main,
    globeUrl: site.basePath,
  });
}

export function renderSitemap(site, urls, lastmod) {
  const items = urls.map((u) => `<url><loc>${escapeHtml(absoluteUrl(site, u))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...items, '</urlset>', ''].join('\n');
}

export function renderRobots(site) {
  const lines = ['User-agent: *', 'Allow: /', `Disallow: ${site.basePath}admin`, `Disallow: ${site.basePath}admin.html`];
  if (site.siteUrl) lines.push('', `Sitemap: ${absoluteUrl(site, 'sitemap.xml')}`);
  return `${lines.join('\n')}\n`;
}

export const PAGES_CSS = `:root{--bg:#07090d;--panel:#0f1218;--line:#1f2430;--text:#f4f4f5;--muted:#a1a1aa;--accent:#56b4e9;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.top,.crumbs,main,footer{max-width:880px;margin:0 auto;padding:0 16px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:16px;padding-bottom:16px}
.brand{display:flex;align-items:center;gap:10px;color:var(--text);font-weight:600;font-size:18px}
.cta{display:inline-block;padding:8px 14px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--text);font-size:14px;font-weight:500}
.cta:hover{border-color:var(--accent);text-decoration:none}
.crumbs{color:var(--muted);font-size:14px;padding-bottom:8px}.crumbs .sep{margin:0 8px;opacity:.5}
h1{font-size:clamp(28px,5vw,40px);line-height:1.15;margin:16px 0 12px;letter-spacing:-.01em}
h2{font-size:20px;margin:40px 0 12px}
.lead{color:#d4d4d8;font-size:18px;max-width:68ch}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:24px 0 0;padding:0}
.facts div{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.facts dt{color:var(--muted);font-size:13px}.facts dd{margin:2px 0 0;font-size:17px;font-weight:600}
.games,.rows{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.games li,.rows li{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}
.games li div{display:flex;flex-direction:column;min-width:0}
.games li span,.rows li span{color:var(--muted);font-size:14px}
.rows li{justify-content:space-between}
.games img,.nocover{flex:none;width:45px;height:64px;border-radius:4px;background:var(--panel);object-fit:cover}
.chips{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0}
.chips li{background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:14px}.chips span{color:var(--muted)}
.note{color:var(--muted);font-size:14px}
.more{margin:40px 0}
.table{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:15px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}th{color:var(--muted);font-weight:500}
td:first-child,th:first-child{color:var(--muted);width:1%}
footer{margin-top:48px;padding-top:16px;padding-bottom:32px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
`;

export function withHomeMeta(html, site) {
  if (!site.siteUrl || html.includes('rel="canonical"')) return html;
  const home = absoluteUrl(site, '');
  const image = absoluteUrl(site, 'og-default.png');
  const tags = [
    `<link rel="canonical" href="${escapeHtml(home)}" />`,
    `<meta property="og:url" content="${escapeHtml(home)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ].join('\n    ');
  return html.replace('</head>', `    ${tags}\n  </head>`);
}

async function readJsonIf(file) {
  return existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null;
}

export async function buildSeoPages({ distDir, site, games, companyById, details, log = console.log }) {
  const dataDir = path.join(distDir, 'data');
  const stats = await readJsonIf(path.join(dataDir, 'stats.json'));
  const meta = await readJsonIf(path.join(dataDir, 'meta.json'));
  const idx = indexData({ games, companyById, details, stats, meta });
  let written = 0;
  const put = async (rel, text) => {
    const file = path.join(distDir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
    written += 1;
  };
  await put('pages.css', PAGES_CSS);
  await put('countries/index.html', renderCountriesIndex(site, idx));
  for (const c of idx.countries) await put(`countries/${c.slug}/index.html`, renderCountryPage(site, idx, c, companyById));
  for (const s of idx.studios) await put(`studios/${idx.studioSlug.get(s.company.id)}/index.html`, renderStudioPage(site, idx, s, companyById));
  const urls = ['', 'countries/', ...idx.countries.map((c) => `countries/${c.slug}/`), ...idx.studios.map((s) => `studios/${idx.studioSlug.get(s.company.id)}/`)];
  const homeFile = path.join(distDir, 'index.html');
  if (existsSync(homeFile)) await writeFile(homeFile, withHomeMeta(await readFile(homeFile, 'utf8'), site));
  await put('robots.txt', renderRobots(site));
  if (site.siteUrl) await put('sitemap.xml', renderSitemap(site, urls, meta?.generatedAt?.slice(0, 10) ?? null));
  else log('Sitemap skipped: SITE_URL is not set.');
  log(`Search pages: ${idx.countries.length} countries, ${idx.studios.length} studios (${STUDIO_MIN_LEAD}+ games led), ${written} files`);
  return { written, countries: idx.countries.length, studios: idx.studios.length };
}
