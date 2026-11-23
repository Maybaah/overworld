import { feature, mergeArcs } from 'topojson-client';
import type { GeometryCollection, MultiPolygon, Polygon, Topology } from 'topojson-specification';
import type { CountryShape } from './countries';

const RUSSIA = '643';
const UKRAINE = '804';
const SIMFEROPOL: [number, number] = [34.1, 44.95];

export function ringContains(ring: number[][], [x, y]: [number, number]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi = 0, yi = 0] = ring[i]!;
    const [xj = 0, yj = 0] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function withCrimeaInUkraine(topology: Topology): Topology {
  const countries = topology.objects.countries as GeometryCollection;
  const russia = countries.geometries.find((g) => String(g.id) === RUSSIA);
  const ukraine = countries.geometries.find((g) => String(g.id) === UKRAINE);
  if (russia?.type !== 'MultiPolygon') return topology;
  if (ukraine?.type !== 'Polygon' && ukraine?.type !== 'MultiPolygon') return topology;
  const crimea = russia.arcs.findIndex((arcs) => {
    const outer = feature(topology, { type: 'Polygon', arcs } as Polygon).geometry.coordinates[0];
    return outer !== undefined && ringContains(outer, SIMFEROPOL);
  });
  if (crimea < 0) return topology;
  const merged = mergeArcs(topology, [ukraine as Polygon | MultiPolygon, { type: 'Polygon', arcs: russia.arcs[crimea]! }]);
  const geometries = countries.geometries.map((g) => {
    if (g === russia) return { ...russia, arcs: russia.arcs.filter((_, i) => i !== crimea) };
    if (g === ukraine) return { ...ukraine, type: merged.type, arcs: merged.arcs };
    return g;
  });
  return { ...topology, objects: { ...topology.objects, countries: { ...countries, geometries } } } as Topology;
}

export function countryShapesOf(topology: Topology): CountryShape[] {
  const fixed = withCrimeaInUkraine(topology);
  return feature(fixed, fixed.objects.countries as GeometryCollection).features as unknown as CountryShape[];
}
