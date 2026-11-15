import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { ROLE_TYPES } from '@shared';
import type { DataMeta, GameDetail, LeadBasis } from '@shared';
import { useStore } from '../data/store';
import { buildIndexes } from '../data/indexes';
import { buildTimeline } from '../data/timeline';
import { company, game } from '../data/testData';

afterEach(() => {
  cleanup();
});

export const companies = [
  company(1, { name: 'Alpha Studio', founded: 1990, parentId: 2, leadCount: 2, gameCount: 3 }),
  company(2, { name: 'Beta Holdings', country: 'US', city: 'Austin', lat: 30.27, lng: -97.74, leadCount: 1, gameCount: 2 }),
  company(3, { name: 'Gamma QA', country: 'DE', city: null, precision: 'country', lat: 51, lng: 9 }),
  company(4, { name: 'Delta Nowhere', country: null, city: null, lat: null, lng: null, precision: 'none' }),
  company(5, { name: 'Epsilon Works', leadCount: 60, gameCount: 60 }),
];

export const games = [
  game(100, { name: 'Alpha Quest', year: 1995, leadCompanyId: 1, popularity: 10, genres: [1, 2], cover: 'abc123' }),
  game(101, { name: 'Beta Blast', year: 2005, leadCompanyId: 2, popularity: 8, genres: [2], indie: true }),
  game(102, { name: 'Alpha Two', year: 2010, leadCompanyId: 1, popularity: 5 }),
  game(103, { name: 'Gamma Game', year: 2001, leadCompanyId: 3, popularity: 2 }),
  game(104, { name: 'Delta Game', year: 2002, leadCompanyId: 4, popularity: 2 }),
  ...Array.from({ length: 60 }, (_, i) =>
    game(200 + i, { name: `Epsilon Game ${String(i + 1).padStart(2, '0')}`, year: 2000, leadCompanyId: 5, popularity: 1 }),
  ),
];

export const meta = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  schemaVersion: 1,
  counts: { games: games.length, companies: companies.length, roles: 0, rolesByType: {} },
  genres: [
    { id: 1, name: 'Action' },
    { id: 2, name: 'Puzzle' },
  ],
  detailChunkSize: 250,
  detailChunks: 1,
  attribution: [
    { source: 'igdb', name: 'IGDB', url: 'https://www.igdb.com', licence: 'Terms' },
    { source: 'wikidata', name: 'Wikidata', url: 'https://www.wikidata.org', licence: 'CC0' },
  ],
} as unknown as DataMeta;

export function detailFor(id: number, leadBasis: LeadBasis = 'igdb_single_developer'): GameDetail {
  return {
    id,
    leadBasis,
    platforms: ['PC'],
    screenshots: [],
    steamAppId: null,
    roles: [
      { companyId: 3, role: 'qa', platform: null, year: null, source: { source: 'curated', id: 'c1' } },
      { companyId: 2, role: 'publisher', platform: null, year: 1996, source: { source: 'wikidata', id: 'Q1', url: 'https://www.wikidata.org/wiki/Q1' } },
      { companyId: 1, role: 'lead_developer', platform: null, year: 1995, source: { source: 'igdb', id: '1', url: 'https://www.igdb.com/g/1' } },
      { companyId: 2, role: 'port', platform: 'Mega Drive', year: 1997, source: { source: 'mobygames', id: '9', url: 'https://www.mobygames.com/9' } },
      { companyId: 4, role: 'art', platform: null, year: null, source: { source: 'igdb', id: '2', url: 'https://www.igdb.com/c/2' } },
      { companyId: 3, role: 'audio', platform: null, year: null, source: { source: 'igdb', id: '3', url: 'https://www.igdb.com/c/3' } },
    ],
    sources: [
      { source: 'igdb', id: '1', url: 'https://www.igdb.com/g/1' },
      { source: 'wikidata', id: 'Q1', url: 'https://www.wikidata.org/wiki/Q1' },
    ],
  };
}

export function seedStore(over: Partial<ReturnType<typeof useStore.getState>> = {}): void {
  const indexes = buildIndexes(companies, games);
  const timeline = buildTimeline(indexes);
  useStore.setState({
    status: 'ready',
    error: null,
    meta,
    indexes,
    timeline,
    year: timeline.maxYear,
    playing: false,
    enabledRoles: new Set(ROLE_TYPES),
    selectedGameId: null,
    selectedGameDetail: null,
    detailError: null,
    selectedPlace: null,
    ...over,
  });
}
