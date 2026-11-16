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
  type LocationBasis,
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

export interface LocationCorrection {
  igdbCompanyId?: number;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  evidenceUrl: string;
}

export interface LeadOverride {
  igdbGameId: number;
  game: string;
  igdbCompanyId: number;
  company: string;
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
  locationCorrections: LocationCorrection[];
  leadOverrides: LeadOverride[];
  resolveCity: (label: string, lat: number, lng: number) => string;
  resolveCountry: (lat: number, lng: number) => string | null;
  gameLimit: number;
  now: Date;
}

export interface CountryConflict {
  companyId: number;
  name: string;
  wikidataQid: string;
  wikidataCountry: string | null;
  igdbCountry: string | null;
  wikidataCity: string | null;
}

export interface MergeReport {
  droppedGames: { id: number; name: string; reason: string }[];
  leadBasisCounts: Record<LeadBasis, number>;
  wikidataMatchCounts: Record<WikidataMatchBasis, number>;
  companiesByPrecision: Record<LocationPrecision, number>;
  rejectedWikidataMatches: CountryConflict[];
  countryMismatches: CountryConflict[];
  unmatchedSupportCompanies: { companyId: number; name: string; gameCount: number }[];
  unusedLocationCorrections: { name: string; igdbCompanyId: number | null }[];
  countryFromGames: number;
  cityFromParent: { companyId: number; name: string; parentId: number; parentName: string; city: string }[];
  unusedLeadOverrides: { igdbGameId: number; game: string; igdbCompanyId: number; reason: string }[];
  lowConfidenceLeads: {
    gameId: number;
    name: string;
    companyId: number;
    company: string;
    others: { companyId: number; name: string }[];
  }[];
  steamIdsContested: number;
  leadStudiosWithoutCity: {
    companyId: number;
    name: string;
    precision: LocationPrecision;
    country: string | null;
    ledGames: number;
  }[];
}

export interface MergeResult {
  meta: DataMeta;
  companies: Company[];
  games: GameSummary[];
  details: GameDetail[];
  steam: Record<string, number>;
  report: MergeReport;
}

export const MOBY_ONLY_COMPANY_OFFSET = 20_000_000;

