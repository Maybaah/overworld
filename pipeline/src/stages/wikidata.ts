import path from 'node:path';
import { existsSync } from 'node:fs';
import { createHttp, type Http } from '../http';
import type { PipelineConfig } from '../config';
import {
  STAGE_FILES,
  type RawIgdbCompany,
  type RawIgdbGame,
  type RawWikidataCompany,
  type RawWikidataEntityRef,
  type RawWikidataGame,
  type WikidataMatchBasis,
} from '../raw';
import { numericToAlpha2 } from '../countries';
import { normalizeCompanyName } from '../names';
import { readJson, writeJson } from '../stageio';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const BATCH_SIZE = 500;
const BATCH_FLOOR = 25;
const CLASS_DEVELOPER = 'wd:Q210167';
const CLASS_PUBLISHER = 'wd:Q1137109';
const CLASS_VIDEO_GAME = 'wd:Q7889';
const BUSINESS_CLASSES = 'wd:Q4830453 wd:Q783794 wd:Q6881511 wd:Q891723';
const REGION_CLASSES = 'wd:Q10864048 wd:Q6256 wd:Q3624078 wd:Q3336843 wd:Q5107';
const COUNTY_CLASSES = 'wd:Q28575 wd:Q180673';
const CITY_CLASSES = 'wd:Q515 wd:Q133442 wd:Q5119';
const PREFERRED_RANK = 'http://wikiba.se/ontology#PreferredRank';

type Binding = Record<string, { type: string; value: string } | undefined>;
type HqBasis = 'headquarters' | 'located_in' | 'formation';

export interface WikidataDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

export interface WikidataStageResult {
  games: number;
  companies: number;
  byBasis: Record<WikidataMatchBasis, number>;
  withHq: number;
  ambiguousHq: number;
  regionLevelHq: number;
  skipped: boolean;
}

export function escapeSparqlString(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
    } else out += ch;
  }
  return out;
}

const str = (value: string) => `"${escapeSparqlString(value)}"`;
const enStr = (value: string) => `"${escapeSparqlString(value)}"@en`;

