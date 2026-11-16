import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { PipelineConfig } from '../config';
import { STAGE_FILES, type RawIgdbCompany, type RawIgdbGame, type RawWikidataCompany, type RawWikidataGame } from '../raw';
import { readJson, writeJson } from '../stageio';
import { runWikidataStage } from './wikidata';

type Role = 'd' | 'p' | 'port' | 's';

const SAMPLE: [slug: string, name: string, year: number, companies: [string, Role][]][] = [
  ['the-witcher-3-wild-hunt', 'The Witcher 3: Wild Hunt', 2015, [['CD Projekt RED', 'd'], ['CD Projekt', 'p'], ['Saber Interactive', 'port'], ['Keywords Studios', 's']]],
  ['cyberpunk-2077', 'Cyberpunk 2077', 2020, [['CD Projekt RED', 'd'], ['CD Projekt', 'p'], ['QLOC', 's'], ['Virtuos', 's']]],
  ['super-mario-64', 'Super Mario 64', 1996, [['Nintendo EAD', 'd'], ['Nintendo', 'p']]],
  ['the-legend-of-zelda-breath-of-the-wild', 'Breath of the Wild', 2017, [['Nintendo EPD', 'd'], ['Nintendo', 'p'], ['Monolith Soft', 's']]],
  ['pokemon-red-version', 'Pokemon Red', 1996, [['Game Freak', 'd'], ['Nintendo', 'p']]],
  ['dark-souls', 'Dark Souls', 2011, [['FromSoftware', 'd'], ['Bandai Namco Entertainment', 'p'], ['QLOC', 'port']]],
  ['elden-ring', 'Elden Ring', 2022, [['FromSoftware', 'd'], ['Bandai Namco Entertainment', 'p']]],
  ['final-fantasy-vii', 'Final Fantasy VII', 1997, [['Square', 'd'], ['Sony Computer Entertainment', 'p']]],
  ['kingdom-hearts', 'Kingdom Hearts', 2002, [['Square', 'd'], ['Disney Interactive Studios', 'p']]],
  ['street-fighter-ii', 'Street Fighter II', 1991, [['Capcom', 'd'], ['Capcom', 'p']]],
  ['monster-hunter-world', 'Monster Hunter: World', 2018, [['Capcom', 'd'], ['Capcom', 'p']]],
  ['sonic-the-hedgehog', 'Sonic the Hedgehog', 1991, [['Sonic Team', 'd'], ['Sega', 'p']]],
  ['metal-gear-solid', 'Metal Gear Solid', 1998, [['Konami Computer Entertainment Japan', 'd'], ['Konami', 'p']]],
  ['death-stranding', 'Death Stranding', 2019, [['Kojima Productions', 'd'], ['Sony Interactive Entertainment', 'p'], ['Virtuos', 's']]],
  ['persona-5', 'Persona 5', 2016, [['Atlus', 'd'], ['Atlus', 'p']]],
  ['half-life-2', 'Half-Life 2', 2004, [['Valve', 'd'], ['Valve', 'p']]],
  ['counter-strike-global-offensive', 'Counter-Strike: Global Offensive', 2012, [['Valve', 'd'], ['Hidden Path Entertainment', 'd']]],
  ['minecraft', 'Minecraft', 2011, [['Mojang Studios', 'd'], ['Xbox Game Studios', 'p']]],
  ['fortnite', 'Fortnite', 2017, [['Epic Games', 'd'], ['Epic Games', 'p']]],
  ['the-elder-scrolls-v-skyrim', 'The Elder Scrolls V: Skyrim', 2011, [['Bethesda Game Studios', 'd'], ['Bethesda Softworks', 'p']]],
  ['grand-theft-auto-v', 'Grand Theft Auto V', 2013, [['Rockstar North', 'd'], ['Rockstar Games', 'p']]],
  ['red-dead-redemption-2', 'Red Dead Redemption 2', 2018, [['Rockstar Games', 'd'], ['Rockstar Games', 'p']]],
  ['mass-effect-2', 'Mass Effect 2', 2010, [['BioWare', 'd'], ['Electronic Arts', 'p']]],
  ['the-sims', 'The Sims', 2000, [['Maxis', 'd'], ['Electronic Arts', 'p']]],
  ['diablo-ii', 'Diablo II', 2000, [['Blizzard North', 'd'], ['Blizzard Entertainment', 'p']]],
  ['world-of-warcraft', 'World of Warcraft', 2004, [['Blizzard Entertainment', 'd'], ['Blizzard Entertainment', 'p']]],
  ['assassins-creed-ii', "Assassin's Creed II", 2009, [['Ubisoft Montreal', 'd'], ['Ubisoft', 'p'], ['Keywords Studios', 's']]],
  ['sid-meiers-civilization-vi', "Sid Meier's Civilization VI", 2016, [['Firaxis Games', 'd'], ['2K Games', 'p']]],
  ['the-last-of-us', 'The Last of Us', 2013, [['Naughty Dog', 'd'], ['Sony Computer Entertainment', 'p']]],
  ['pubg-battlegrounds', 'PUBG: Battlegrounds', 2017, [['Krafton', 'p'], ['PUBG Studios', 'd']]],
  ['lost-ark', 'Lost Ark', 2019, [['Smilegate RPG', 'd'], ['Amazon Games', 'p']]],
  ['lineage', 'Lineage', 1998, [['NCSOFT', 'd'], ['NCSOFT', 'p']]],
  ['genshin-impact', 'Genshin Impact', 2020, [['miHoYo', 'd'], ['miHoYo', 'p']]],
  ['black-myth-wukong', 'Black Myth: Wukong', 2024, [['Game Science', 'd'], ['Game Science', 'p']]],
  ['stardew-valley', 'Stardew Valley', 2016, [['ConcernedApe', 'd'], ['Chucklefish', 'p']]],
  ['undertale', 'Undertale', 2015, [['tobyfox', 'd'], ['tobyfox', 'p']]],
  ['hollow-knight', 'Hollow Knight', 2017, [['Team Cherry', 'd'], ['Team Cherry', 'p']]],
  ['celeste', 'Celeste', 2018, [['Maddy Makes Games', 'd'], ['Maddy Makes Games', 'p']]],
  ['among-us', 'Among Us', 2018, [['Innersloth', 'd'], ['Innersloth', 'p']]],
  ['disco-elysium', 'Disco Elysium', 2019, [['ZA/UM', 'd'], ['ZA/UM', 'p']]],
  ['no-mans-sky', "No Man's Sky", 2016, [['Hello Games', 'd'], ['Hello Games', 'p']]],
  ['cuphead', 'Cuphead', 2017, [['Studio MDHR', 'd'], ['Studio MDHR', 'p'], ['Lionbridge', 's']]],
];

