import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  escapeHtml,
  gameDescription,
  gameImage,
  gameTitle,
  renderGamePage,
  renderGenericPage,
  resolveSite,
} from './build-share-pages.mjs';

const companies = new Map([
  [1, { id: 1, name: 'Lead & Co', country: 'PL', city: 'Warsaw' }],
  [2, { id: 2, name: 'Pub', country: 'US', city: 'Austin' }],
  [3, { id: 3, name: 'Pub2', country: 'US', city: null }],
  [4, { id: 4, name: 'QA', country: 'JP', city: 'Tokyo' }],
  [5, { id: 5, name: 'Nowhere', country: null, city: null }],
]);
const role = (companyId, r) => ({ companyId, role: r });
const detail = {
  id: 9,
  screenshots: ['sc1', 'sc2'],
  roles: [role(1, 'lead_developer'), role(2, 'publisher'), role(3, 'publisher'), role(4, 'qa'), role(4, 'localization'), role(5, 'support')],
};
const game = { id: 9, name: 'Tom & "Jerry" <b>', year: 2015, leadCompanyId: 1, cover: 'cv1' };
const site = resolveSite({ SITE_URL: 'https://user.github.io/overworld', VITE_BASE: '/overworld/' });
const relative = resolveSite({ VITE_BASE: '/overworld/' });

describe('escapeHtml', () => {
  it('escapes the five dangerous characters', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
  });
});

describe('resolveSite', () => {
  it('reads SITE_URL and the base', () => {
    expect(site).toEqual({ siteUrl: 'https://user.github.io/overworld/', basePath: '/overworld/' });
    expect(absoluteUrl(site, 'g/1/')).toBe('https://user.github.io/overworld/g/1/');
  });

  it('falls back to root-relative URLs without SITE_URL', () => {
    expect(relative.siteUrl).toBeNull();
    expect(absoluteUrl(relative, 'og-default.png')).toBe('/overworld/og-default.png');
    expect(resolveSite({})).toEqual({ siteUrl: null, basePath: '/' });
  });

  it('takes the base from SITE_URL when VITE_BASE is unset and ignores junk', () => {
    expect(resolveSite({ SITE_URL: 'https://a.io/x' }).basePath).toBe('/x/');
    expect(resolveSite({ SITE_URL: 'not a url' }).siteUrl).toBeNull();
  });
});

describe('gameTitle', () => {
  it('uses city and country', () => {
    expect(gameTitle(game, companies.get(1))).toBe('Tom & "Jerry" <b> (2015) — made in Warsaw, Poland');
  });

  it('uses country only', () => {
    expect(gameTitle(game, companies.get(3))).toBe('Tom & "Jerry" <b> (2015) — made in United States');
  });

  it('omits the place when unknown and the year when missing', () => {
    expect(gameTitle(game, companies.get(5))).toBe('Tom & "Jerry" <b> (2015)');
    expect(gameTitle({ ...game, year: null }, undefined)).toBe('Tom & "Jerry" <b>');
  });
});

describe('gameDescription', () => {
  it('counts other companies and their countries', () => {
    expect(gameDescription(companies.get(1), detail, companies, 1)).toBe('Lead studio: Lead & Co. 4 other companies in 2 countries worked on it.');
  });

  it('handles singular and empty cases', () => {
    const one = { roles: [role(1, 'lead_developer'), role(2, 'publisher')] };
    expect(gameDescription(companies.get(1), one, companies, 1)).toBe('Lead studio: Lead & Co. 1 other company in 1 country worked on it.');
    expect(gameDescription(companies.get(1), { roles: [role(1, 'lead_developer')] }, companies, 1)).toBe('Lead studio: Lead & Co.');
    expect(gameDescription(undefined, null, companies, 1)).toBe('See where this game was made on Overworld.');
  });
});

describe('gameImage', () => {
  it('prefers the first screenshot, then the cover, then the default', () => {
    expect(gameImage(game, detail, site)).toBe('https://images.igdb.com/igdb/image/upload/t_720p/sc1.jpg');
    expect(gameImage(game, { screenshots: [] }, site)).toBe('https://images.igdb.com/igdb/image/upload/t_720p/cv1.jpg');
    expect(gameImage({ ...game, cover: null }, null, site)).toBe('https://user.github.io/overworld/og-default.png');
    expect(gameImage({ ...game, cover: null }, null, relative)).toBe('/overworld/og-default.png');
  });
});

describe('renderGamePage', () => {
  const html = renderGamePage({ game, lead: companies.get(1), detail, companyById: companies }, site);

  it('escapes all text', () => {
    expect(html).not.toContain('<b>');
    expect(html).toContain('<title>Tom &amp; &quot;Jerry&quot; &lt;b&gt; (2015) — made in Warsaw, Poland</title>');
    expect(html).toContain('<meta property="og:title" content="Tom &amp; &quot;Jerry&quot; &lt;b&gt; (2015) — made in Warsaw, Poland">');
    expect(html).toContain('Lead studio: Lead &amp; Co. 4 other companies in 2 countries worked on it.');
  });

  it('has the open graph, twitter and redirect tags', () => {
    expect(html).toContain('<meta property="og:type" content="website">');
    expect(html).toContain('<meta property="og:site_name" content="Overworld">');
    expect(html).toContain('<meta property="og:image" content="https://images.igdb.com/igdb/image/upload/t_720p/sc1.jpg">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<link rel="canonical" href="https://user.github.io/overworld/g/9/">');
    expect(html).toContain('<meta http-equiv="refresh" content="0;url=/overworld/?game=9">');
    expect(html).toContain('location.replace("/overworld/?game=9")');
    expect(html).toContain('<a href="/overworld/?game=9">');
  });

  it('uses root-relative URLs without SITE_URL', () => {
    const rel = renderGamePage({ game: { ...game, id: 3, cover: null }, lead: undefined, detail: null, companyById: companies }, relative);
    expect(rel).toContain('<link rel="canonical" href="/overworld/g/3/">');
    expect(rel).toContain('content="/overworld/og-default.png"');
  });
});

describe('renderGenericPage', () => {
  it('writes a static page that keeps the query string', () => {
    for (const kind of ['guess', 'myglobe']) {
      const html = renderGenericPage(kind, site);
      expect(html).toContain('<meta property="og:image" content="https://user.github.io/overworld/og-default.png">');
      expect(html).toContain(`href="https://user.github.io/overworld/share/${kind}/"`);
      expect(html).toContain('location.replace("/overworld/" + location.search + location.hash)');
    }
  });
});
