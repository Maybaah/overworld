import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Topology } from 'topojson-specification';
import atlas from 'world-atlas/countries-50m.json';
import type { Company, GameSummary } from '@shared';
import { countryRegions, MosaicBuilder, type Layout } from '../src/globe/mosaic/build';
import { countryShapesOf } from '../src/globe/atlas';
import { encodeLayouts, gamesUpTo, mosaicInput } from '../src/globe/mosaic/layouts';

const FIRST_YEAR = 1970;
const here = path.dirname(fileURLToPath(import.meta.url));
const dataArg = process.argv.find((a) => a.startsWith('--data='))?.slice(7);
const dataDir = path.resolve(here, '..', dataArg ?? 'public/data');

const games = JSON.parse(await readFile(path.join(dataDir, 'games.json'), 'utf8')) as GameSummary[];
const companies = new Map((JSON.parse(await readFile(path.join(dataDir, 'companies.json'), 'utf8')) as Company[]).map((c) => [c.id, c]));
const regions = countryRegions(countryShapesOf(atlas as unknown as Topology));
const input = mosaicInput(games, companies);
const lastYear = Math.max(FIRST_YEAR, ...games.map((g) => g.year ?? 0));

const builder = new MosaicBuilder(regions);
const years: [number, Layout][] = [];
const t0 = performance.now();
for (let y = FIRST_YEAR; y <= lastYear; y++) {
  const { countries } = builder.build(gamesUpTo(input, y, lastYear));
  years.push([y, builder.layoutOf(countries)]);
  if (y % 10 === 0) console.log(`mosaic layouts: ${y} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
}
const buf = encodeLayouts(input, years);
await writeFile(path.join(dataDir, 'mosaic-layouts.bin'), Buffer.from(buf));
console.log(`mosaic layouts: ${years.length} years, ${(buf.byteLength / 1e6).toFixed(1)} MB`);