const COUNTRIES: Record<string, number> = {
  'Sonic Team': 392,
  'Saber Interactive': 840,
  'Keywords Studios': 372,
  Lionbridge: 840,
  'Electronic Arts': 840,
  'Ubisoft Montreal': 124,
  'Sony Interactive Entertainment': 840,
  QLOC: 616,
  Virtuos: 702,
};

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function buildSample(): { games: RawIgdbGame[]; companies: RawIgdbCompany[] } {
  const companyIds = new Map<string, number>();
  const companies: RawIgdbCompany[] = [];
  const idFor = (name: string): number => {
    let id = companyIds.get(name);
    if (id === undefined) {
      id = 9000 + companies.length * 7;
      companyIds.set(name, id);
      companies.push({
        id,
        name,
        slug: slugify(name),
        url: `https://www.igdb.com/companies/${slugify(name)}`,
        country: COUNTRIES[name] ?? null,
        startDate: null,
        parent: null,
        changedCompanyId: null,
      });
    }
    return id;
  };
  const games: RawIgdbGame[] = SAMPLE.map(([slug, name, year, roles], i) => {
    const involved = roles.map(([company, role], j) => ({
      id: 500_000 + i * 10 + j,
      company: idFor(company),
      developer: role === 'd',
      publisher: role === 'p',
      porting: role === 'port',
      supporting: role === 's',
    }));
    return {
      id: 100_000 + i * 13,
      name,
      slug,
      url: `https://www.igdb.com/games/${slug}`,
      firstReleaseDate: Date.UTC(year, 5, 1) / 1000,
      totalRatingCount: 100,
      gameType: 0,
      genres: [],
      platforms: [],
      cover: null,
      screenshots: [],
      involvedCompanies: involved,
      steamAppId: null,
      steamAppIds: [],
    };
  });
  return { games, companies };
}

