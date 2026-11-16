import { describe, expect, it } from 'vitest';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  estimateMeasure,
  fitText,
  gameCardSpec,
  groupLine,
  guessCardSpec,
  layoutCard,
  myGlobeCardSpec,
  type DrawOp,
  type GameCardSpec,
} from './card';

const texts = (ops: DrawOp[]) => ops.flatMap((o) => (o.op === 'text' ? [o.text] : []));
const opts = { maxSize: 64, minSize: 40, maxLines: 2, maxWidth: 1056, font: 'display' as const, weight: 700 };

describe('fitText', () => {
  it('keeps a short title at full size on one line', () => {
    expect(fitText('Portal 2', opts, estimateMeasure)).toEqual({ lines: ['Portal 2'], size: 64 });
  });

  it('shrinks a long title before wrapping', () => {
    const title = 'A'.repeat(24) + ' ' + 'B'.repeat(8);
    const fit = fitText(title, opts, estimateMeasure);
    expect(fit.size).toBeLessThan(64);
    expect(fit.lines).toHaveLength(1);
  });

  it('wraps to two lines at a smaller size', () => {
    const title = 'Word '.repeat(27).trim();
    const fit = fitText(title, opts, estimateMeasure);
    expect(fit.lines).toHaveLength(2);
    for (const l of fit.lines) expect(estimateMeasure(l, fit.size, 'display', 700)).toBeLessThanOrEqual(1056);
  });

  it('ellipsizes when two lines are not enough', () => {
    const title = 'Word '.repeat(120).trim();
    const fit = fitText(title, opts, estimateMeasure);
    expect(fit.size).toBe(40);
    expect(fit.lines).toHaveLength(2);
    expect(fit.lines[1]!.endsWith('…')).toBe(true);
    expect(estimateMeasure(fit.lines[1]!, 40, 'display', 700)).toBeLessThanOrEqual(1056);
  });

  it('breaks a single very long word', () => {
    const fit = fitText('x'.repeat(300), opts, estimateMeasure);
    expect(fit.lines).toHaveLength(2);
    expect(fit.lines[1]!.endsWith('…')).toBe(true);
  });
});

const game: GameCardSpec = {
  kind: 'game',
  title: 'The Witcher 3: Wild Hunt',
  year: 2015,
  lead: { name: 'CD Projekt Red', place: 'Warsaw, Poland' },
  groups: [
    { label: 'Lead developer', color: '#F0E442', companies: 1, countries: 1 },
    { label: 'Publisher', color: '#1DB88E', companies: 4, countries: 3 },
  ],
};

describe('layoutCard', () => {
  it('lays out a game card', () => {
    const ops = layoutCard(game);
    expect(ops[0]).toMatchObject({ op: 'rect', w: CARD_WIDTH, h: CARD_HEIGHT, fill: '#07090d' });
    const t = texts(ops);
    expect(t).toContain('The Witcher 3: Wild Hunt');
    expect(t).toContain('2015');
    expect(t).toContain('Lead studio: CD Projekt Red — Warsaw, Poland');
    expect(t).toContain('Publisher · 4 companies in 3 countries');
    expect(t).toContain('Lead developer · 1 company in 1 country');
    expect(t).toContain('Overworld');
    expect(t).toContain('Data: IGDB, Wikidata');
    const dots = ops.flatMap((o) => (o.op === 'circle' ? [o.fill] : []));
    expect(dots).toEqual(['#F0E442', '#1DB88E']);
    expect(ops.some((o) => o.op === 'text' && o.color === '#e6e9ef')).toBe(true);
  });

  it('handles unknown year, lead and no groups', () => {
    const t = texts(layoutCard({ ...game, year: null, lead: null, groups: [] }));
    expect(t).toContain('Year unknown');
    expect(t).toContain('Lead studio unknown');
  });

  it('keeps every row of a long game inside the card', () => {
    const groups = Array.from({ length: 8 }, (_, i) => ({ label: `Role ${i}`, color: '#fff', companies: 2, countries: 2 }));
    const ops = layoutCard({ ...game, title: 'Word '.repeat(60), groups });
    for (const o of ops) if (o.op === 'text') expect(o.y + o.size).toBeLessThanOrEqual(CARD_HEIGHT);
    expect(ops.filter((o) => o.op === 'text' && o.text.startsWith('Role'))).toHaveLength(8);
  });

  it('lays out a guess card', () => {
    const spec = guessCardSpec({
      seed: 'abc123',
      rounds: [
        { gameId: 1, km: 120, score: 4900, hint: false },
        { gameId: 2, km: 5000, score: 3000, hint: true },
        { gameId: 3, km: 0, score: 5000, hint: false },
        { gameId: 4, km: 20000, score: 0, hint: false },
        { gameId: 5, km: 800, score: 4520, hint: false },
      ],
    });
    const t = texts(layoutCard(spec));
    expect(t).toContain('Guess mode');
    expect(t).toContain('17,420 / 25,000');
    expect(t).toContain('2. 5,000 km (hint)');
    expect(t.filter((x) => /^\d\. /.test(x))).toHaveLength(5);
    expect(t).toContain('Overworld');
  });

  it('lays out a my globe card', () => {
    const spec = myGlobeCardSpec({
      owned: 530,
      matched: 412,
      countries: [
        { code: 'JP', percent: 34 },
        { code: 'US', percent: 30 },
        { code: 'GB', percent: 10 },
        { code: 'DE', percent: 8 },
        { code: 'FR', percent: 5 },
      ],
    });
    const ops = layoutCard(spec);
    const t = texts(ops);
    expect(t).toContain('34% of my games come from Japan');
    expect(t).toContain('34%');
    expect(t).toContain('412 of 530 games matched');
    expect(t).toContain('Game library data from Steam. Not affiliated with Valve.');
    expect(t).toContain('Overworld');
    expect(ops.filter((o) => o.op === 'rect' && o.fill === '#F0E442' && o.h === 22)).toHaveLength(5);
  });

  it('has a headline when nothing matched', () => {
    expect(myGlobeCardSpec({ owned: 5, matched: 0, countries: [] }).headline).toBe('None of my games were found in Overworld');
  });
});

describe('gameCardSpec', () => {
  it('counts companies and countries per role group', () => {
    const byId = new Map([
      [1, { country: 'PL' }],
      [2, { country: 'US' }],
      [3, { country: 'US' }],
      [4, { country: null }],
    ]);
    const src = { source: 'curated' as const, id: 'x' };
    const role = (companyId: number, r: 'lead_developer' | 'publisher' | 'art' | 'audio') => ({
      companyId,
      role: r,
      platform: null,
      year: null,
      source: src,
    });
    const spec = gameCardSpec(
      { name: 'G', year: 2000 },
      { name: 'Lead', city: 'Warsaw', country: 'PL' },
      {
        roles: [
          role(1, 'lead_developer'),
          role(2, 'publisher'),
          role(3, 'publisher'),
          role(4, 'publisher'),
          role(3, 'art'),
          role(2, 'audio'),
        ],
      },
      byId,
    );
    expect(spec.lead).toEqual({ name: 'Lead', place: 'Warsaw, Poland' });
    expect(spec.groups.map(groupLine)).toEqual([
      'Lead developer · 1 company in 1 country',
      'Publisher · 3 companies in 1 country',
      'Art / audio · 2 companies in 1 country',
    ]);
  });
});
