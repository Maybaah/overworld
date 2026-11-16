/// <reference lib="webworker" />
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { CountryShape } from '../countries';
import { countryRegions, MosaicBuilder, type CountryRegion, type MosaicGame } from './build';
import { pointInRing, type Pt } from './geometry';
import type { MosaicRequest, MosaicResponse, WorkerGame } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let games: WorkerGame[] = [];
let regions: Map<string, CountryRegion> | null = null;
let builder: MosaicBuilder | null = null;
let ready: Promise<void> | null = null;

async function init(): Promise<void> {
  const mod = await import('world-atlas/countries-50m.json');
  const topo = mod.default as unknown as Topology;
  const shapes = feature(topo, topo.objects.countries as GeometryCollection).features as unknown as CountryShape[];
  regions = countryRegions(shapes);
  builder = new MosaicBuilder(regions);
}

function pick(lat: number, lng: number): number | null {
  if (!builder || !regions) return null;
  for (const [code, r] of regions) {
    const pieces = builder.piecesOf(code);
    if (!pieces) continue;
    const p: Pt = r.projection.forward(lat, lng);
    for (const piece of pieces) {
      if (p[0] < piece.box[0] || p[0] > piece.box[2] || p[1] < piece.box[1] || p[1] > piece.box[3]) continue;
      if (pointInRing(p, piece.outer) && !piece.holes.some((h) => pointInRing(p, h))) return piece.gameId;
    }
  }
  return null;
}

self.onmessage = async (ev: MessageEvent<MosaicRequest>) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    games = msg.games;
    ready = init();
    return;
  }
  await ready;
  if (msg.type === 'pick') {
    const res: MosaicResponse = { type: 'pick', seq: msg.seq, gameId: pick(msg.lat, msg.lng) };
    self.postMessage(res);
    return;
  }
  const filter = msg.filter ? new Set(msg.filter) : null;
  const chosen: MosaicGame[] = [];
  for (const g of games) {
    const y = g.year === null ? msg.maxYear : g.year;
    if (y > msg.year) continue;
    if (filter && !filter.has(g.id)) continue;
    chosen.push(g);
  }
  const t0 = performance.now();
  const mesh = builder!.build(chosen);
  const res: MosaicResponse = { type: 'mesh', seq: msg.seq, mesh, ms: performance.now() - t0 };
  self.postMessage(res, [mesh.position.buffer, mesh.uv.buffer, mesh.cell.buffer, mesh.lines.buffer]);
};
