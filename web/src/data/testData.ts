import type { Company, GameSummary } from '@shared';

export function company(id: number, over: Partial<Company> = {}): Company {
  return {
    id,
    name: `Company ${id}`,
    country: 'JP',
    city: 'Tokyo',
    lat: 35.68,
    lng: 139.69,
    precision: 'city',
    locationSource: null,
    founded: null,
    parentId: null,
    firstYear: null,
    lastYear: null,
    gameCount: 0,
    leadCount: 0,
    sources: [],
    ...over,
  };
}

export function game(id: number, over: Partial<GameSummary> = {}): GameSummary {
  return {
    id,
    name: `Game ${id}`,
    slug: `game-${id}`,
    year: 2000,
    leadCompanyId: 1,
    popularity: 0,
    genres: [],
    cover: null,
    indie: false,
    ...over,
  };
}
