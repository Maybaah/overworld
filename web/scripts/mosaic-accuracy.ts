import { readFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import atlas from 'world-atlas/countries-50m.json';
import { countryRegions, MosaicBuilder, DEFAULT_OPTIONS, type MosaicGame } from '../src/globe/mosaic/build';
const games = JSON.parse(readFileSync('public/data/games.json', 'utf8'));
const companies = new Map(JSON.parse(readFileSync('public/data/companies.json', 'utf8')).map((c: any) => [c.id, c]));
const regions = countryRegions((feature(atlas as any, (atlas as any).objects.countries) as any).features);
const all: MosaicGame[] = games.flatMap((g: any) => { const c: any = companies.get(g.leadCompanyId); return c && c.country && c.lat !== null ? [{ id: g.id, cover: g.cover, popularity: g.popularity, lat: c.lat, lng: c.lng, country: c.country, exact: c.precision === 'city' }] : []; });
const byId = new Map(all.map((g) => [g.id, g]));
for (const tether of [0.3, 0.15, 0.05]) {
  const t = performance.now();
  const m = new MosaicBuilder(regions, { ...DEFAULT_OPTIONS, tether }).build(all);
  const ms = performance.now() - t;
  const per = new Map<string, { T: number; A: number }>();
  for (const c of m.cells) { const g = byId.get(c.gameId)!; const p = per.get(g.country) ?? { T: 0, A: 0 }; p.T += g.popularity ** 0.7; p.A += c.area; per.set(g.country, p); }
  let wrong = 0, tot = 0; const ratios: number[] = [];
  for (const c of m.cells) { const g = byId.get(c.gameId)!; const p = per.get(g.country)!; const want = (g.popularity ** 0.7 / p.T) * p.A; wrong += Math.abs(c.area - want) / 2; tot += c.area; ratios.push(c.area / want); }
  const top = m.cells.map((c, i) => [byId.get(c.gameId)!.popularity, ratios[i]!] as const).sort((a, b) => b[0] - a[0]).slice(0, 30).map((x) => x[1]);
  const dist = m.cells.map((c) => { const g = byId.get(c.gameId)!; return g.exact ? Math.hypot(c.lat - g.lat, (c.lng - g.lng) * Math.cos(g.lat * Math.PI / 180)) : 0; }).sort((a, b) => a - b);
  console.log(`tether ${tether}: ${ms.toFixed(0)}ms cells ${m.cells.length} misassigned ${(wrong / tot * 100).toFixed(1)}% top30 ratio median ${top.sort((a, b) => a - b)[15]!.toFixed(2)} min ${top[0]!.toFixed(2)} | cell centre to studio km median ${(dist[dist.length >> 1]! * 111).toFixed(0)} p90 ${(dist[Math.floor(dist.length * 0.9)]! * 111).toFixed(0)}`);
}
{
  const names = new Map(games.map((g: any) => [g.id, g.name]));
  const m = new MosaicBuilder(regions, { ...DEFAULT_OPTIONS, tether: 0.1 }).build(all);
  const per = new Map<string, { T: number; A: number; n: number }>();
  for (const c of m.cells) { const g = byId.get(c.gameId)!; const p = per.get(g.country) ?? { T: 0, A: 0, n: 0 }; p.T += g.popularity ** 0.7; p.A += c.area; p.n++; per.set(g.country, p); }
  const rows = m.cells.map((c) => { const g = byId.get(c.gameId)!; const p = per.get(g.country)!; return { name: names.get(g.id), country: g.country, pop: g.popularity, ratio: c.area / ((g.popularity ** 0.7 / p.T) * p.A), n: p.n, exact: g.exact }; }).sort((a, b) => b.pop - a.pop).slice(0, 60).filter((r) => r.ratio < 0.4);
  console.log(rows);
}
