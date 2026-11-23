import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import type { Topology } from 'topojson-specification';
import atlas from 'world-atlas/countries-50m.json';
import type { Company, GameSummary } from '@shared';
import { cellBudget, countryRegions, DEFAULT_OPTIONS } from '../src/globe/mosaic/build';
import { countryShapesOf } from '../src/globe/atlas';
import { SPRITE_LAYOUT, type SpriteIndex } from '../src/globe/mosaic/sprites';
import { TITLE_PREFIX, titleKey } from '../src/globe/titleCovers';
import { titleCardSvg } from './title-cards';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataArg = process.argv.find((a) => a.startsWith('--data='))?.slice(7);
const dataDir = path.resolve(here, '..', dataArg ?? 'public/data');
const cacheDir = path.resolve(here, '..', '..', 'pipeline', '.cache', 'http', 'covers');
const outDir = path.join(dataDir, 'covers');
const FIRST_YEAR = 1970;
const CONCURRENCY = 8;

const games = JSON.parse(await readFile(path.join(dataDir, 'games.json'), 'utf8')) as GameSummary[];
const companies = new Map((JSON.parse(await readFile(path.join(dataDir, 'companies.json'), 'utf8')) as Company[]).map((c) => [c.id, c]));
const regions = countryRegions(countryShapesOf(atlas as unknown as Topology));
const areas = new Map([...regions].map(([c, r]) => [c, r.area]));

const placed = games.flatMap((g) => {
  const c = companies.get(g.leadCompanyId);
  return c?.country && c.lat !== null && regions.has(c.country) ? [{ g, country: c.country }] : [];
});
const lastYear = Math.max(...games.map((g) => g.year ?? 0));
const wanted = new Set<number>();
for (let y = FIRST_YEAR; y <= lastYear; y++) {
  const byCountry = new Map<string, GameSummary[]>();
  for (const { g, country } of placed) {
    if ((g.year ?? lastYear) > y) continue;
    let list = byCountry.get(country);
    if (!list) byCountry.set(country, (list = []));
    list.push(g);
  }
  const budget = cellBudget(new Map([...byCountry].map(([c, l]) => [c, l.length])), areas, DEFAULT_OPTIONS);
  for (const [c, list] of byCountry) for (const g of list.slice(0, budget.get(c) ?? 1)) wanted.add(g.id);
}
const covers = games.filter((g) => wanted.has(g.id)).map((g) => g.cover ?? titleKey(g.id));
const cardOf = new Map(games.filter((g) => !g.cover).map((g) => [titleKey(g.id), g]));
const regionName = new Intl.DisplayNames(['en'], { type: 'region' });
const cards = new Map<string, Buffer>();
async function titleCard(key: string): Promise<Buffer | null> {
  const g = cardOf.get(key);
  if (!g) return null;
  const c = companies.get(g.leadCompanyId);
  const byline = c?.country ? (regionName.of(c.country) ?? c.country) : (c?.name ?? '');
  const png = await sharp(Buffer.from(titleCardSvg(g.name, byline, g.year))).png().toBuffer();
  cards.set(key, png);
  return png;
}
console.log(`cover sprites: ${covers.length} covers from ${placed.length} placed games, years ${FIRST_YEAR}-${lastYear}`);

await mkdir(cacheDir, { recursive: true });
async function fetchCover(id: string): Promise<Buffer | null> {
  if (id.startsWith(TITLE_PREFIX)) return titleCard(id);
  const file = path.join(cacheDir, `${id}.jpg`);
  if (existsSync(file)) return readFile(file);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://images.igdb.com/igdb/image/upload/t_cover_small/${id}.jpg`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(file, buf);
      return buf;
    } catch {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return null;
}

const tiles: { id: string; tile: Buffer }[] = [];
let next = 0;
let missing = 0;
const { imageW, imageH, slotW, slotH, size } = SPRITE_LAYOUT;
const pad = (slotW - imageW) / 2;
async function worker(): Promise<void> {
  while (next < covers.length) {
    const id = covers[next++]!;
    const buf = await fetchCover(id);
    if (!buf) {
      missing++;
      continue;
    }
    const tile = await sharp(buf)
      .resize(imageW, imageH, { fit: 'cover' })
      .extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: 'copy' })
      .removeAlpha()
      .raw()
      .toBuffer();
    tiles.push({ id, tile });
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const order = new Map(covers.map((c, i) => [c, i]));
tiles.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

const cols = Math.floor(size / slotW);
const perPage = cols * Math.floor(size / slotH);
const pages = Math.ceil(tiles.length / perPage);
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const slots: SpriteIndex['slots'] = {};
for (let p = 0; p < pages; p++) {
  const page = tiles.slice(p * perPage, (p + 1) * perPage);
  const composite = page.map((t, i) => {
    slots[t.id] = [p, i];
    return { input: t.tile, raw: { width: slotW, height: slotH, channels: 3 as const }, left: (i % cols) * slotW, top: Math.floor(i / cols) * slotH };
  });
  await sharp({ create: { width: size, height: size, channels: 3, background: { r: 24, g: 24, b: 27 } } })
    .composite(composite)
    .webp({ quality: 78 })
    .toFile(path.join(outDir, `sprite-${p}.webp`));
}
await mkdir(path.join(outDir, 'title'), { recursive: true });
for (const key of cardOf.keys()) if (!cards.has(key)) await titleCard(key);
for (const [key, png] of cards) await sharp(png).webp({ quality: 86 }).toFile(path.join(outDir, 'title', `${key}.webp`));
const index: SpriteIndex = { version: 1, pages, slots };
await writeFile(path.join(outDir, 'index.json'), JSON.stringify(index));
console.log(`cover sprites: ${tiles.length} packed into ${pages} pages, ${cards.size} title cards, ${missing} missing`);
