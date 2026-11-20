/// <reference lib="webworker" />
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { CountryShape } from '../countries';
import { countryRegions, MosaicBuilder, type BuildResult, type CountryMosaic, type CountryRegion, type Layout, type MosaicFocus } from './build';
import { pointInRing, type Pt } from './geometry';
import { decodeLayouts, gamesUpTo } from './layouts';
import type { BuildRequest, MosaicRequest, MosaicResponse, WorkerGame } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let games: WorkerGame[] = [];
let regions: Map<string, CountryRegion> | null = null;
let builder: MosaicBuilder | null = null;
let layouts: Map<number, Layout> | null = null;
let shown = new Map<string, CountryMosaic>();
let ready: Promise<void> | null = null;
let queued: BuildRequest | null = null;
let running = false;
let lastYear: number | null = null;
let direction = 0;
const prefetched = new Map<string, BuildResult>();

async function init(layoutsUrl: string): Promise<void> {
  const [mod, buf] = await Promise.all([
    import('world-atlas/countries-50m.json'),
    fetch(layoutsUrl)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null),
  ]);
  const topo = mod.default as unknown as Topology;
  const shapes = feature(topo, topo.objects.countries as GeometryCollection).features as unknown as CountryShape[];
  regions = countryRegions(shapes);
  builder = new MosaicBuilder(regions);
  layouts = buf ? decodeLayouts(buf, games) : null;
}

function pick(lat: number, lng: number): number | null {
  if (!regions) return null;
  for (const [code, m] of shown) {
    const r = regions.get(code);
    if (!r) continue;
    const p: Pt = r.projection.forward(lat, lng);
    for (const piece of m.pieces) {
      if (p[0] < piece.box[0] || p[0] > piece.box[2] || p[1] < piece.box[1] || p[1] > piece.box[3]) continue;
      if (pointInRing(p, piece.outer) && !piece.holes.some((h) => pointInRing(p, h))) return piece.gameId;
    }
  }
  return null;
}

function keyOf(year: number, focus: MosaicFocus | null, pinned: number | null): string {
  return `${year}|${pinned ?? ''}|${focus ? `${focus.lat.toFixed(1)},${focus.lng.toFixed(1)},${focus.radius.toFixed(1)},${focus.zoom}` : ''}`;
}

function build(year: number, maxYear: number, filter: number[] | null, focus: MosaicFocus | null, pinned: number | null): BuildResult {
  const set = filter ? new Set(filter) : null;
  const chosen = set ? gamesUpTo(games, year, maxYear).filter((g) => set.has(g.id)) : gamesUpTo(games, year, maxYear);
  const layout = set ? undefined : layouts?.get(Math.min(year, maxYear));
  if (layout) builder!.useLayout(layout);
  return builder!.build(chosen, focus, !!layout, pinned);
}

function respond(msg: BuildRequest, result: BuildResult, ms: number, last: boolean): void {
  shown = result.countries;
  const { mesh } = result;
  const res: MosaicResponse = { type: 'mesh', seq: msg.seq, year: msg.year, mesh, ms, last };
  self.postMessage(res, [mesh.position.buffer, mesh.uv.buffer, mesh.cell.buffer, mesh.lines.buffer]);
}

function focusSteps(focus: MosaicFocus | null): (MosaicFocus | null)[] {
  if (!focus || focus.zoom <= FIRST_STEP) return [focus];
  const out: MosaicFocus[] = [];
  for (let z = FIRST_STEP; z < focus.zoom; z *= 2) out.push({ ...focus, zoom: z });
  out.push(focus);
  return out;
}

const FIRST_STEP = 4;
let steps: { msg: BuildRequest; focus: MosaicFocus | null }[] = [];

function pump(): void {
  if (running) return;
  running = true;
  setTimeout(() => {
    running = false;
    const msg = queued;
    if (msg) {
      queued = null;
      if (lastYear !== null && msg.year !== lastYear) direction = Math.sign(msg.year - lastYear);
      lastYear = msg.year;
      steps = focusSteps(msg.focus).map((focus) => ({ msg, focus }));
    }
    const step = steps.shift();
    if (!step) return;
    const { msg: m, focus } = step;
    const key = keyOf(m.year, focus, m.pinned);
    const t0 = performance.now();
    const ready = m.filter ? null : prefetched.get(key);
    prefetched.clear();
    respond(m, ready ?? build(m.year, m.maxYear, m.filter, focus, m.pinned), performance.now() - t0, steps.length === 0 && queued === null);
    if (steps.length > 0) pump();
    else if (!m.filter && direction !== 0) {
      const next = m.year + direction;
      if (next >= 1970 && next <= m.maxYear) prefetchLater({ ...m, year: next });
    }
  }, 0);
}

function prefetchLater(msg: BuildRequest): void {
  setTimeout(() => {
    if (queued || running) return;
    prefetched.set(keyOf(msg.year, msg.focus, msg.pinned), build(msg.year, msg.maxYear, null, msg.focus, msg.pinned));
  }, 0);
}

self.onmessage = async (ev: MessageEvent<MosaicRequest>) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    games = msg.games;
    ready = init(msg.layoutsUrl);
    return;
  }
  await ready;
  if (msg.type === 'pick') {
    const res: MosaicResponse = { type: 'pick', seq: msg.seq, gameId: pick(msg.lat, msg.lng) };
    self.postMessage(res);
    return;
  }
  queued = msg;
  steps = [];
  pump();
};
