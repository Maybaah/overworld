import {
  DETAIL_CHUNK_SIZE,
  ROLE_TYPES,
  SCHEMA_VERSION,
  SOURCE_NAMES,
  type Company,
  type DataMeta,
  type GameCompanyRole,
  type GameDetail,
  type GameSummary,
  type LeadBasis,
  type LocationPrecision,
  type RoleType,
  type SourceRef,
} from '../../shared/model';
import type {
  RawIgdbCompany,
  RawIgdbGame,
  RawIgdbGenre,
  RawIgdbInvolvedCompany,
  RawMobyGame,
  RawWikidataCompany,
  RawWikidataGame,
  WikidataMatchBasis,
} from './raw';
import { countryCentre, numericToAlpha2 } from './countries';
import { normalizeCompanyName } from './names';

export type SpecialtyRole = 'localization' | 'qa' | 'art' | 'audio';

export interface Specialty {
  igdbCompanyId?: number;
  name: string;
  specialty: SpecialtyRole;
  evidenceUrl: string;
}

export interface MergeInput {
  games: RawIgdbGame[];
  companies: RawIgdbCompany[];
  genres: RawIgdbGenre[];
  wikidataGames: RawWikidataGame[];
  wikidataCompanies: RawWikidataCompany[];
  moby: RawMobyGame[] | null;
  specialties: Specialty[];
  gameLimit: number;
  now: Date;
}

export interface CountryConflict {
  companyId: number;
  name: string;
  wikidataQid: string;
  wikidataCountry: string | null;
  igdbCountry: string | null;
}

export interface MergeReport {
  droppedGames: { id: number; name: string; reason: string }[];
  leadBasisCounts: Record<LeadBasis, number>;
  wikidataMatchCounts: Record<WikidataMatchBasis, number>;
  companiesByPrecision: Record<LocationPrecision, number>;
  rejectedWikidataMatches: CountryConflict[];
  countryMismatches: CountryConflict[];
  unmatchedSupportCompanies: { companyId: number; name: string; gameCount: number }[];
}

export interface MergeResult {
  meta: DataMeta;
  companies: Company[];
  games: GameSummary[];
  details: GameDetail[];
  report: MergeReport;
}

export const MOBY_ONLY_COMPANY_OFFSET = 20_000_000;

const LEAD_BASES: LeadBasis[] = [
  'igdb_single_developer',
  'igdb_developer_confirmed_by_wikidata',
  'igdb_first_developer',
  'wikidata_developer',
  'mobygames_developer',
];

const MOBY_ROLE_PATTERNS: [RegExp, RoleType][] = [
  [/develop/i, 'co_developer'],
  [/publish|distribut/i, 'publisher'],
  [/\bport|\bconver/i, 'port'],
  [/locali|translat/i, 'localization'],
  [/test|\bqa\b|quality/i, 'qa'],
  [/graphic|\bart|animat|cinematic/i, 'art'],
  [/sound|music|audio|voice/i, 'audio'],
];

export function mapMobyRole(roleName: string): RoleType {
  for (const [re, role] of MOBY_ROLE_PATTERNS) if (re.test(roleName)) return role;
  return 'support';
}

const INDIE_GENRE_ID = 32;

function utcYear(unixSeconds: number | null): number | null {
  return unixSeconds === null ? null : new Date(unixSeconds * 1000).getUTCFullYear();
}

function igdbCompanyRef(c: RawIgdbCompany): SourceRef {
  return { source: 'igdb', id: String(c.id), url: c.url };
}

function igdbGameRef(g: RawIgdbGame): SourceRef {
  return { source: 'igdb', id: String(g.id), url: g.url };
}

function wikidataRef(qid: string): SourceRef {
  return { source: 'wikidata', id: qid, url: `https://www.wikidata.org/wiki/${qid}` };
}

