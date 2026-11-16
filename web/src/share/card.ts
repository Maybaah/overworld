import type { Company, GameDetail, GameSummary } from '@shared';
import { ROLE_GROUPS } from '../data/roles';
import { countryName } from '../ui/format';
import { shareTotal, type ShareResult } from '../guess/share';
import { MAX_GAME_SCORE } from '../guess/scoring';
import type { ShareSummary } from '../myglobe/share';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const BG = '#07090d';
const TEXT = '#e6e9ef';
const MUTED = '#8a93a3';
const ACCENT = '#F0E442';
const BORDER = '#1f2733';
const MARGIN = 72;
const FOOTER_Y = 560;
const CONTENT_WIDTH = CARD_WIDTH - MARGIN * 2;
const PLACEHOLDER = '#1f2733';
const COVER_ASPECT = 264 / 374;
const COVER_MARGIN = 48;
const COVER_H = CARD_HEIGHT - COVER_MARGIN * 2;
const COVER_W = Math.round(COVER_H * COVER_ASPECT);
const TEXT_LEFT = COVER_MARGIN + COVER_W + 48;
const BACKDROP_ALPHA = 0.14;
const BACKDROP_BLUR = 28;
const STRIP_H = 110;
const STRIP_W = Math.round(STRIP_H * COVER_ASPECT);
const STRIP_GAP = 14;
const MAX_STRIP = 6;
export const COVER_URL = 'https://images.igdb.com/igdb/image/upload/t_cover_big/';
export const IMAGE_TIMEOUT_MS = 4000;
export const CARD_COLORS = { bg: BG, text: TEXT, muted: MUTED, backdropAlpha: BACKDROP_ALPHA };

export type FontFamily = 'display' | 'text' | 'mono';

export const FONT_STACKS: Record<FontFamily, string> = {
  display: "'Space Grotesk', system-ui, sans-serif",
  text: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};