const MAX_REQUESTS = 55;

async function main(): Promise<void> {
  const stageDir = await mkdtemp(path.join(os.tmpdir(), 'overworld-wikidata-sample-'));
  try {
    const { games, companies } = buildSample();
    await writeJson(path.join(stageDir, STAGE_FILES.igdbGames), games);
    await writeJson(path.join(stageDir, STAGE_FILES.igdbCompanies), companies);

    const config: PipelineConfig = {
      root: stageDir,
      stageDir,
      httpCacheDir: path.join(stageDir, 'http'),
      outDir: path.join(stageDir, 'out'),
      reportDir: path.join(stageDir, 'reports'),
      curatedDir: path.join(stageDir, 'curated'),
      twitchClientId: null,
      twitchClientSecret: null,
      mobygamesApiKey: null,
      wikidataUserAgent: 'overworld-pipeline/0.1 (sample check; no contact set)',
      gameLimit: 10_000,
      mobyLimit: 10000,
      refresh: false,
      only: null,
    };

    let requests = 0;
    const durations: number[] = [];
    const guardedFetch: typeof fetch = async (input, init) => {
      if (requests >= MAX_REQUESTS) throw new Error(`request budget of ${MAX_REQUESTS} exhausted`);
      requests++;
      const started = Date.now();
      const res = await fetch(input, init).catch((err) => {
        console.log(`request ${requests}: failed after ${((Date.now() - started) / 1000).toFixed(1)} s: ${err}`);
        throw err;
      });
      durations.push((Date.now() - started) / 1000);
      const first = String(init?.body ? new URLSearchParams(String(init.body)).get('query') : '').split('\n')[0]!.slice(0, 40);
      console.log(`request ${requests}: HTTP ${res.status} in ${durations[durations.length - 1]!.toFixed(1)} s (${first})`);
      if (res.status === 429) {
        console.error('Got HTTP 429 from Wikidata; stopping.');
        process.exit(2);
      }
      return res;
    };

    const result = await runWikidataStage(config, { fetchImpl: guardedFetch });

    const wdGames = await readJson<RawWikidataGame[]>(path.join(stageDir, STAGE_FILES.wikidataGames));
    const wdCompanies = await readJson<RawWikidataCompany[]>(path.join(stageDir, STAGE_FILES.wikidataCompanies));
    const byId = new Map(wdCompanies.map((c) => [c.igdbCompanyId, c]));

    const missing = games.filter((g) => !wdGames.some((w) => w.igdbGameId === g.id)).map((g) => g.slug);
    console.log(`\ngames matched ${wdGames.length}/${games.length}${missing.length ? `; unmatched: ${missing.join(', ')}` : ''}`);

    const pad = (s: string, n: number) => s.padEnd(n);
    console.log(
      [pad('company', 38), pad('basis', 12), pad('qid', 12), pad('hq', 26), pad('lat', 10), pad('lng', 11), pad('cc', 4), 'hqBasis'].join(' '),
    );
    for (const c of companies) {
      const w = byId.get(c.id);
      if (!w) {
        console.log([pad(c.name, 38), pad('-', 12)].join(' '));
        continue;
      }
      console.log(
        [
          pad(c.name, 38),
          pad(w.matchedBy, 12),
          pad(w.qid, 12),
          pad(w.hq?.label ?? '-', 26),
          pad(w.hq ? w.hq.lat.toFixed(4) : '-', 10),
          pad(w.hq ? w.hq.lng.toFixed(4) : '-', 11),
          pad(w.country ?? '-', 4),
          w.hqBasis ?? '-',
        ].join(' '),
      );
    }

    const avg = durations.reduce((a, b) => a + b, 0) / Math.max(1, durations.length);
    console.log(
      `\nsummary ${JSON.stringify(result)}; requests ${requests}; average ${avg.toFixed(2)} s per query (network time only)`,
    );
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
