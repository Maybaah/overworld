import { describe, expect, it } from 'vitest';
import { findTileEngine, imageryVerdict, loadedTileCount, TileRepair, tileUrl } from './tiles';

describe('tileUrl', () => {
  it('builds the EOX 2016 Web Mercator WMTS URL with row before column', () => {
    expect(tileUrl(5, 3, 4)).toBe(
      'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/4/3/5.jpg',
    );
  });

  it('never uses a later, non-commercial year layer', () => {
    expect(tileUrl(0, 0, 0)).not.toMatch(/s2cloudless-20\d\d/);
  });
});

describe('imageryVerdict', () => {
  it('turns imagery on as soon as one tile has loaded', () => {
    expect(imageryVerdict(1, 0)).toBe('on');
    expect(imageryVerdict(3, 60000)).toBe('on');
  });

  it('waits, then falls back when nothing loads', () => {
    expect(imageryVerdict(0, 2000, 10000)).toBe('pending');
    expect(imageryVerdict(0, 10000, 10000)).toBe('off');
  });
});

describe('tile engine helpers', () => {
  it('finds the engine in a scene and counts textured tiles only', () => {
    const engine = {
      children: [{ material: { map: {} } }, { material: { map: null } }, { material: { map: {} } }, {}],
      clearTiles() {},
      updatePov() {},
    };
    const root = { traverse: (fn: (o: unknown) => void) => [{}, engine, {}].forEach(fn) };
    const found = findTileEngine(root);
    expect(found).toBe(engine);
    expect(loadedTileCount(found!)).toBe(2);
    expect(findTileEngine({ traverse: (fn) => [{}].forEach(fn) })).toBeNull();
  });
});

describe('TileRepair', () => {
  it('checks each new tile once and re-fetches only the broken ones', async () => {
    const maps = Array.from({ length: 3 }, (_, i) => ({ image: { src: `t${i}` }, needsUpdate: false }));
    const engine = { children: maps.map((map) => ({ material: { map } })), clearTiles() {}, updatePov() {} };
    const decoded: unknown[] = [];
    const refetched: unknown[] = [];
    const repair = new TileRepair({
      decodes: async (m) => {
        decoded.push(m);
        return m !== maps[1];
      },
      refetch: async (m) => {
        refetched.push(m);
        return true;
      },
    });
    repair.tick(engine);
    repair.tick(engine);
    await new Promise((r) => setTimeout(r, 0));
    expect(decoded).toHaveLength(3);
    expect(refetched).toEqual([maps[1]]);
    expect(repair.repaired).toBe(1);
  });

  it('limits how many checks run at once', () => {
    const maps = Array.from({ length: 10 }, () => ({ image: {}, needsUpdate: false }));
    const engine = { children: maps.map((map) => ({ material: { map } })), clearTiles() {}, updatePov() {} };
    let started = 0;
    const repair = new TileRepair({ decodes: () => (started++, new Promise(() => {})), refetch: async () => false }, 4);
    repair.tick(engine);
    repair.tick(engine);
    expect(started).toBe(4);
  });
});