export type DrawOp =
  | { op: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { op: 'circle'; x: number; y: number; r: number; fill: string }
  | { op: 'image'; key: string; x: number; y: number; w: number; h: number; radius: number; blur?: number; alpha?: number }
  | { op: 'outline'; x: number; y: number; w: number; h: number; radius: number; color: string }
  | {
      op: 'text';
      text: string;
      x: number;
      y: number;
      size: number;
      color: string;
      font: FontFamily;
      weight: number;
      align: 'left' | 'right';
    };

export type Measure = (text: string, size: number, font: FontFamily, weight: number) => number;

export const estimateMeasure: Measure = (text, size, font) => text.length * size * (font === 'mono' ? 0.6 : 0.54);

export interface GameCardSpec {
  kind: 'game';
  cover?: string | null;
  title: string;
  year: number | null;
  lead: { name: string; place: string | null } | null;
  groups: { label: string; color: string; companies: number; countries: number }[];
}

export interface GuessCardSpec {
  kind: 'guess';
  total: number;
  max: number;
  rows: { distance: string; score: string }[];
}

export interface MyGlobeCardSpec {
  kind: 'myglobe';
  headline: string;
  bars: { label: string; percent: number }[];
  matched: number;
  owned: number;
  covers?: string[];
}

export type CardSpec = GameCardSpec | GuessCardSpec | MyGlobeCardSpec;

export interface FittedText {
  lines: string[];
  size: number;
}

export interface FitOptions {
  maxSize: number;
  minSize: number;
  maxLines: number;
  maxWidth: number;
  font: FontFamily;
  weight: number;
}

function breakLong(word: string, size: number, o: FitOptions, measure: Measure): string[] {
  const parts: string[] = [];
  let part = '';
  for (const ch of Array.from(word)) {
    if (part !== '' && measure(part + ch, size, o.font, o.weight) > o.maxWidth) {
      parts.push(part);
      part = ch;
    } else {
      part += ch;
    }
  }
  if (part !== '') parts.push(part);
  return parts;
}

function wrap(input: string, size: number, o: FitOptions, measure: Measure): string[] {
  const words = input
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (measure(w, size, o.font, o.weight) > o.maxWidth ? breakLong(w, size, o, measure) : [w]));
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line === '' ? w : `${line} ${w}`;
    if (line !== '' && measure(next, size, o.font, o.weight) > o.maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

export function ellipsize(input: string, size: number, width: number, font: FontFamily, weight: number, measure: Measure): string {
  if (measure(input, size, font, weight) <= width) return input;
  const chars = Array.from(input);
  while (chars.length > 0 && measure(`${chars.join('').trimEnd()}…`, size, font, weight) > width) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

export function fitText(input: string, o: FitOptions, measure: Measure): FittedText {
  const clean = input.replace(/\s+/g, ' ').trim();
  for (let size = o.maxSize; size >= o.minSize; size -= 2) {
    const lines = wrap(clean, size, o, measure);
    if (lines.length <= 1) return { lines: lines.length > 0 ? lines : [''], size };
  }
  for (let size = o.maxSize; size >= o.minSize; size -= 2) {
    const lines = wrap(clean, size, o, measure);
    if (lines.length <= o.maxLines) return { lines, size };
  }
  const lines = wrap(clean, o.minSize, o, measure);
  const kept = lines.slice(0, o.maxLines);
  const rest = lines.slice(o.maxLines).join(' ');
  const last = kept[kept.length - 1] ?? '';
  kept[kept.length - 1] = ellipsize(rest === '' ? last : `${last} ${rest}`, o.minSize, o.maxWidth, o.font, o.weight, measure);
  return { lines: kept, size: o.minSize };
}

function text(
  t: string,
  x: number,
  y: number,
  size: number,
  color: string,
  font: FontFamily,
  weight = 400,
  align: 'left' | 'right' = 'left',
): DrawOp {
  return { op: 'text', text: t, x, y, size, color, font, weight, align };
}

function frame(footerRight: string | null, left = MARGIN, backdrop?: DrawOp): DrawOp[] {
  const ops: DrawOp[] = [{ op: 'rect', x: 0, y: 0, w: CARD_WIDTH, h: CARD_HEIGHT, fill: BG }];
  if (backdrop) ops.push(backdrop);
  ops.push(
    { op: 'rect', x: left, y: 40, w: 56, h: 6, fill: ACCENT },
    { op: 'rect', x: left, y: FOOTER_Y - 24, w: CARD_WIDTH - MARGIN - left, h: 1, fill: BORDER },
    text('Overworld', left, FOOTER_Y, 30, TEXT, 'display', 700),
  );
  if (footerRight) ops.push(text(footerRight, CARD_WIDTH - MARGIN, FOOTER_Y + 8, 20, MUTED, 'text', 400, 'right'));
  return ops;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function groupLine(g: GameCardSpec['groups'][number]): string {
  const base = `${g.label} · ${plural(g.companies, 'company', 'companies')}`;
  return g.countries > 0 ? `${base} in ${plural(g.countries, 'country', 'countries')}` : base;
}

function layoutGame(spec: GameCardSpec, measure: Measure): DrawOp[] {
  const cover = spec.cover ?? null;
  const left = cover ? TEXT_LEFT : MARGIN;
  const width = CARD_WIDTH - MARGIN - left;
  const backdrop: DrawOp | undefined = cover
    ? { op: 'image', key: cover, x: 0, y: 0, w: CARD_WIDTH, h: CARD_HEIGHT, radius: 0, blur: BACKDROP_BLUR, alpha: BACKDROP_ALPHA }
    : undefined;
  const ops = frame('Data: IGDB, Wikidata', left, backdrop);
  if (cover) {
    ops.push({ op: 'image', key: cover, x: COVER_MARGIN, y: COVER_MARGIN, w: COVER_W, h: COVER_H, radius: 12 });
    ops.push({ op: 'outline', x: COVER_MARGIN, y: COVER_MARGIN, w: COVER_W, h: COVER_H, radius: 12, color: 'rgba(230,233,239,0.28)' });
  }
  const title = fitText(
    spec.title,
    { maxSize: 64, minSize: 40, maxLines: 2, maxWidth: width, font: 'display', weight: 700 },
    measure,
  );
  let y = 72;
  for (const line of title.lines) {
    ops.push(text(line, left, y, title.size, TEXT, 'display', 700));
    y += Math.round(title.size * 1.12);
  }
  y += 6;
  ops.push(text(spec.year !== null ? String(spec.year) : 'Year unknown', left, y, 30, ACCENT, 'mono', 500));
  y += 48;
  if (spec.lead) {
    const place = spec.lead.place ? ` — ${spec.lead.place}` : '';
    const lead = fitText(
      `Lead studio: ${spec.lead.name}${place}`,
      { maxSize: 30, minSize: 22, maxLines: 1, maxWidth: width, font: 'text', weight: 400 },
      measure,
    );
    ops.push(text(lead.lines[0]!, left, y, lead.size, TEXT, 'text'));
  } else {
    ops.push(text('Lead studio unknown', left, y, 30, MUTED, 'text'));
  }
  y += 52;
  const available = FOOTER_Y - 40 - y;
  const pitch = Math.max(24, Math.min(40, Math.floor(available / Math.max(1, spec.groups.length))));
  const size = Math.min(26, pitch - 6);
  for (const g of spec.groups) {
    ops.push({ op: 'circle', x: left + 9, y: y + size / 2 + 1, r: 8, fill: g.color });
    const line = ellipsize(groupLine(g), size, width - 36, 'text', 400, measure);
    ops.push(text(line, left + 36, y, size, TEXT, 'text'));
    y += pitch;
  }
  return ops;
}

function layoutGuess(spec: GuessCardSpec): DrawOp[] {
  const ops = frame(null);
  ops.push(text('Guess mode', MARGIN, 72, 34, ACCENT, 'display', 700));
  ops.push(text(`${spec.total.toLocaleString('en-US')} / ${spec.max.toLocaleString('en-US')}`, MARGIN, 120, 96, TEXT, 'mono', 600));
  let y = 264;
  for (const r of spec.rows.slice(0, 5)) {
    ops.push(text(r.distance, MARGIN, y, 30, TEXT, 'text'));
    ops.push(text(r.score, MARGIN + 560, y, 30, ACCENT, 'mono', 500, 'right'));
    y += 46;
  }
  return ops;
}

function layoutMyGlobe(spec: MyGlobeCardSpec, measure: Measure): DrawOp[] {
  const ops = frame('Game library data from Steam. Not affiliated with Valve.');
  const head = fitText(
    spec.headline,
    { maxSize: 56, minSize: 36, maxLines: 2, maxWidth: CONTENT_WIDTH, font: 'display', weight: 700 },
    measure,
  );
  let y = 72;
  for (const line of head.lines) {
    ops.push(text(line, MARGIN, y, head.size, TEXT, 'display', 700));
    y += Math.round(head.size * 1.12);
  }
  y += 22;
  const trackX = 372;
  const trackW = 640;
  for (const b of spec.bars.slice(0, 5)) {
    ops.push(text(ellipsize(b.label, 26, trackX - MARGIN - 20, 'text', 400, measure), MARGIN, y, 26, TEXT, 'text'));
    ops.push({ op: 'rect', x: trackX, y: y + 4, w: trackW, h: 22, fill: BORDER });
    const w = Math.round((trackW * Math.min(100, Math.max(0, b.percent))) / 100);
    if (w > 0) ops.push({ op: 'rect', x: trackX, y: y + 4, w, h: 22, fill: ACCENT });
    ops.push(text(`${b.percent}%`, CARD_WIDTH - MARGIN, y, 26, TEXT, 'mono', 500, 'right'));
    y += 44;
  }
  const matched = `${spec.matched.toLocaleString('en-US')} of ${spec.owned.toLocaleString('en-US')} games matched`;
  ops.push(text(matched, MARGIN, FOOTER_Y - 70, 26, MUTED, 'text'));
  const covers = (spec.covers ?? []).slice(0, MAX_STRIP);
  const stripX = CARD_WIDTH - MARGIN - (covers.length * STRIP_W + Math.max(0, covers.length - 1) * STRIP_GAP);
  covers.forEach((key, i) => {
    const x = stripX + i * (STRIP_W + STRIP_GAP);
    const y = FOOTER_Y - 24 - 16 - STRIP_H;
    ops.push({ op: 'image', key, x, y, w: STRIP_W, h: STRIP_H, radius: 8 });
    ops.push({ op: 'outline', x, y, w: STRIP_W, h: STRIP_H, radius: 8, color: 'rgba(230,233,239,0.28)' });
  });
  return ops;
}

export function layoutCard(spec: CardSpec, measure: Measure = estimateMeasure): DrawOp[] {
  if (spec.kind === 'game') return layoutGame(spec, measure);
  if (spec.kind === 'guess') return layoutGuess(spec);
  return layoutMyGlobe(spec, measure);
}

export type LoadedImage = CanvasImageSource & { width: number; height: number };
export type ImageMap = ReadonlyMap<string, LoadedImage | null>;

export function imageKeys(ops: DrawOp[]): string[] {
  return [...new Set(ops.flatMap((o) => (o.op === 'image' ? [o.key] : [])))];
}

export function loadImages(
  keys: string[],
  timeoutMs = IMAGE_TIMEOUT_MS,
  create: () => HTMLImageElement = () => new Image(),
): Promise<Map<string, LoadedImage | null>> {
  const one = (key: string) =>
    new Promise<LoadedImage | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      const done = (v: LoadedImage | null) => {
        clearTimeout(timer);
        resolve(v);
      };
      try {
        const img = create();
        img.crossOrigin = 'anonymous';
        img.onload = () => done(img.naturalWidth > 0 ? (img as LoadedImage) : null);
        img.onerror = () => done(null);
        img.src = `${COVER_URL}${key}.jpg`;
      } catch {
        done(null);
      }
    });
  return Promise.all(keys.map(async (k) => [k, await one(k)] as const)).then((entries) => new Map(entries));
}

function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCover(ctx: CanvasRenderingContext2D, img: LoadedImage, x: number, y: number, w: number, h: number, blur: number): void {
  const el = img as { naturalWidth?: number; naturalHeight?: number };
  const iw = el.naturalWidth || img.width;
  const ih = el.naturalHeight || img.height;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  if (blur <= 0) {
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    return;
  }
  if (typeof (ctx as { filter?: unknown }).filter === 'string') {
    const pad = blur * 2;
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(img, sx, sy, sw, sh, x - pad, y - pad, w + pad * 2, h + pad * 2);
    ctx.filter = 'none';
    return;
  }
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(w / blur));
  small.height = Math.max(1, Math.round(h / blur));
  const sctx = small.getContext('2d');
  if (!sctx) {
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    return;
  }
  sctx.drawImage(img, sx, sy, sw, sh, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
}

export function drawCard(ctx: CanvasRenderingContext2D, spec: CardSpec, images: ImageMap = new Map()): void {
  const measure: Measure = (t, size, font, weight) => {
    ctx.font = `${weight} ${size}px ${FONT_STACKS[font]}`;
    return ctx.measureText(t).width;
  };
  ctx.textBaseline = 'top';
  for (const op of layoutCard(spec, measure)) {
    if (op.op === 'rect') {
      ctx.fillStyle = op.fill;
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.op === 'circle') {
      ctx.fillStyle = op.fill;
      ctx.beginPath();
      ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (op.op === 'image') {
      const img = images.get(op.key) ?? null;
      ctx.save();
      ctx.globalAlpha = op.alpha ?? 1;
      roundedPath(ctx, op.x, op.y, op.w, op.h, op.radius);
      ctx.clip();
      if (img) {
        drawCover(ctx, img, op.x, op.y, op.w, op.h, op.blur ?? 0);
      } else {
        ctx.fillStyle = PLACEHOLDER;
        ctx.fillRect(op.x, op.y, op.w, op.h);
      }
      ctx.restore();
    } else if (op.op === 'outline') {
      ctx.save();
      roundedPath(ctx, op.x + 0.5, op.y + 0.5, op.w - 1, op.h - 1, op.radius);
      ctx.strokeStyle = op.color;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.font = `${op.weight} ${op.size}px ${FONT_STACKS[op.font]}`;
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
}

async function fontsReady(): Promise<void> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) return;
    await Promise.all(
      (Object.keys(FONT_STACKS) as FontFamily[]).flatMap((f) => [
        fonts.load(`400 24px ${FONT_STACKS[f]}`),
        fonts.load(`700 24px ${FONT_STACKS[f]}`),
      ]),
    );
  } catch {
    return;
  }
}

export async function cardToBlob(spec: CardSpec): Promise<Blob> {
  await fontsReady();
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  const images = await loadImages(imageKeys(layoutCard(spec)));
  drawCard(ctx, spec, images);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image'))), 'image/png');
  });
}

