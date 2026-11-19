import { describe, expect, it } from 'vitest';
import { resolveSite } from './page-utils.mjs';
import {
  indexData,
  renderCountriesIndex,
  renderCountryPage,
  renderRobots,
  renderSitemap,
  renderStudioPage,
  slugify,
  withHomeMeta,
} from './seo-pages.mjs';

const site = resolveSite({ SITE_URL: 'https://overworld.example' });
const bare = resolveSite({});

const companies = [
  { id: 1, name: 'Studio <One> & Co', country: 'PL', city: 'Kraków', founded: 2001, parentId: 3 },
  { id: 2, name: 'Studio One & Co', country: 'PL', city: 'Warsaw', founded: null, parentId: null },
  { id: 3, name: 'Parent', country: 'US', city: null, founded: null, parentId: null },
  { id: 4, name: 'Tiny', country: 'JP', city: 'Tokyo', founded: null, parentId: null },
];
const companyById = new Map(companies.map((c) => [c.id, c]));
const g = (id, lead, popularity, extra = {}) => ({ id, name: `Game ${id}`, year: 2000 + id, leadCompanyId: lead, popularity, cover: `c${id}`, genres: [], ...extra });
const games = [
  g(1, 1, 50, { name: 'First "quoted" <game>' }),
  g(2, 1, 40),
  g(3, 1, 30),
  g(4, 1, 20),
  g(5, 2, 90),
  g(6, 2, 80),
  g(7, 2, 70),
  g(8, 4, 10),
];
const details = new Map([
  [8, { id: 8, roles: [{ companyId: 4, role: 'lead_developer' }, { companyId: 1, role: 'port' }, { companyId: 1, role: 'qa' }] }],
]);
const stats = { countries: [{ code: 'PL', studios: 2, gamesPerMillion: 0.2, genres: { 12: 5, 31: 2 } }] };
const meta = { genres: [{ id: 12, name: 'RPG' }, { id: 31, name: 'Adventure' }], generatedAt: '2026-11-20T00:00:00Z' };
const idx = indexData({ games, companyById, details, stats, meta });

describe('slugify', () => {
  it('folds accents and symbols into dashes', () => {
    expect(slugify('Kraków & Côte d’Ivoire!')).toBe('krakow-and-cote-d-ivoire');
    expect(slugify('  --CD Projekt RED--  ')).toBe('cd-projekt-red');
    expect(slugify('日本')).toBe('');
  });
});

describe('indexData', () => {
  it('makes pages only for studios that led enough games, with unique slugs', () => {
    expect(idx.studios.map((s) => s.company.id)).toEqual([1, 2]);
    expect(idx.studioSlug.get(1)).toBe('studio-one-and-co');
    expect(idx.studioSlug.get(2)).toBe('studio-one-and-co-2');
    expect(idx.studioSlug.has(4)).toBe(false);
  });

  it('groups games by country, most played first', () => {
    expect(idx.countries.map((c) => [c.code, c.slug, c.games.length])).toEqual([
      ['PL', 'poland', 7],
      ['JP', 'japan', 1],
    ]);
    expect(idx.countries[0].games[0].id).toBe(5);
  });

  it('collects the other games a studio worked on, with roles', () => {
    expect([...idx.worked.get(1).get(8)].sort()).toEqual(['port', 'qa']);
  });
});

describe('renderStudioPage', () => {
  const html = renderStudioPage(site, idx, idx.studios[0], companyById);

  it('escapes names and carries the canonical URL', () => {
    expect(html).toContain('<h1>Studio &lt;One&gt; &amp; Co</h1>');
    expect(html).toContain('First &quot;quoted&quot; &lt;game&gt;');
    expect(html).not.toContain('<game>');
    expect(html).toContain('<link rel="canonical" href="https://overworld.example/studios/studio-one-and-co/">');
  });

  it('links the country page, the globe and other games', () => {
    expect(html).toContain('href="/countries/poland/"');
    expect(html).toContain('href="/?place=company:1"');
    expect(html).toContain('href="/?game=8"');
    expect(html).toContain('port, QA');
    expect(html).toContain('"@type":"Organization"');
  });
});

describe('renderCountryPage', () => {
  const html = renderCountryPage(site, idx, idx.countries[0], companyById);

  it('summarises games, studios, cities and genres', () => {
    expect(html).toContain('<h1>Video games made in Poland</h1>');
    expect(html).toContain('7 games were led by 2 studios in Poland');
    expect(html).toContain('RPG, Adventure');
    expect(html).toContain('href="/studios/studio-one-and-co-2/"');
    expect(html).toContain(`href="/?place=${encodeURIComponent('city:PL|Krakow')}"`);
    expect(html).toContain('href="/?place=country:PL"');
  });
});

describe('index, sitemap and robots', () => {
  it('ranks countries', () => {
    const html = renderCountriesIndex(site, idx);
    expect(html.indexOf('/countries/poland/')).toBeLessThan(html.indexOf('/countries/japan/'));
  });

  it('lists absolute URLs in the sitemap', () => {
    const xml = renderSitemap(site, ['', 'countries/poland/'], '2026-11-20');
    expect(xml).toContain('<loc>https://overworld.example/countries/poland/</loc><lastmod>2026-11-20</lastmod>');
  });

  it('keeps the admin page out and points to the sitemap', () => {
    expect(renderRobots(site)).toContain('Disallow: /admin.html');
    expect(renderRobots(site)).toContain('Sitemap: https://overworld.example/sitemap.xml');
    expect(renderRobots(bare)).not.toContain('Sitemap');
  });

  it('adds absolute preview tags to the home page once', () => {
    const once = withHomeMeta('<html><head><title>x</title></head></html>', site);
    expect(once).toContain('<meta property="og:image" content="https://overworld.example/og-default.png" />');
    expect(withHomeMeta(once, site)).toBe(once);
    expect(withHomeMeta('<head></head>', bare)).toBe('<head></head>');
  });
});
