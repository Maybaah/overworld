import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldAtlas from 'world-atlas/countries-110m.json';

export interface CountryShape {
  id?: string | number;
  geometry: { type: string; coordinates: number[] };
}

export function loadCountryShapes(): CountryShape[] {
  const topology = worldAtlas as unknown as Topology;
  const collection = feature(topology, topology.objects.countries as GeometryCollection);
  return collection.features as unknown as CountryShape[];
}
