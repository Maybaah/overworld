import type { Company, GameSummary } from '@shared';
import type { Layout } from './build';
import type { WorkerGame } from './protocol';

// Precomputed mosaic layouts for every year (web/scripts/mosaic-layouts.ts), so the year slider only has to
// cut cells instead of fitting them. Binary, little endian:
// magic, game count, game id hash, year count, then per year: year, record count, records of
// (id: game id, or minus the anchor game id for a metro area; x, y, weight, fitted area as float32).
// Each year stores only the sites that changed since the year before.
const MAGIC = 0x324f534d;
const RECORD = 20;

export function mosaicInput(games: readonly GameSummary[], companyById: ReadonlyMap<number, Company>): WorkerGame[] {
  return games.flatMap((g) => {
    const c = companyById.get(g.leadCompanyId);
    if (!c || !c.country || c.lat === null || c.lng === null) return [];
    return [{ id: g.id, cover: g.cover, popularity: g.popularity, lat: c.lat, lng: c.lng, country: c.country, exact: c.precision === 'city', year: g.year }];
  });
}

export function inputHash(games: readonly WorkerGame[]): number {
  let h = 2166136261;
  for (const g of games) {
    h = Math.imul(h ^ g.id, 16777619);
    h = Math.imul(h ^ (g.year ?? 0), 16777619);
  }
  return h >>> 0;
}

export function gamesUpTo(games: readonly WorkerGame[], year: number, maxYear: number): WorkerGame[] {
  return games.filter((g) => (g.year === null ? maxYear : g.year) <= year);
}

function parseKey(key: string): number {
  return key.startsWith('g') ? Number(key.slice(1)) : -Number(key.slice(key.indexOf(':') + 1));
}

export function encodeLayouts(games: readonly WorkerGame[], years: [number, Layout][]): ArrayBuffer {
  const running = new Map<string, string>();
  const deltas = years.map(([year, layout]) => {
    const out: [number, Float32Array][] = [];
    for (const [k, v] of layout) {
      const f = Float32Array.from(v);
      const sig = f.join(',');
      if (running.get(k) === sig) continue;
      running.set(k, sig);
      out.push([parseKey(k), f]);
    }
    return [year, out] as const;
  });
  const size = 16 + deltas.reduce((a, [, d]) => a + 8 + d.length * RECORD, 0);
  const view = new DataView(new ArrayBuffer(size));
  let o = 0;
  const u32 = (v: number) => {
    view.setUint32(o, v, true);
    o += 4;
  };
  u32(MAGIC);
  u32(games.length);
  u32(inputHash(games));
  u32(deltas.length);
  for (const [year, d] of deltas) {
    u32(year);
    u32(d.length);
    for (const [id, f] of d) {
      view.setInt32(o, id, true);
      for (let k = 0; k < 4; k++) view.setFloat32(o + 4 + 4 * k, f[k]!, true);
      o += RECORD;
    }
  }
  return view.buffer;
}

// Returns null when the file was made for other data.
export function decodeLayouts(buf: ArrayBuffer, games: readonly WorkerGame[]): Map<number, Layout> | null {
  const view = new DataView(buf);
  if (buf.byteLength < 16 || view.getUint32(0, true) !== MAGIC) return null;
  if (view.getUint32(4, true) !== games.length || view.getUint32(8, true) !== inputHash(games)) return null;
  const countryOf = new Map(games.map((g) => [g.id, g.country]));
  const years = view.getUint32(12, true);
  const running: Layout = new Map();
  const out = new Map<number, Layout>();
  let o = 16;
  for (let i = 0; i < years; i++) {
    const year = view.getUint32(o, true);
    const n = view.getUint32(o + 4, true);
    o += 8;
    for (let k = 0; k < n; k++, o += RECORD) {
      const id = view.getInt32(o, true);
      const key = id >= 0 ? `g${id}` : `m${countryOf.get(-id)}:${-id}`;
      running.set(key, [view.getFloat32(o + 4, true), view.getFloat32(o + 8, true), view.getFloat32(o + 12, true), view.getFloat32(o + 16, true)]);
    }
    out.set(year, new Map(running));
  }
  return out;
}
