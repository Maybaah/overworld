import type {
  RawIgdbCompany,
  RawIgdbGame,
  RawIgdbInvolvedCompany,
  RawMobyGame,
  RawWikidataCompany,
  RawWikidataGame,
} from './raw';
import type { MergeInput } from './merge';

export function company(id: number, name: string, over: Partial<RawIgdbCompany> = {}): RawIgdbCompany {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\W+/g, '-'),
    url: `https://www.igdb.com/companies/${id}`,
    country: null,
    startDate: null,
    parent: null,
    changedCompanyId: null,
    ...over,
  };
}

export function row(
  id: number,
  companyId: number,
  flags: Partial<Omit<RawIgdbInvolvedCompany, 'id' | 'company'>> = {},
): RawIgdbInvolvedCompany {
  return { id, company: companyId, developer: false, publisher: false, porting: false, supporting: false, ...flags };
}

export function game(id: number, rows: RawIgdbInvolvedCompany[], over: Partial<RawIgdbGame> = {}): RawIgdbGame {
  return {
    id,
    name: `Game ${id}`,
    slug: `game-${id}`,
    url: `https://www.igdb.com/games/game-${id}`,
    firstReleaseDate: Date.UTC(2010, 5, 1) / 1000,
    totalRatingCount: 100,
    gameType: 0,
    genres: [],
    platforms: ['PC'],
    cover: null,
    screenshots: [],
    involvedCompanies: rows,
    steamAppId: null,
    ...over,
  };
}

export function wdCompany(igdbCompanyId: number, over: Partial<RawWikidataCompany> = {}): RawWikidataCompany {
  return {
    igdbCompanyId,
    qid: `Q${igdbCompanyId}`,
    label: `Company ${igdbCompanyId}`,
    matchedBy: 'external_id',
    hq: null,
    country: null,
    inception: null,
    ...over,
  };
}

export function wdGame(igdbGameId: number, developerLabels: string[], over: Partial<RawWikidataGame> = {}): RawWikidataGame {
  return {
    igdbGameId,
    igdbSlug: `game-${igdbGameId}`,
    qid: `Q9${igdbGameId}`,
    developers: developerLabels.map((label, i) => ({ qid: `Q8${igdbGameId}${i}`, label })),
    publishers: [],
    countryOfOrigin: null,
    ...over,
  };
}

export function moby(
  igdbGameId: number,
  roles: { id: number; name: string; role: string; platform?: string | null; year?: number | null }[],
): RawMobyGame {
  return {
    igdbGameId,
    mobyGameId: 5000 + igdbGameId,
    url: `https://www.mobygames.com/game/${5000 + igdbGameId}`,
    roles: roles.map((r) => ({
      mobyCompanyId: r.id,
      companyName: r.name,
      roleName: r.role,
      platform: r.platform ?? null,
      year: r.year ?? null,
    })),
  };
}

export function input(over: Partial<MergeInput> = {}): MergeInput {
  return {
    games: [],
    companies: [],
    genres: [],
    wikidataGames: [],
    wikidataCompanies: [],
    moby: null,
    specialties: [],
    gameLimit: 10_000,
    now: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

export function syntheticInput(gameCount = 30): MergeInput {
  const companies = [];
  const wdCompanies = [];
  for (let i = 1; i <= 12; i++) {
    companies.push(company(i, `Studio ${i} Inc.`, { country: [392, 840, 826, 250][i % 4]!, startDate: 946684800 + i * 1000 }));
    if (i % 3 === 0) {
      wdCompanies.push(wdCompany(i, {
        hq: { qid: `Q${i}0`, label: `City ${i}`, lat: 10 + i, lng: 20 + i },
        country: [392, 840, 826, 250][i % 4] === 392 ? 'JP' : null,
        inception: 1990 + i,
      }));
    }
  }
  companies.push(company(13, 'Nowhere Games'));
  companies[1]!.parent = 1;
  const games = [];
  for (let g = 1; g <= gameCount; g++) {
    const lead = (g % 12) + 1;
    const rows = [row(g * 10, lead, { developer: true }), row(g * 10 + 1, ((g + 3) % 12) + 1 === lead ? 13 : ((g + 3) % 12) + 1, { publisher: true })];
    if (g % 5 === 0) rows.push(row(g * 10 + 2, 13, { supporting: true }));
    if (g % 7 === 0) rows.push(row(g * 10 + 3, ((g + 5) % 12) + 1 === lead ? 13 : ((g + 5) % 12) + 1, { developer: true, porting: true }));
    games.push(game(g, rows, {
      totalRatingCount: 1000 - g * 7,
      genres: g % 2 === 0 ? [1, 32] : [2],
      steamAppId: g % 3 === 0 ? 7000 + g : null,
      firstReleaseDate: g % 10 === 0 ? null : Date.UTC(1995 + (g % 25), 0, 1) / 1000,
    }));
  }
  return input({
    games,
    companies,
    genres: [{ id: 1, name: 'Action' }, { id: 2, name: 'Puzzle' }, { id: 32, name: 'Indie' }, { id: 99, name: 'Unused' }],
    wikidataCompanies: wdCompanies,
  });
}
