import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CARD_HEIGHT,
  CARD_COLORS,
  CARD_WIDTH,
  drawCard,
  estimateMeasure,
  fitText,
  gameCardSpec,
  groupLine,
  guessCardSpec,
  layoutCard,
  loadImages,
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

const lum = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ratio = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('cover art', () => {
  const withCover = { ...game, cover: 'co1wyy' };

  it('puts the cover left and the text to its right', () => {
    const ops = layoutCard(withCover);
    const covers = ops.filter((o) => o.op === 'image');
    const tile = covers.find((o) => o.op === 'image' && o.blur === undefined);
    expect(covers).toHaveLength(2);
    expect(tile).toMatchObject({ op: 'image', key: 'co1wyy', radius: 12, y: 48, h: 534 });
    if (tile?.op !== 'image') throw new Error('no tile');
    expect(tile.w / tile.h).toBeCloseTo(264 / 374, 2);
    for (const o of ops) if (o.op === 'text' && o.align === 'left') expect(o.x).toBeGreaterThanOrEqual(tile.x + tile.w);
    expect(ops.some((o) => o.op === 'outline')).toBe(true);
  });

  it('draws a faint blurred backdrop behind everything', () => {
    const ops = layoutCard(withCover);
    expect(ops[0]).toMatchObject({ op: 'rect', fill: '#07090d' });
    expect(ops[1]).toMatchObject({ op: 'image', w: CARD_WIDTH, h: CARD_HEIGHT, radius: 0 });
    const b = ops[1] as Extract<DrawOp, { op: 'image' }>;
    expect(b.blur).toBeGreaterThan(0);
    expect(b.alpha).toBeLessThanOrEqual(0.18);
  });

  it('keeps text contrast above 4.5 on the worst-case backdrop', () => {
    const a = CARD_COLORS.backdropAlpha;
    const bg = hex(CARD_COLORS.bg);
    const mix = (c: number) => bg.map((v) => v * (1 - a) + c * a);
    for (const c of [0, 255]) {
      expect(ratio(hex(CARD_COLORS.text), mix(c))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(hex(CARD_COLORS.muted), mix(c))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('has no cover ops without a cover', () => {
    expect(layoutCard({ ...game, cover: null }).some((o) => o.op === 'image')).toBe(false);
  });

  it('fits a long title inside the narrower width', () => {
    const ops = layoutCard({ ...withCover, title: 'Word '.repeat(60) });
    const right = CARD_WIDTH - 72;
    for (const o of ops) {
      if (o.op === 'text' && o.align === 'left') expect(o.x + estimateMeasure(o.text, o.size, o.font, o.weight)).toBeLessThanOrEqual(right);
    }
    expect(ops.some((o) => o.op === 'text' && o.text.endsWith('…'))).toBe(true);
  });

  it('lays out my globe with 0, 3 and 6 covers', () => {
    const summary = { owned: 10, matched: 8, countries: [{ code: 'JP', percent: 50 }] };
    const count = (n: number) =>
      layoutCard(myGlobeCardSpec(summary, Array.from({ length: n }, (_, i) => `c${i}`))).filter((o) => o.op === 'image');
    expect(count(0)).toHaveLength(0);
    expect(count(3)).toHaveLength(3);
    expect(count(6)).toHaveLength(6);
    expect(count(9)).toHaveLength(6);
    for (const o of count(6)) if (o.op === 'image') expect(o.x + o.w).toBeLessThanOrEqual(CARD_WIDTH - 72);
  });
});

function fakeCtx(filter: boolean) {
  const calls: string[] = [];
  const target: Record<string | symbol, unknown> = {
    measureText: () => ({ width: 10 }),
    drawImage: () => calls.push('drawImage'),
    fillRect: (...a: number[]) => calls.push(`fillRect:${a.join(',')}`),
  };
  if (filter) target.filter = 'none';
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : () => undefined),
    set: (t, k, v) => {
      t[k] = v;
      if (k === 'filter') calls.push(`filter:${String(v)}`);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('drawCard images', () => {
  const img = { width: 264, height: 374 } as never;

  it('draws loaded images and blurs the backdrop with ctx.filter', () => {
    const { ctx, calls } = fakeCtx(true);
    drawCard(ctx, { ...game, cover: 'a' }, new Map([['a', img]]));
    expect(calls.filter((c) => c === 'drawImage')).toHaveLength(2);
    expect(calls.some((c) => c.startsWith('filter:blur('))).toBe(true);
  });

  it('falls back to a downscaled draw when filter is unavailable', () => {
    const small = { getContext: () => ({ drawImage: vi.fn() }), width: 0, height: 0 };
    const real = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((t: string) => (t === 'canvas' ? small : real(t))) as never);
    const { ctx, calls } = fakeCtx(false);
    drawCard(ctx, { ...game, cover: 'a' }, new Map([['a', img]]));
    expect(calls.some((c) => c.startsWith('filter:'))).toBe(false);
    expect(small.width).toBeLessThan(100);
    vi.restoreAllMocks();
  });

  it('draws a placeholder when an image is missing', () => {
    const { ctx, calls } = fakeCtx(true);
    drawCard(ctx, { ...game, cover: 'a' }, new Map([['a', null]]));
    expect(calls).not.toContain('drawImage');
    expect(calls.filter((c) => c.startsWith('fillRect:48,48,'))).toHaveLength(1);
  });
});

describe('loadImages', () => {
  afterEach(() => vi.useRealTimers());

  const fake = (behavior: 'load' | 'error' | 'hang') => () => {
    const el: Record<string, unknown> = { naturalWidth: 264, naturalHeight: 374 };
    Object.defineProperty(el, 'src', {
      set() {
        queueMicrotask(() => {
          if (behavior === 'load') (el.onload as () => void)();
          if (behavior === 'error') (el.onerror as () => void)();
        });
      },
    });
    return el as unknown as HTMLImageElement;
  };

  it('resolves loaded images and uses anonymous CORS', async () => {
    let made: HTMLImageElement | undefined;
    const create = () => (made = fake('load')());
    const map = await loadImages(['a'], 4000, create);
    expect(map.get('a')).toBe(made);
    expect(made!.crossOrigin).toBe('anonymous');
  });

  it('maps failures to null', async () => {
    const map = await loadImages(['a'], 4000, fake('error'));
    expect(map.get('a')).toBeNull();
  });

  it('gives up on a hanging image after 4 seconds', async () => {
    vi.useFakeTimers();
    const p = loadImages(['a', 'b'], 4000, fake('hang'));
    await vi.advanceTimersByTimeAsync(3999);
    let settled = false;
    void p.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const map = await p;
    expect([...map.values()]).toEqual([null, null]);
  });
});