export function parseWktPoint(wkt: string): { lat: number; lng: number } | null {
  const m = /^\s*(?:<([^>]*)>\s*)?Point\s*\(\s*([-+]?[\d.]+(?:[eE][-+]?\d+)?)\s+([-+]?[\d.]+(?:[eE][-+]?\d+)?)\s*\)\s*$/i.exec(wkt);
  if (!m) return null;
  if (m[1] && !m[1].endsWith('/Q2')) return null;
  const lng = Number(m[2]);
  const lat = Number(m[3]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function buildGamesQuery(slugs: string[]): string {
  return `SELECT ?igdb ?game ?kind ?ent ?entLabel WHERE {
  VALUES ?igdb { ${slugs.map(str).join(' ')} }
  ?game wdt:P5794 ?igdb .
  OPTIONAL {
    { ?game wdt:P178 ?ent . BIND("dev" AS ?kind) }
    UNION { ?game wdt:P123 ?ent . BIND("pub" AS ?kind) }
    UNION { ?game wdt:P495 ?origin . ?origin wdt:P297 ?ent . BIND("cc" AS ?kind) }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

export function buildExternalIdQuery(values: string[]): string {
  return `SELECT ?v ?co WHERE {
  VALUES ?v { ${values.map(str).join(' ')} }
  ?co wdt:P9650 ?v .
}`;
}

export function buildNamesOfItemsQuery(qids: string[]): string {
  return `SELECT ?e ?l WHERE {
  VALUES ?e { ${qids.map((q) => `wd:${q}`).join(' ')} }
  { ?e rdfs:label ?l } UNION { ?e skos:altLabel ?l }
  FILTER(LANG(?l) = "en")
}`;
}

export function buildNameLookupQuery(names: string[]): string {
  return `SELECT DISTINCT ?name ?co ?tier ?cc WHERE {
  VALUES ?name { ${names.map(enStr).join(' ')} }
  { ?co rdfs:label ?name } UNION { ?co skos:altLabel ?name }
  {
    {
      { ?co wdt:P31 ${CLASS_DEVELOPER} }
      UNION { ?co wdt:P31 ${CLASS_PUBLISHER} }
      UNION { ?g wdt:P31 ${CLASS_VIDEO_GAME} . ?g wdt:P178 ?co }
      UNION { ?g wdt:P31 ${CLASS_VIDEO_GAME} . ?g wdt:P123 ?co }
    }
    BIND("game" AS ?tier)
  } UNION {
    ?co wdt:P31 ?biz . VALUES ?biz { ${BUSINESS_CLASSES} }
    BIND("business" AS ?tier)
  }
  OPTIONAL { ?co wdt:P17 ?c . ?c wdt:P297 ?cc }
}`;
}

export function buildPlaceStatementsQuery(qids: string[]): string {
  return `SELECT ?co ?prop ?rank ?pl ?start WHERE {
  VALUES ?co { ${qids.map((q) => `wd:${q}`).join(' ')} }
  {
    ?co p:P159 ?st . ?st ps:P159 ?pl ; wikibase:rank ?rank .
    FILTER NOT EXISTS { ?st pq:P582 ?end }
    OPTIONAL { ?st pq:P580 ?start }
    FILTER(?rank != wikibase:DeprecatedRank)
    BIND("headquarters" AS ?prop)
  } UNION {
    ?co p:P131 ?st . ?st ps:P131 ?pl ; wikibase:rank ?rank .
    FILTER NOT EXISTS { ?st pq:P582 ?end }
    OPTIONAL { ?st pq:P580 ?start }
    FILTER(?rank != wikibase:DeprecatedRank)
    BIND("located_in" AS ?prop)
  } UNION {
    ?co p:P740 ?st . ?st ps:P740 ?pl ; wikibase:rank ?rank .
    FILTER NOT EXISTS { ?st pq:P582 ?end }
    OPTIONAL { ?st pq:P580 ?start }
    FILTER(?rank != wikibase:DeprecatedRank)
    BIND("formation" AS ?prop)
  }
}`;
}

export function buildCompanyDetailsQuery(qids: string[]): string {
  return `SELECT ?co ?coLabel ?kind ?cc ?date ?rank WHERE {
  VALUES ?co { ${qids.map((q) => `wd:${q}`).join(' ')} }
  OPTIONAL {
    { ?co wdt:P17 ?country . ?country wdt:P297 ?cc . BIND("cc" AS ?kind) }
    UNION {
      ?co p:P571 ?is . ?is ps:P571 ?date ; wikibase:rank ?rank .
      FILTER(?rank != wikibase:DeprecatedRank)
      BIND("inc" AS ?kind)
    }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

export function buildPlaceDetailsQuery(qids: string[]): string {
  return `SELECT DISTINCT ?pl ?plLabel ?coord ?cc ?own ?parent ?grand ?isRegion ?isCounty ?isCity WHERE {
  VALUES ?pl { ${qids.map((q) => `wd:${q}`).join(' ')} }
  OPTIONAL { ?pl wdt:P625 ?coord }
  OPTIONAL { ?pl wdt:P17 ?c . ?c wdt:P297 ?cc }
  OPTIONAL { ?pl wdt:P297 ?own }
  OPTIONAL { ?pl wdt:P131 ?parent . OPTIONAL { ?parent wdt:P131 ?grand } }
  BIND(EXISTS { ?pl wdt:P31/wdt:P279* ?rc . VALUES ?rc { ${REGION_CLASSES} } } AS ?isRegion)
  BIND(EXISTS { ?pl wdt:P31/wdt:P279* ?ct . VALUES ?ct { ${COUNTY_CLASSES} } } AS ?isCounty)
  BIND(EXISTS { ?pl wdt:P31/wdt:P279* ?cl . VALUES ?cl { ${CITY_CLASSES} } } AS ?isCity)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

export async function runBatched<T, R>(
  items: T[],
  size: number,
  floor: number,
  exec: (batch: T[]) => Promise<R[]>,
  onFail: (batch: T[], err: unknown) => void,
): Promise<R[]> {
  const out: R[] = [];
  async function run(batch: T[]): Promise<void> {
    try {
      out.push(...(await exec(batch)));
    } catch (err) {
      if (batch.length >= floor * 2) {
        const mid = Math.ceil(batch.length / 2);
        await run(batch.slice(0, mid));
        await run(batch.slice(mid));
      } else {
        onFail(batch, err);
      }
    }
  }
  for (let i = 0; i < items.length; i += size) await run(items.slice(i, i + size));
  return out;
}

function qidOf(b: { value: string } | undefined): string | null {
  const m = b ? /\/(Q\d+)$/.exec(b.value) : null;
  return m ? m[1]! : null;
}

function compareQid(a: string, b: string): number {
  return Number(a.slice(1)) - Number(b.slice(1));
}

function compareStart(a: number | null, b: number | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return b - a;
}

function yearOf(date: string): number | null {
  const m = /^(-?\d+)-/.exec(date);
  return m ? Number(m[1]) : null;
}

function normalizedOrNull(name: string): string | null {
  const n = normalizeCompanyName(name);
  return n === '' ? null : n;
}

export function nameVariants(name: string): string[] {
  const target = normalizeCompanyName(name);
  const tokens = name.trim().split(/\s+/);
  const out = [name];
  for (let k = tokens.length - 1; k >= 1; k--) {
    const candidate = tokens.slice(0, k).join(' ').replace(/[\s,.;]+$/, '');
    if (candidate === '' || normalizeCompanyName(candidate) !== target) break;
    if (!out.includes(candidate)) out.push(candidate);
  }
  return out;
}

function addTo<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(value);
}

interface GameCandidate {
  qid: string;
  developers: Map<string, string>;
  publishers: Map<string, string>;
  countries: Set<string>;
}

interface PlaceDetails {
  label: string;
  lat: number | null;
  lng: number | null;
  country: string | null;
  levelRegion: boolean;
  cityTier: 0 | 1 | 2;
  parents: Set<string>;
  grands: Set<string>;
}

export interface AmbiguousHq {
  reason: 'several_cities' | 'region';
  igdbCompanyId: number;
  name: string;
  qid: string;
  chosen: { qid: string; label: string; country: string | null };
  candidates: { qid: string; label: string; country: string | null; basis: HqBasis }[];
}

interface PlaceStatement {
  prop: HqBasis;
  preferred: boolean;
  place: string;
  start: number | null;
}

export async function runWikidataStage(config: PipelineConfig, deps: WikidataDeps = {}): Promise<WikidataStageResult> {
  const log = deps.log ?? ((msg: string) => console.log(msg));
  const gamesFile = path.join(config.stageDir, STAGE_FILES.wikidataGames);
  const companiesFile = path.join(config.stageDir, STAGE_FILES.wikidataCompanies);
  const emptyBasis = (): Record<WikidataMatchBasis, number> => ({ external_id: 0, via_game: 0, name: 0 });

  if (!config.refresh && existsSync(gamesFile) && existsSync(companiesFile)) {
    const games = await readJson<RawWikidataGame[]>(gamesFile);
    const companies = await readJson<RawWikidataCompany[]>(companiesFile);
    const byBasis = emptyBasis();
    for (const c of companies) byBasis[c.matchedBy]++;
    log(`wikidata: stage files exist, skipping (${games.length} games, ${companies.length} companies)`);
    return { games: games.length, companies: companies.length, byBasis, withHq: companies.filter((c) => c.hq).length, ambiguousHq: 0, regionLevelHq: 0, skipped: true };
  }

  const igdbGamesFile = path.join(config.stageDir, STAGE_FILES.igdbGames);
  const igdbCompaniesFile = path.join(config.stageDir, STAGE_FILES.igdbCompanies);
  for (const f of [igdbGamesFile, igdbCompaniesFile]) {
    if (!existsSync(f)) throw new Error(`Wikidata stage needs the IGDB stage output, but ${f} is missing. Run the igdb stage first.`);
  }
  const igdbGames = (await readJson<RawIgdbGame[]>(igdbGamesFile)).slice().sort((a, b) => a.id - b.id);
  const igdbCompanies = (await readJson<RawIgdbCompany[]>(igdbCompaniesFile)).slice().sort((a, b) => a.id - b.id);

  const http: Http = createHttp({
    minIntervalMs: 1000,
    maxConcurrent: 1,
    userAgent: config.wikidataUserAgent,
    retries: 2,
    timeoutMs: 90_000,
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
  });

  let failedBatches = 0;
  let requests = 0;

  async function sparql(query: string): Promise<Binding[]> {
    requests++;
    const res = await http.request(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/sparql-results+json',
      },
      body: new URLSearchParams({ query }).toString(),
    });
    if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { results?: { bindings?: Binding[] } };
    return json.results?.bindings ?? [];
  }

  async function batched<T>(label: string, items: T[], build: (batch: T[]) => string): Promise<Binding[]> {
    return runBatched(
      items,
      BATCH_SIZE,
      BATCH_FLOOR,
      (batch) => sparql(build(batch)),
      (batch, err) => {
        failedBatches++;
        log(`wikidata: ${label} batch of ${batch.length} failed: ${err instanceof Error ? err.message : String(err)}`);
      },
    );
  }

  const companyById = new Map(igdbCompanies.map((c) => [c.id, c]));

  const gameRows = await batched('games', [...new Set(igdbGames.map((g) => g.slug))].sort(), buildGamesQuery);
  const candidatesBySlug = new Map<string, Map<string, GameCandidate>>();
  for (const b of gameRows) {
    const slug = b.igdb?.value;
    const qid = qidOf(b.game);
    if (!slug || !qid) continue;
    let items = candidatesBySlug.get(slug);
    if (!items) candidatesBySlug.set(slug, (items = new Map()));
    let cand = items.get(qid);
    if (!cand) items.set(qid, (cand = { qid, developers: new Map(), publishers: new Map(), countries: new Set() }));
    const kind = b.kind?.value;
    if (kind === 'cc') {
      if (b.ent?.value) cand.countries.add(b.ent.value);
      continue;
    }
    const ent = qidOf(b.ent);
    if (!ent) continue;
    const entry: [string, string] = [ent, b.entLabel?.value ?? ent];
    if (kind === 'dev') cand.developers.set(...entry);
    else if (kind === 'pub') cand.publishers.set(...entry);
  }

  const wdGames: RawWikidataGame[] = [];
  const refs = (m: Map<string, string>): RawWikidataEntityRef[] =>
    [...m].map(([qid, label]) => ({ qid, label })).sort((a, b) => compareQid(a.qid, b.qid));
  for (const g of igdbGames) {
    const items = candidatesBySlug.get(g.slug);
    if (!items || items.size === 0) continue;
    const ranked = [...items.values()].sort(
      (a, b) => b.developers.size + b.publishers.size - (a.developers.size + a.publishers.size) || compareQid(a.qid, b.qid),
    );
    if (ranked.length > 1) {
      log(`wikidata: ${g.slug} claimed by ${ranked.map((r) => r.qid).join(', ')}; keeping ${ranked[0]!.qid}`);
    }
    const win = ranked[0]!;
    wdGames.push({
      igdbGameId: g.id,
      igdbSlug: g.slug,
      qid: win.qid,
      developers: refs(win.developers),
      publishers: refs(win.publishers),
      countryOfOrigin: [...win.countries].sort()[0] ?? null,
    });
  }
  wdGames.sort((a, b) => a.igdbGameId - b.igdbGameId);

  const linked = new Map<number, { qid: string; basis: WikidataMatchBasis }>();

  const externalValues = new Set<string>();
  for (const c of igdbCompanies) {
    if (c.slug) externalValues.add(c.slug);
    externalValues.add(String(c.id));
  }
  const extRows = await batched('external ids', [...externalValues].sort(), buildExternalIdQuery);
  const itemsByValue = new Map<string, Set<string>>();
  for (const b of extRows) {
    const qid = qidOf(b.co);
    if (b.v && qid) addTo(itemsByValue, b.v.value, qid);
  }
  for (const c of igdbCompanies) {
    const hits = itemsByValue.get(c.slug) ?? itemsByValue.get(String(c.id));
    if (!hits || hits.size === 0) continue;
    const sorted = [...hits].sort(compareQid);
    if (sorted.length > 1) log(`wikidata: IGDB company ${c.id} (${c.name}) carried by ${sorted.join(', ')}; keeping ${sorted[0]}`);
    linked.set(c.id, { qid: sorted[0]!, basis: 'external_id' });
  }

  const igdbGameById = new Map(igdbGames.map((g) => [g.id, g]));
  const viaCandidates = new Map<number, Map<string, number>>();
  const itemsNeedingNames = new Set<string>();
  const pendingPairs: { companyId: number; items: string[] }[] = [];
  for (const wg of wdGames) {
    const ig = igdbGameById.get(wg.igdbGameId);
    if (!ig) continue;
    const items = [...new Set([...wg.developers, ...wg.publishers].map((r) => r.qid))];
    const open = [...new Set(ig.involvedCompanies.map((r) => r.company))].filter(
      (id) => companyById.has(id) && !linked.has(id),
    );
    if (items.length === 0 || open.length === 0) continue;
    for (const q of items) itemsNeedingNames.add(q);
    for (const id of open) pendingPairs.push({ companyId: id, items });
  }
  if (itemsNeedingNames.size > 0) {
    const nameRows = await batched('item names', [...itemsNeedingNames].sort(compareQid), buildNamesOfItemsQuery);
    const namesByItem = new Map<string, Set<string>>();
    for (const b of nameRows) {
      const qid = qidOf(b.e);
      const n = b.l ? normalizedOrNull(b.l.value) : null;
      if (qid && n) addTo(namesByItem, qid, n);
    }
    for (const { companyId, items } of pendingPairs) {
      const target = normalizedOrNull(companyById.get(companyId)!.name);
      if (!target) continue;
      for (const q of items) {
        if (!namesByItem.get(q)?.has(target)) continue;
        let votes = viaCandidates.get(companyId);
        if (!votes) viaCandidates.set(companyId, (votes = new Map()));
        votes.set(q, (votes.get(q) ?? 0) + 1);
      }
    }
    for (const [companyId, votes] of [...viaCandidates].sort((a, b) => a[0] - b[0])) {
      const ranked = [...votes].sort((a, b) => b[1] - a[1] || compareQid(a[0], b[0]));
      if (ranked.length > 1) {
        log(
          `wikidata: company ${companyId} (${companyById.get(companyId)!.name}) matched several items via games: ` +
            `${ranked.map(([q, n]) => `${q}=${n}`).join(', ')}; keeping ${ranked[0]![0]}`,
        );
      }
      linked.set(companyId, { qid: ranked[0]![0], basis: 'via_game' });
    }
  }

  let ambiguous = 0;
  const unlinked = igdbCompanies.filter((c) => !linked.has(c.id) && normalizedOrNull(c.name));
  if (unlinked.length > 0) {
    const queryNames = [...new Set(unlinked.flatMap((c) => nameVariants(c.name)))].sort();
    const nameRows = await batched('names', queryNames, buildNameLookupQuery);
    const hitsByName = new Map<string, Map<string, { game: boolean; countries: Set<string> }>>();
    for (const b of nameRows) {
      const qid = qidOf(b.co);
      if (!b.name || !qid) continue;
      let items = hitsByName.get(b.name.value);
      if (!items) hitsByName.set(b.name.value, (items = new Map()));
      let hit = items.get(qid);
      if (!hit) items.set(qid, (hit = { game: false, countries: new Set() }));
      if (b.tier?.value !== 'business') hit.game = true;
      if (b.cc) hit.countries.add(b.cc.value);
    }
    for (const c of unlinked) {
      const merged = new Map<string, { game: boolean; countries: Set<string> }>();
      for (const variant of nameVariants(c.name)) {
        for (const [qid, hit] of hitsByName.get(variant) ?? []) {
          const m = merged.get(qid) ?? { game: false, countries: new Set<string>() };
          m.game ||= hit.game;
          for (const cc of hit.countries) m.countries.add(cc);
          merged.set(qid, m);
        }
      }
      const items = [...merged].sort((x, y) => compareQid(x[0], y[0]));
      const gameHits = items.filter(([, h]) => h.game);
      if (gameHits.length === 1) {
        linked.set(c.id, { qid: gameHits[0]![0], basis: 'name' });
      } else if (gameHits.length > 1) {
        ambiguous++;
        log(`wikidata: ambiguous name "${c.name}" (IGDB ${c.id}): ${gameHits.map(([q]) => q).join(', ')}`);
      } else if (items.length === 1) {
        const country = numericToAlpha2(c.country);
        if (country && items[0]![1].countries.has(country)) linked.set(c.id, { qid: items[0]![0], basis: 'name' });
      } else if (items.length > 1) {
        ambiguous++;
        log(`wikidata: ambiguous name "${c.name}" (IGDB ${c.id}): ${items.map(([q]) => q).join(', ')}`);
      }
    }
  }

  const linkedItems = [...new Set([...linked.values()].map((l) => l.qid))].sort(compareQid);

  const statementRows = linkedItems.length ? await batched('place statements', linkedItems, buildPlaceStatementsQuery) : [];
  const statementsByItem = new Map<string, PlaceStatement[]>();
  for (const b of statementRows) {
    const co = qidOf(b.co);
    const place = qidOf(b.pl);
    const prop = b.prop?.value as HqBasis | undefined;
    if (!co || !place || !prop) continue;
    const list = statementsByItem.get(co) ?? [];
    const start = b.start ? Date.parse(b.start.value) : NaN;
    list.push({ prop, preferred: b.rank?.value === PREFERRED_RANK, place, start: Number.isNaN(start) ? null : start });
    statementsByItem.set(co, list);
  }

  const detailRows = linkedItems.length ? await batched('company details', linkedItems, buildCompanyDetailsQuery) : [];
  const itemInfo = new Map<string, { label: string | null; countries: Set<string>; inceptions: { year: number; preferred: boolean }[] }>();
  for (const b of detailRows) {
    const co = qidOf(b.co);
    if (!co) continue;
    let info = itemInfo.get(co);
    if (!info) itemInfo.set(co, (info = { label: null, countries: new Set(), inceptions: [] }));
    const label = b.coLabel?.value;
    if (label && label !== co) info.label = label;
    if (b.kind?.value === 'cc' && b.cc) info.countries.add(b.cc.value);
    if (b.kind?.value === 'inc' && b.date) {
      const year = yearOf(b.date.value);
      if (year !== null) info.inceptions.push({ year, preferred: b.rank?.value === PREFERRED_RANK });
    }
  }

  const placeIds = [...new Set([...statementsByItem.values()].flat().map((s) => s.place))].sort(compareQid);
  const placeRows = placeIds.length ? await batched('place details', placeIds, buildPlaceDetailsQuery) : [];
  const placeAcc = new Map<string, { label: string | null; coords: string[]; countries: Set<string>; own: Set<string>; region: boolean; county: boolean; city: boolean; parents: Set<string>; grands: Set<string> }>();
  for (const b of placeRows) {
    const pl = qidOf(b.pl);
    if (!pl) continue;
    let acc = placeAcc.get(pl);
    if (!acc) placeAcc.set(pl, (acc = { label: null, coords: [], countries: new Set(), own: new Set(), region: false, county: false, city: false, parents: new Set(), grands: new Set() }));
    const label = b.plLabel?.value;
    if (label && label !== pl) acc.label = label;
    if (b.coord) acc.coords.push(b.coord.value);
    if (b.cc) acc.countries.add(b.cc.value);
    if (b.own) acc.own.add(b.own.value);
    if (b.isRegion?.value === 'true') acc.region = true;
    if (b.isCounty?.value === 'true') acc.county = true;
    const parent = qidOf(b.parent);
    if (parent) acc.parents.add(parent);
    const grand = qidOf(b.grand);
    if (grand) acc.grands.add(grand);
    if (b.isCity?.value === 'true') acc.city = true;
  }
  const places = new Map<string, PlaceDetails>();
  for (const [qid, acc] of placeAcc) {
    const point = acc.coords.sort().map(parseWktPoint).find((p) => p !== null) ?? null;
    places.set(qid, {
      label: acc.label ?? qid,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
      country: [...acc.countries].sort()[0] ?? [...acc.own].sort()[0] ?? null,
      levelRegion: acc.region && !acc.city,
      cityTier: acc.city ? 0 : acc.region || acc.county ? 2 : 1,
      parents: acc.parents,
      grands: acc.grands,
    });
  }

  const PROP_ORDER: Record<HqBasis, number> = { headquarters: 0, located_in: 1, formation: 2 };
  let ambiguousHq = 0;
  let regionLevelHq = 0;
  const ambiguousReport: AmbiguousHq[] = [];
  const wdCompanies: RawWikidataCompany[] = [];
  const byBasis = emptyBasis();
  for (const c of igdbCompanies) {
    const link = linked.get(c.id);
    if (!link) continue;
    const info = itemInfo.get(link.qid);
    const igdbCountry = numericToAlpha2(c.country);
    const keyOf = (st: PlaceStatement): [number, number, number] => [
      st.preferred ? 0 : 1,
      igdbCountry !== null && places.get(st.place)?.country === igdbCountry ? 0 : 1,
      places.get(st.place)?.cityTier ?? 1,
    ];
    const cmpKey = (x: PlaceStatement, y: PlaceStatement) => {
      const kx = keyOf(x);
      const ky = keyOf(y);
      return kx[0] - ky[0] || kx[1] - ky[1] || kx[2] - ky[2];
    };
    const describe = (q: string) => ({ qid: q, label: places.get(q)?.label ?? q, country: places.get(q)?.country ?? null });
    const allOptions = statementsByItem.get(link.qid) ?? [];
    const inside = (inner: string, outer: string): boolean => {
      const p = places.get(inner);
      return !!p && inner !== outer && (p.parents.has(outer) || p.grands.has(outer));
    };
    const options = allOptions
      .filter((o) => !allOptions.some((p) => inside(p.place, o.place)))
      .sort(
      (x, y) =>
        cmpKey(x, y) ||
        compareStart(x.start, y.start) ||
        PROP_ORDER[x.prop] - PROP_ORDER[y.prop] ||
        compareQid(x.place, y.place),
    );
    const stmt = options[0];
    if (stmt) {
      const describe = (q: string) => ({ qid: q, label: places.get(q)?.label ?? q, country: places.get(q)?.country ?? null });
      const tiedStatements = options.filter((o) => cmpKey(o, stmt) === 0);
      const tied = [...new Set(tiedStatements.map((o) => o.place))];
      if (tied.length > 1) {
        ambiguousHq++;
        ambiguousReport.push({
          reason: 'several_cities',
          igdbCompanyId: c.id,
          name: c.name,
          qid: link.qid,
          chosen: describe(stmt.place),
          candidates: tied.map((q) => ({ ...describe(q), basis: tiedStatements.find((o) => o.place === q)!.prop })),
        });
        log(`wikidata: ambiguous hq for "${c.name}" (IGDB ${c.id}, ${link.qid}): ${tied.map((q) => `${q} ${places.get(q)?.label ?? ''}`.trim()).join(', ')}; chose ${stmt.place}`);
      }
    }
    const place = stmt ? places.get(stmt.place) : undefined;
    if (stmt && places.get(stmt.place)?.cityTier === 2) {
      regionLevelHq++;
      const distinct = [...new Set(options.map((o) => o.place))];
      ambiguousReport.push({
        reason: 'region',
        igdbCompanyId: c.id,
        name: c.name,
        qid: link.qid,
        chosen: describe(stmt.place),
        candidates: distinct.map((q) => ({ ...describe(q), basis: options.find((o) => o.place === q)!.prop })),
      });
    }
    let hq: RawWikidataCompany['hq'] = null;
    if (stmt && place && !place.levelRegion && place.lat !== null && place.lng !== null) {
      hq = { qid: stmt.place, label: place.label, lat: place.lat, lng: place.lng };
    }
    const inceptions = info?.inceptions ?? [];
    const preferred = inceptions.filter((i) => i.preferred);
    const pool = preferred.length > 0 ? preferred : inceptions;
    const entry: RawWikidataCompany = {
      igdbCompanyId: c.id,
      qid: link.qid,
      label: info?.label ?? c.name,
      matchedBy: link.basis,
      hq,
      country: place?.country ?? [...(info?.countries ?? [])].sort()[0] ?? null,
      inception: pool.length > 0 ? Math.min(...pool.map((i) => i.year)) : null,
    };
    if (hq && stmt) entry.hqBasis = stmt.prop;
    wdCompanies.push(entry);
    byBasis[link.basis]++;
  }
  wdCompanies.sort((a, b) => a.igdbCompanyId - b.igdbCompanyId);

  await writeJson(gamesFile, wdGames);
  await writeJson(companiesFile, wdCompanies);
  await writeJson(path.join(config.stageDir, 'wikidata-ambiguous-hq.json'), ambiguousReport.sort((a, b) => a.igdbCompanyId - b.igdbCompanyId || a.reason.localeCompare(b.reason)), true);

  const withHq = wdCompanies.filter((c) => c.hq).length;
  log(
    `wikidata: games ${wdGames.length}/${igdbGames.length}; companies linked ${wdCompanies.length}/${igdbCompanies.length} ` +
      `(external_id ${byBasis.external_id}, via_game ${byBasis.via_game}, name ${byBasis.name}); ` +
      `with hq ${withHq}, without ${wdCompanies.length - withHq}; ambiguous names ${ambiguous}; ambiguous hq ${ambiguousHq}; region-level hq ${regionLevelHq}; ` +
      `failed batches ${failedBatches}; requests ${requests}`,
  );

  return { games: wdGames.length, companies: wdCompanies.length, byBasis, withHq, ambiguousHq, regionLevelHq, skipped: false };
}