const LEAD_BASES: LeadBasis[] = [
  'curated',
  'igdb_developer_heuristic',
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
const LEAD_WORKLIST_SIZE = 100;
const LOW_CONFIDENCE_SIZE = 150;
const PORT_HOUSE_SHARE = 0.4;
const PORT_HOUSE_MIN_ROWS = 3;

const DIVISION_MARKER =
  /\b(production studio|development division|division|department|dept|r ?& ?d|ead|epd|spd|group no|production group|team|development group|studio no|cs\d*|am ?\d|\d+(st|nd|rd|th)|software development)\b/i;

function looksLikeDivision(childName: string, parentName: string): boolean {
  const firstWord = (n: string) => normalizeCompanyName(n).split(' ')[0] ?? '';
  const parentFirst = firstWord(parentName);
  return parentFirst !== '' && firstWord(childName) === parentFirst && DIVISION_MARKER.test(childName);
}

function steamIdsOf(g: RawIgdbGame): number[] {
  return g.steamAppIds ?? (g.steamAppId !== null && g.steamAppId !== undefined ? [g.steamAppId] : []);
}

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
  candidates: number[];
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
  const companyIdByQid = new Map<string, number>();
  for (const w of input.wikidataCompanies) {
    if (companyById.has(w.igdbCompanyId) && !companyIdByQid.has(w.qid)) companyIdByQid.set(w.qid, w.igdbCompanyId);
  }

  const correctionById = new Map<number, LocationCorrection>();
  const correctionByName = new Map<string, LocationCorrection>();
  for (const c of input.locationCorrections) {
    if (c.igdbCompanyId !== undefined) correctionById.set(c.igdbCompanyId, c);
    else correctionByName.set(normalizeCompanyName(c.name), c);
  }
  const usedCorrections = new Set<LocationCorrection>();
  const correctionFor = (id: number, name: string): LocationCorrection | null => {
    const c = correctionById.get(id) ?? correctionByName.get(normalizeCompanyName(name));
    return c && validCoords(c.lat, c.lng) ? c : null;
  };
  const mobyByGame = new Map((input.moby ?? []).map((m) => [m.igdbGameId, m]));

  const specById = new Map<number, Specialty>();
  const specByName = new Map<string, Specialty>();
  for (const s of input.specialties) {
    if (s.igdbCompanyId !== undefined) specById.set(s.igdbCompanyId, s);
    else specByName.set(normalizeCompanyName(s.name), s);
  }
  const specialtyOf = (id: number): Specialty | undefined =>
    specById.get(id) ?? specByName.get(normName.get(id) ?? '');

  const overrideByGame = new Map(input.leadOverrides.map((o) => [o.igdbGameId, o]));
  const usedOverrides = new Set<number>();
  const unusedOverrides: MergeReport['unusedLeadOverrides'] = [];

  const portRows = new Map<number, number>();
  const developerRows = new Map<number, number>();
  for (const g of input.games) {
    for (const r of g.involvedCompanies) {
      if (r.porting) portRows.set(r.company, (portRows.get(r.company) ?? 0) + 1);
      if (r.developer) developerRows.set(r.company, (developerRows.get(r.company) ?? 0) + 1);
    }
  }
  const isPortHouse = (id: number): boolean => {
    const ports = portRows.get(id) ?? 0;
    return ports >= PORT_HOUSE_MIN_ROWS && ports / (ports + (developerRows.get(id) ?? 0)) >= PORT_HOUSE_SHARE;
  };
  const igdbOrWikidataCountry = (id: number): string | null =>
    numericToAlpha2(companyById.get(id)?.country) ?? wdCompanyById.get(id)?.country ?? null;

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

    const pickByWikidata = (candidates: RawIgdbInvolvedCompany[]): RawIgdbInvolvedCompany | undefined => {
      for (const dev of wdGame?.developers ?? []) {
        const hit = candidates.find((r) => wdCompanyById.get(r.company)?.qid === dev.qid);
        if (hit) return hit;
      }
      for (const label of wdLabels) {
        const hit = candidates.find((r) => normName.get(r.company) === label);
        if (hit) return hit;
      }
      return undefined;
    };

    let pool = firstRowOfCompany((r) => r.developer && !r.porting && !r.supporting);
    if (pool.length === 0) pool = firstRowOfCompany((r) => r.developer);

    let leadId: number | null = null;
    let basis: LeadBasis | null = null;
    let leadRef = gameRef;

    const override = overrideByGame.get(game.id);
    if (override && companyById.has(override.igdbCompanyId)) {
      usedOverrides.add(game.id);
      leadId = override.igdbCompanyId;
      basis = 'curated';
      leadRef = { source: 'curated', id: `lead-${game.id}`, url: override.evidenceUrl };
    } else if (pool.length === 1) {
      leadId = pool[0]!.company;
      basis = 'igdb_single_developer';
    } else if (pool.length > 1) {
      const hit = pickByWikidata(pool);
      if (hit) {
        leadId = hit.company;
        basis = 'igdb_developer_confirmed_by_wikidata';
      }
      if (leadId === null) {
        let left = pool;
        const withoutPortHouses = left.filter((r) => !isPortHouse(r.company));
        if (withoutPortHouses.length > 0) left = withoutPortHouses;
        const origin = wdGame?.countryOfOrigin;
        if (origin) {
          const sameCountry = left.filter((r) => igdbOrWikidataCountry(r.company) === origin);
          if (sameCountry.length > 0) left = sameCountry;
        }
        leadId = left[0]!.company;
        basis = left.length === 1 ? 'igdb_developer_heuristic' : 'igdb_first_developer';
      }
    } else {
      const hit = pickByWikidata(rows);
      if (hit && wdGame) {
        leadId = hit.company;
        basis = 'wikidata_developer';
        leadRef = wikidataRef(wdGame.qid);
      }
      if (leadId === null && wdGame) {
        for (const dev of wdGame.developers) {
          const linked = companyIdByQid.get(dev.qid);
          if (linked !== undefined) {
            leadId = linked;
            basis = 'wikidata_developer';
            leadRef = wikidataRef(wdGame.qid);
            break;
          }
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
        return rows.length === 0
          ? 'no involved companies'
          : 'no developer in IGDB and no Wikidata or MobyGames developer matches a known company';
      }
    }
    if (leadId === null || basis === null) return 'no lead';
    const candidates = pool.map((r) => r.company);

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

    return { raw: game, year, leadId, basis, candidates, roles, companyRefs, sources };
  }

  for (const o of input.leadOverrides) {
    if (usedOverrides.has(o.igdbGameId)) continue;
    const gameKnown = input.games.some((g) => g.id === o.igdbGameId);
    const reason = !companyById.has(o.igdbCompanyId)
      ? 'company not found in igdb-companies'
      : gameKnown
        ? 'game not built'
        : 'game not found in igdb-games';
    unusedOverrides.push({ igdbGameId: o.igdbGameId, game: o.game, igdbCompanyId: o.igdbCompanyId, reason });
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
  const cityFromParent: MergeReport['cityFromParent'] = [];
  const wikidataMatchCounts: Record<WikidataMatchBasis, number> = { external_id: 0, via_game: 0, name: 0 };
  const companiesByPrecision: Record<LocationPrecision, number> = { city: 0, country: 0, none: 0 };
  const companyIds = [...agg.keys()].sort((a, b) => a - b);
  const outputIds = new Set(companyIds);
  const companies: Company[] = [];
  let countryFromGames = 0;

  const ledWithCountry = new Map<number, { country: string; qid: string }[]>();
  for (const w of kept) {
    const wdGame = wdGameById.get(w.raw.id);
    if (!wdGame?.countryOfOrigin) continue;
    const list = ledWithCountry.get(w.leadId);
    const entry = { country: wdGame.countryOfOrigin, qid: wdGame.qid };
    if (list) list.push(entry);
    else ledWithCountry.set(w.leadId, [entry]);
  }

  interface Location {
    country: string | null;
    city: string | null;
    lat: number | null;
    lng: number | null;
    precision: LocationPrecision;
    source: SourceRef | null;
    basis: LocationBasis | null;
    wd: RawWikidataCompany | null;
    fix: LocationCorrection | null;
    rejected: CountryConflict | null;
    mismatch: CountryConflict | null;
    fromGames: boolean;
  }

  const locations = new Map<number, Location>();
  function locationOf(raw: RawIgdbCompany): Location {
    const cached = locations.get(raw.id);
    if (cached) return cached;

    const igdbCountry = numericToAlpha2(raw.country);
    let wd = wdCompanyById.get(raw.id) ?? null;
    let rejectedRecord: CountryConflict | null = null;
    let mismatch: CountryConflict | null = null;
    if (wd && igdbCountry !== null && wd.country !== null && igdbCountry !== wd.country && wd.matchedBy === 'name') {
      rejectedRecord = {
        companyId: raw.id,
        name: raw.name,
        wikidataQid: wd.qid,
        wikidataCountry: wd.country,
        igdbCountry,
        wikidataCity: wd.hq?.label ?? null,
      };
      wd = null;
    }
    const hq = wd?.hq && validCoords(wd.hq.lat, wd.hq.lng) ? wd.hq : null;
    let placeRejected = false;
    if (wd && hq && igdbCountry !== null) {
      const hqCountry = wd.country ?? input.resolveCountry(hq.lat, hq.lng);
      if (hqCountry !== null && hqCountry !== igdbCountry) {
        placeRejected = true;
        mismatch = {
          companyId: raw.id,
          name: raw.name,
          wikidataQid: wd.qid,
          wikidataCountry: hqCountry,
          igdbCountry,
          wikidataCity: hq.label,
        };
      }
    }

    const loc: Location = {
      country: null,
      city: null,
      lat: null,
      lng: null,
      precision: 'none',
      source: null,
      basis: null,
      wd,
      fix: null,
      rejected: rejectedRecord,
      mismatch,
      fromGames: false,
    };

    const fix = correctionFor(raw.id, raw.name);
    if (fix) {
      loc.fix = fix;
      loc.country = fix.country;
      loc.city = fix.city;
      loc.lat = fix.lat;
      loc.lng = fix.lng;
      loc.precision = 'city';
      loc.source = { source: 'curated', id: normalizeCompanyName(fix.name), url: fix.evidenceUrl };
      loc.basis = 'correction';
    } else if (wd && hq && !placeRejected) {
      loc.country = wd.country ?? igdbCountry;
      loc.city = input.resolveCity(hq.label, hq.lat, hq.lng);
      loc.lat = hq.lat;
      loc.lng = hq.lng;
      loc.precision = 'city';
      loc.source = wikidataRef(wd.qid);
      loc.basis = wd.hqBasis ?? 'headquarters';
    } else {
      loc.country = igdbCountry ?? wd?.country ?? null;
      const centre = countryCentre(loc.country);
      if (centre) {
        loc.lat = centre.lat;
        loc.lng = centre.lng;
        loc.precision = 'country';
        loc.source = igdbCountry !== null ? igdbCompanyRef(raw) : wikidataRef(wd!.qid);
        loc.basis = 'country';
      }
    }

    if (loc.country === null) {
      const led = ledWithCountry.get(raw.id);
      if (led && led.length > 0 && led.every((l) => l.country === led[0]!.country)) {
        loc.country = led[0]!.country;
        loc.fromGames = true;
        if (loc.precision === 'none') {
          const centre = countryCentre(loc.country);
          if (centre) {
            loc.lat = centre.lat;
            loc.lng = centre.lng;
            loc.precision = 'country';
            loc.source = wikidataRef(led[0]!.qid);
            loc.basis = 'games_origin';
          }
        }
      }
    }

    locations.set(raw.id, loc);
    return loc;
  }

  for (const id of companyIds) {
    const a = agg.get(id)!;
    const raw = companyById.get(id);
    if (!raw) {
      const name = mobyOnlyNames.get(id) ?? String(id);
      const fix = correctionFor(id, name);
      if (fix) usedCorrections.add(fix);
      const fixRef: SourceRef | null = fix
        ? { source: 'curated', id: normalizeCompanyName(fix.name), url: fix.evidenceUrl }
        : null;
      companies.push({
        id,
        name,
        country: fix?.country ?? null,
        city: fix?.city ?? null,
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
        precision: fix ? 'city' : 'none',
        locationSource: fixRef,
        locationBasis: fix ? 'correction' : null,
        founded: null,
        parentId: null,
        firstYear: a.firstYear,
        lastYear: a.lastYear,
        gameCount: a.gameCount,
        leadCount: a.leadCount,
        sources: dedupeRefs([
          { source: 'mobygames', id: String(id - MOBY_ONLY_COMPANY_OFFSET) },
          ...(fixRef ? [fixRef] : []),
          ...a.refs,
        ]),
      });
      companiesByPrecision[fix ? 'city' : 'none']++;
      continue;
    }

    const base = locationOf(raw);
    if (base.rejected) rejected.push(base.rejected);
    if (base.mismatch) mismatches.push(base.mismatch);
    if (base.wd) wikidataMatchCounts[base.wd.matchedBy]++;
    if (base.fix) usedCorrections.add(base.fix);
    if (base.fromGames) countryFromGames++;

    let { country, city, lat, lng, precision } = base;
    let locationSource = base.source;
    let locationBasis = base.basis;

    if (precision !== 'city' && country !== null && raw.parent !== null) {
      const parentRaw = companyById.get(raw.parent);
      if (parentRaw && looksLikeDivision(raw.name, parentRaw.name)) {
        const parent = locationOf(parentRaw);
        if (parent.precision === 'city' && parent.city && parent.country === country) {
          city = parent.city;
          lat = parent.lat;
          lng = parent.lng;
          precision = 'city';
          locationSource = parent.source;
          locationBasis = 'parent';
          cityFromParent.push({ companyId: id, name: raw.name, parentId: parentRaw.id, parentName: parentRaw.name, city });
        }
      }
    }
    companiesByPrecision[precision]++;

    const extraRefs: SourceRef[] = [igdbCompanyRef(raw)];
    if (base.wd) extraRefs.push(wikidataRef(base.wd.qid));
    if (base.fix) extraRefs.push({ source: 'curated', id: normalizeCompanyName(base.fix.name), url: base.fix.evidenceUrl });

    companies.push({
      id,
      name: raw.name,
      country,
      city,
      lat,
      lng,
      precision,
      locationSource,
      locationBasis,
      founded: base.wd?.inception ?? utcYear(raw.startDate),
      parentId: raw.parent !== null && outputIds.has(raw.parent) ? raw.parent : null,
      firstYear: a.firstYear,
      lastYear: a.lastYear,
      gameCount: a.gameCount,
      leadCount: a.leadCount,
      sources: dedupeRefs([...extraRefs, ...a.refs]),
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

  const claims = new Map<number, { pos: number; index: number; size: number }>();
  const contested = new Set<number>();
  kept.forEach((w, pos) => {
    const ids = steamIdsOf(w.raw);
    ids.forEach((id, index) => {
      const mine = { pos, index, size: ids.length };
      const cur = claims.get(id);
      if (!cur) {
        claims.set(id, mine);
        return;
      }
      contested.add(id);
      if (mine.index < cur.index || (mine.index === cur.index && mine.size < cur.size)) claims.set(id, mine);
    });
  });
  const steam: Record<string, number> = {};
  const ownSteamId = new Map<number, number>();
  for (const id of [...claims.keys()].sort((a, b) => a - b)) {
    const gameId = kept[claims.get(id)!.pos]!.raw.id;
    steam[String(id)] = gameId;
  }
  kept.forEach((w, pos) => {
    const first = steamIdsOf(w.raw).find((id) => claims.get(id)!.pos === pos);
    if (first !== undefined) ownSteamId.set(w.raw.id, first);
  });

  const details: GameDetail[] = kept.map((w) => ({
    id: w.raw.id,
    leadBasis: w.basis,
    platforms: w.raw.platforms,
    screenshots: w.raw.screenshots,
    steamAppId: ownSteamId.get(w.raw.id) ?? null,
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
  if (details.some((d) => d.roles.some((r) => r.source.source === 'mobygames'))) {
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
    steam,
    report: {
      droppedGames: dropped,
      leadBasisCounts,
      wikidataMatchCounts,
      companiesByPrecision,
      rejectedWikidataMatches: rejected,
      countryMismatches: mismatches,
      unmatchedSupportCompanies,
      unusedLocationCorrections: input.locationCorrections
        .filter((c) => !usedCorrections.has(c))
        .map((c) => ({ name: c.name, igdbCompanyId: c.igdbCompanyId ?? null })),
      countryFromGames,
      cityFromParent,
      unusedLeadOverrides: unusedOverrides,
      lowConfidenceLeads: kept
        .filter((w) => w.basis === 'igdb_first_developer')
        .slice(0, LOW_CONFIDENCE_SIZE)
        .map((w) => ({
          gameId: w.raw.id,
          name: w.raw.name,
          companyId: w.leadId,
          company: companyById.get(w.leadId)?.name ?? String(w.leadId),
          others: w.candidates
            .filter((id) => id !== w.leadId)
            .map((id) => ({ companyId: id, name: companyById.get(id)?.name ?? String(id) })),
        })),
      steamIdsContested: contested.size,
      leadStudiosWithoutCity: companies
        .filter((c) => c.leadCount > 0 && c.precision !== 'city')
        .sort((a, b) => b.leadCount - a.leadCount || a.id - b.id)
        .slice(0, LEAD_WORKLIST_SIZE)
        .map((c) => ({ companyId: c.id, name: c.name, precision: c.precision, country: c.country, ledGames: c.leadCount })),
    },
  };
}