export function gameCardSpec(
  game: Pick<GameSummary, 'name' | 'year'> & { cover?: string | null },
  lead: Pick<Company, 'name' | 'city' | 'country'> | undefined,
  detail: Pick<GameDetail, 'roles'> | null,
  companyById: ReadonlyMap<number, Pick<Company, 'country'>>,
): GameCardSpec {
  const groups: GameCardSpec['groups'] = [];
  for (const g of ROLE_GROUPS) {
    const ids = new Set<number>();
    const countries = new Set<string>();
    for (const r of detail?.roles ?? []) {
      if (!g.roles.includes(r.role)) continue;
      ids.add(r.companyId);
      const country = companyById.get(r.companyId)?.country;
      if (country) countries.add(country);
    }
    if (ids.size > 0) groups.push({ label: g.label, color: g.color, companies: ids.size, countries: countries.size });
  }
  const place = lead?.country ? (lead.city ? `${lead.city}, ${countryName(lead.country)}` : countryName(lead.country)) : null;
  return { kind: 'game', cover: game.cover ?? null, title: game.name, year: game.year, lead: lead ? { name: lead.name, place } : null, groups };
}

export function guessCardSpec(result: ShareResult): GuessCardSpec {
  return {
    kind: 'guess',
    total: shareTotal(result),
    max: MAX_GAME_SCORE,
    rows: result.rounds.map((r, i) => ({
      distance: `${i + 1}. ${Math.round(r.km).toLocaleString('en-US')} km${r.hint ? ' (hint)' : ''}`,
      score: r.score.toLocaleString('en-US'),
    })),
  };
}

export function myGlobeHeadline(summary: ShareSummary): string {
  const top = summary.countries[0];
  if (top) return `${top.percent}% of my games come from ${countryName(top.code)}`;
  return summary.matched === 0 ? 'None of my games were found in Overworld' : 'None of my games have a known studio location';
}

export function myGlobeCardSpec(summary: ShareSummary, covers: string[] = []): MyGlobeCardSpec {
  return {
    kind: 'myglobe',
    headline: myGlobeHeadline(summary),
    bars: summary.countries.slice(0, 5).map((c) => ({ label: countryName(c.code), percent: c.percent })),
    matched: summary.matched,
    owned: summary.owned,
    covers: covers.slice(0, MAX_STRIP),
  };
}