function validCoords(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function dedupeRefs(refs: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const r of refs) {
    const key = `${r.source}|${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out.sort(
    (a, b) => SOURCE_NAMES.indexOf(a.source) - SOURCE_NAMES.indexOf(b.source) || a.id.localeCompare(b.id),
  );
}

interface GameWork {
  raw: RawIgdbGame;
  year: number | null;
  leadId: number;
  basis: LeadBasis;
  roles: GameCompanyRole[];
  companyRefs: { companyId: number; ref: SourceRef }[];
  sources: SourceRef[];
}

interface CompanyAgg {
  gameCount: number;
  leadCount: number;
  firstYear: number | null;
  lastYear: number | null;
  nonSupportRoles: number;
  refs: SourceRef[];
}

export function merge(input: MergeInput): MergeResult {
  const companyById = new Map(input.companies.map((c) => [c.id, c]));
  const normName = new Map<number, string>();
  const idsByName = new Map<string, number[]>();
  for (const c of input.companies) {
    const n = normalizeCompanyName(c.name);
    normName.set(c.id, n);
    const list = idsByName.get(n);
    if (list) list.push(c.id);
    else idsByName.set(n, [c.id]);
  }

  const wdCompanyById = new Map(input.wikidataCompanies.map((w) => [w.igdbCompanyId, w]));
  const wdGameById = new Map(input.wikidataGames.map((w) => [w.igdbGameId, w]));
  const mobyByGame = new Map((input.moby ?? []).map((m) => [m.igdbGameId, m]));

  const specById = new Map<number, Specialty>();
  const specByName = new Map<string, Specialty>();
  for (const s of input.specialties) {
    if (s.igdbCompanyId !== undefined) specById.set(s.igdbCompanyId, s);
    else specByName.set(normalizeCompanyName(s.name), s);
  }
  const specialtyOf = (id: number): Specialty | undefined =>
    specById.get(id) ?? specByName.get(normName.get(id) ?? '');

  const mobyOnlyNames = new Map<number, string>();
  const dropped: MergeReport['droppedGames'] = [];
  const works: GameWork[] = [];

  for (const game of input.games) {
    const result = buildGame(game);
    if (typeof result === 'string') dropped.push({ id: game.id, name: game.name, reason: result });
    else works.push(result);
  }

  function buildGame(game: RawIgdbGame): GameWork | string {
    const rows = game.involvedCompanies
      .filter((r) => companyById.has(r.company))
      .sort((a, b) => a.id - b.id);
    if (rows.length === 0) return 'no involved companies';

    const gameRef = igdbGameRef(game);
    const year = utcYear(game.firstReleaseDate);
    const wdGame = wdGameById.get(game.id);
    const moby = mobyByGame.get(game.id);
    const wdLabels = (wdGame?.developers ?? []).map((d) => normalizeCompanyName(d.label));
    const firstRowOfCompany = (pred: (r: RawIgdbInvolvedCompany) => boolean) => {
      const seen = new Set<number>();
      const out: RawIgdbInvolvedCompany[] = [];
      for (const r of rows) {
        if (!pred(r) || seen.has(r.company)) continue;
        seen.add(r.company);
        out.push(r);
      }
      return out;
    };

    let pool = firstRowOfCompany((r) => r.developer && !r.porting && !r.supporting);
    if (pool.length === 0) pool = firstRowOfCompany((r) => r.developer);

    let leadId: number | null = null;
    let basis: LeadBasis | null = null;
    let leadRef = gameRef;

    if (pool.length === 1) {
      leadId = pool[0]!.company;
      basis = 'igdb_single_developer';
    } else if (pool.length > 1) {
      for (const label of wdLabels) {
        const hit = pool.find((r) => normName.get(r.company) === label);
        if (hit) {
          leadId = hit.company;
          basis = 'igdb_developer_confirmed_by_wikidata';
          break;
        }
      }
      if (leadId === null) {
        leadId = pool[0]!.company;
        basis = 'igdb_first_developer';
      }
    } else {
      for (const label of wdLabels) {
        const hit = rows.find((r) => normName.get(r.company) === label);
        if (hit) {
          leadId = hit.company;
          basis = 'wikidata_developer';
          leadRef = wikidataRef(wdGame!.qid);
          break;
        }
      }
      if (leadId === null && moby) {
        for (const mr of moby.roles) {
          if (mapMobyRole(mr.roleName) !== 'co_developer' || !/develop/i.test(mr.roleName)) continue;
          const label = normalizeCompanyName(mr.companyName);
          const hit = rows.find((r) => normName.get(r.company) === label);
          if (hit) {
            leadId = hit.company;
            basis = 'mobygames_developer';
            leadRef = { source: 'mobygames', id: String(moby.mobyGameId), url: moby.url };
            break;
          }
        }
      }
      if (leadId === null || basis === null) {
        return 'no developer in IGDB and no Wikidata or MobyGames developer matches an involved company';
      }
    }
    if (leadId === null || basis === null) return 'no lead';

    const roles: GameCompanyRole[] = [];
    const companyRefs: GameWork['companyRefs'] = [];
    const addRole = (companyId: number, role: RoleType, source: SourceRef, platform: string | null = null, yr = year) => {
      if (roles.some((r) => r.companyId === companyId && r.role === role && r.platform === platform)) return;
      roles.push({ companyId, role, platform, year: yr, source });
    };

    addRole(leadId, 'lead_developer', leadRef);
    for (const r of pool) if (r.company !== leadId) addRole(r.company, 'co_developer', gameRef);
    for (const r of rows) {
      if (r.porting) addRole(r.company, 'port', gameRef);
      if (r.publisher) addRole(r.company, 'publisher', gameRef);
      if (r.supporting) {
        const spec = specialtyOf(r.company);
        if (spec) {
          addRole(r.company, spec.specialty, gameRef);
          companyRefs.push({
            companyId: r.company,
            ref: { source: 'curated', id: normalizeCompanyName(spec.name), url: spec.evidenceUrl },
          });
        } else {
          addRole(r.company, 'support', gameRef);
        }
      }
    }

    const sources: SourceRef[] = [gameRef];
    if (wdGame) sources.push(wikidataRef(wdGame.qid));

    if (moby) {
      sources.push({ source: 'mobygames', id: String(moby.mobyGameId), url: moby.url });
      const involvedIds = rows.map((r) => r.company);
      const mobyRef: SourceRef = { source: 'mobygames', id: String(moby.mobyGameId), url: moby.url };
      for (const mr of moby.roles) {
        const role = mapMobyRole(mr.roleName);
        const label = normalizeCompanyName(mr.companyName);
        let companyId = label ? involvedIds.find((id) => normName.get(id) === label) : undefined;
        if (companyId === undefined && label) {
          const global = idsByName.get(label);
          if (global && global.length === 1) companyId = global[0];
        }
        if (companyId === undefined) {
          companyId = MOBY_ONLY_COMPANY_OFFSET + mr.mobyCompanyId;
          if (!mobyOnlyNames.has(companyId)) mobyOnlyNames.set(companyId, mr.companyName);
        } else {
          companyRefs.push({
            companyId,
            ref: { source: 'mobygames', id: String(mr.mobyCompanyId) },
          });
        }

        if (role === 'co_developer' && companyId === leadId) continue;
        if (roles.some((r) => r.companyId === companyId && r.role === role && r.platform === null)) continue;
        if (roles.some((r) => r.companyId === companyId && r.role === role && r.platform === mr.platform)) continue;

        if (role !== 'support') {
          const own = roles.filter((r) => r.companyId === companyId);
          const onlySupport = own.length > 0 && own.every((r) => r.role === 'support' && r.source.source === 'igdb');
          if (onlySupport) {
            for (const r of own) roles.splice(roles.indexOf(r), 1);
          }
        }
        addRole(companyId, role, mobyRef, mr.platform, mr.year ?? year);
      }
    }

    roles.sort(
      (a, b) =>
        ROLE_TYPES.indexOf(a.role) - ROLE_TYPES.indexOf(b.role) ||
        a.companyId - b.companyId ||
        (a.platform ?? '').localeCompare(b.platform ?? ''),
    );

    return { raw: game, year, leadId, basis, roles, companyRefs, sources };
  }

  const kept = works
    .sort((a, b) => b.raw.totalRatingCount - a.raw.totalRatingCount || a.raw.id - b.raw.id)
    .slice(0, input.gameLimit);

  const agg = new Map<number, CompanyAgg>();
  for (const w of kept) {
    const ids = new Set(w.roles.map((r) => r.companyId));
    for (const id of ids) {
      let a = agg.get(id);
      if (!a) {
        a = { gameCount: 0, leadCount: 0, firstYear: null, lastYear: null, nonSupportRoles: 0, refs: [] };
        agg.set(id, a);
      }
      a.gameCount++;
      if (id === w.leadId) a.leadCount++;
      if (w.year !== null) {
        a.firstYear = a.firstYear === null ? w.year : Math.min(a.firstYear, w.year);
        a.lastYear = a.lastYear === null ? w.year : Math.max(a.lastYear, w.year);
      }
    }
    for (const r of w.roles) if (r.role !== 'support') agg.get(r.companyId)!.nonSupportRoles++;
    for (const cr of w.companyRefs) agg.get(cr.companyId)?.refs.push(cr.ref);
  }

  const rejected: CountryConflict[] = [];
  const mismatches: CountryConflict[] = [];
  const wikidataMatchCounts: Record<WikidataMatchBasis, number> = { external_id: 0, via_game: 0, name: 0 };
  const companiesByPrecision: Record<LocationPrecision, number> = { city: 0, country: 0, none: 0 };
  const companyIds = [...agg.keys()].sort((a, b) => a - b);
  const outputIds = new Set(companyIds);
  const companies: Company[] = [];

  for (const id of companyIds) {
    const a = agg.get(id)!;
    const raw = companyById.get(id);
    if (!raw) {
      companies.push({
        id,
        name: mobyOnlyNames.get(id) ?? String(id),
        country: null,
        city: null,
        lat: null,
        lng: null,
        precision: 'none',
        locationSource: null,
        founded: null,
        parentId: null,
        firstYear: a.firstYear,
        lastYear: a.lastYear,
        gameCount: a.gameCount,
        leadCount: a.leadCount,
        sources: dedupeRefs([{ source: 'mobygames', id: String(id - MOBY_ONLY_COMPANY_OFFSET) }, ...a.refs]),
      });
      companiesByPrecision.none++;
      continue;
    }

    const igdbRef = igdbCompanyRef(raw);
    const igdbCountry = numericToAlpha2(raw.country);
    let wd = wdCompanyById.get(id) ?? null;
    if (wd) {
      const conflict = { companyId: id, name: raw.name, wikidataQid: wd.qid, wikidataCountry: wd.country, igdbCountry };
      const differ = igdbCountry !== null && wd.country !== null && igdbCountry !== wd.country;
      if (differ && wd.matchedBy === 'name') {
        rejected.push(conflict);
        wd = null;
      } else if (differ) {
        mismatches.push(conflict);
      }
    }
    if (wd) wikidataMatchCounts[wd.matchedBy]++;

    let country: string | null = null;
    let city: string | null = null;
    let lat: number | null = null;
    let lng: number | null = null;
    let precision: LocationPrecision = 'none';
    let locationSource: SourceRef | null = null;

    if (wd?.hq && validCoords(wd.hq.lat, wd.hq.lng)) {
      country = wd.country ?? igdbCountry;
      city = wd.hq.label;
      lat = wd.hq.lat;
      lng = wd.hq.lng;
      precision = 'city';
      locationSource = wikidataRef(wd.qid);
    } else {
      const fromIgdb = igdbCountry !== null;
      country = igdbCountry ?? wd?.country ?? null;
      const centre = countryCentre(country);
      if (centre) {
        lat = centre.lat;
        lng = centre.lng;
        precision = 'country';
        locationSource = fromIgdb ? igdbRef : wikidataRef(wd!.qid);
      }
    }
    companiesByPrecision[precision]++;

    const startYear = utcYear(raw.startDate);
    companies.push({
      id,
      name: raw.name,
      country,
      city,
      lat,
      lng,
      precision,
      locationSource,
      founded: wd?.inception ?? startYear,
      parentId: raw.parent !== null && outputIds.has(raw.parent) ? raw.parent : null,
      firstYear: a.firstYear,
      lastYear: a.lastYear,
      gameCount: a.gameCount,
      leadCount: a.leadCount,
      sources: dedupeRefs([igdbRef, ...(wd ? [wikidataRef(wd.qid)] : []), ...a.refs]),
    });
  }

  const games: GameSummary[] = kept.map((w) => ({
    id: w.raw.id,
    name: w.raw.name,
    slug: w.raw.slug,
    year: w.year,
    leadCompanyId: w.leadId,
    popularity: w.raw.totalRatingCount,
    genres: w.raw.genres,
    cover: w.raw.cover,
    indie: w.raw.genres.includes(INDIE_GENRE_ID),
  }));

  const details: GameDetail[] = kept.map((w) => ({
    id: w.raw.id,
    leadBasis: w.basis,
    platforms: w.raw.platforms,
    screenshots: w.raw.screenshots,
    steamAppId: w.raw.steamAppId,
    roles: w.roles,
    sources: w.sources,
  }));

  const rolesByType = Object.fromEntries(ROLE_TYPES.map((r) => [r, 0])) as Record<RoleType, number>;
  let roleTotal = 0;
  for (const d of details) {
    for (const r of d.roles) {
      rolesByType[r.role]++;
      roleTotal++;
    }
  }

  const usedGenres = new Set(games.flatMap((g) => g.genres));
  const genres = input.genres.filter((g) => usedGenres.has(g.id)).sort((a, b) => a.id - b.id);

  const attribution: DataMeta['attribution'] = [
    { source: 'igdb', name: 'IGDB', url: 'https://www.igdb.com', licence: 'IGDB API terms (Twitch Developer Service Agreement)' },
    { source: 'wikidata', name: 'Wikidata', url: 'https://www.wikidata.org', licence: 'CC0 1.0' },
  ];
  if (input.moby !== null && input.moby.length > 0) {
    attribution.push({
      source: 'mobygames',
      name: 'MobyGames',
      url: 'https://www.mobygames.com',
      licence: 'MobyGames API terms',
    });
  }

  const meta: DataMeta = {
    generatedAt: input.now.toISOString(),
    schemaVersion: SCHEMA_VERSION,
    counts: { games: games.length, companies: companies.length, roles: roleTotal, rolesByType },
    genres,
    detailChunkSize: DETAIL_CHUNK_SIZE,
    detailChunks: Math.ceil(games.length / DETAIL_CHUNK_SIZE),
    attribution,
  };

  const leadBasisCounts = Object.fromEntries(LEAD_BASES.map((b) => [b, 0])) as Record<LeadBasis, number>;
  for (const w of kept) leadBasisCounts[w.basis]++;

  const unmatchedSupportCompanies = companies
    .filter((c) => agg.get(c.id)!.nonSupportRoles === 0)
    .map((c) => ({ companyId: c.id, name: c.name, gameCount: c.gameCount }))
    .sort((a, b) => b.gameCount - a.gameCount || a.companyId - b.companyId);

  return {
    meta,
    companies,
    games,
    details,
    report: {
      droppedGames: dropped,
      leadBasisCounts,
      wikidataMatchCounts,
      companiesByPrecision,
      rejectedWikidataMatches: rejected,
      countryMismatches: mismatches,
      unmatchedSupportCompanies,
    },
  };
}
