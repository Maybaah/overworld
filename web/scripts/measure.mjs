import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');
const repoDir = resolve(webDir, '..');
const shotsDir = join(repoDir, 'docs', 'screenshots');
const reportsDir = join(repoDir, 'reports');

const args = process.argv.slice(2);
const dataArg = (args.find((a) => a.startsWith('--data=')) ?? '--data=fixture').slice(7);
const forceHeadful = args.includes('--headful');
if (!['fixture', 'real'].includes(dataArg)) {
  console.error('--data must be fixture or real');
  process.exit(2);
}
const DATA = dataArg;

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const chromePath = process.env.CHROME_PATH ?? CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error('No Chrome/Edge executable found');
  process.exit(2);
}

const WIDTH = 1920;
const HEIGHT = 1080;
const SETTLE_MS = 1000;
const MEASURE_MS = 5000;
const PASS_AVG_FPS = 58;
const PASS_P95_MS = 20;
const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|basic render|software|microsoft basic/i;

const log = (...m) => console.log(...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

let viteProc = null;
function stopVite() {
  if (!viteProc) return;
  const pid = viteProc.pid;
  viteProc = null;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(pid, 'SIGKILL');
  } catch {}
}

async function startVite() {
  const port = await freePort();
  const viteBin = join(webDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const viteArgs = [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  if (DATA === 'real') viteArgs.push('--mode', 'real');
  viteProc = spawn(process.execPath, viteArgs, { cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let out = '';
  viteProc.stdout.on('data', (d) => (out += d));
  viteProc.stderr.on('data', (d) => (out += d));
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (viteProc.exitCode !== null) throw new Error(`vite exited early:\n${out}`);
    try {
      const r = await fetch(`${url}/`);
      if (r.ok) return url;
    } catch {}
    await sleep(300);
  }
  throw new Error(`vite did not start:\n${out}`);
}

function stats(times) {
  const t = times.slice(1);
  const n = t.length;
  if (n === 0) return null;
  const sorted = [...t].sort((a, b) => a - b);
  const sum = t.reduce((a, b) => a + b, 0);
  const pct = (p) => sorted[Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1))];
  const worst = Math.max(1, Math.ceil(n * 0.01));
  const worstMean = sorted.slice(n - worst).reduce((a, b) => a + b, 0) / worst;
  const r = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    frames: n,
    durationMs: r(sum, 0),
    avgFps: r((1000 * n) / sum, 1),
    low1Fps: r(1000 / worstMean, 1),
    medianMs: r(pct(50)),
    p95Ms: r(pct(95)),
    p99Ms: r(pct(99)),
    maxMs: r(sorted[n - 1]),
    over20Pct: r((100 * sorted.filter((x) => x > 20).length) / n, 1),
  };
}

const PAGE_SETUP = async () => {
  const [storeMod, loaderMod, arcsMod, rolesMod] = await Promise.all([
    import('/src/data/store.ts'),
    import('/src/data/loader.ts'),
    import('/src/globe/arcs.ts'),
    import('/src/data/roles.ts'),
  ]);
  const { useStore } = storeMod;
  const ROLE_TYPES = Object.keys(rolesMod.ROLE_META);

  function findGlobe() {
    let el = document.querySelector('canvas');
    while (el) {
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
      if (key) {
        let f = el[key];
        while (f) {
          const r = f.ref;
          if (r && r.current && typeof r.current.pointOfView === 'function') return { globe: r.current, fiber: f };
          f = f.return;
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  function sceneArcs(globe) {
    let n = 0;
    globe.scene().traverse((o) => {
      if (o.__globeObjType === 'arc') n++;
    });
    return n;
  }

  function arcProps() {
    const g = findGlobe();
    const d = g && g.fiber.memoizedProps && g.fiber.memoizedProps.arcsData;
    return Array.isArray(d) ? d.length : null;
  }

  function expectedArcs(detail, enabled) {
    const s = useStore.getState();
    const game = s.indexes.gameById.get(detail.id);
    return arcsMod.buildRoleArcs({
      leadCompanyId: game.leadCompanyId,
      roles: detail.roles,
      enabledRoles: enabled,
      companyById: s.indexes.companyById,
    }).arcs.length;
  }

  window.__m = {
    useStore,
    ROLE_TYPES,
    ROLE_GROUPS: rolesMod.ROLE_GROUPS,
    findGlobe,

    pov(lat, lng, altitude, rotateSpeed) {
      const { globe } = findGlobe();
      const c = globe.controls();
      c.autoRotate = !!rotateSpeed;
      if (rotateSpeed) c.autoRotateSpeed = rotateSpeed;
      globe.pointOfView({ lat, lng, altitude }, 0);
    },

    async reset() {
      const s = useStore.getState();
      s.setPlaying(false);
      await s.selectGame(null);
      s.selectPlace(null);
      for (const r of ROLE_TYPES) if (!useStore.getState().enabledRoles.has(r)) useStore.getState().toggleRole(r);
      useStore.getState().setYear(useStore.getState().timeline.maxYear);
    },

    denseCity() {
      const { cities } = useStore.getState().indexes;
      let best = cities[0];
      for (const c of cities) if (c.companyIds.length > best.companyIds.length) best = c;
      return { key: best.key, name: best.name, country: best.country, lat: best.lat, lng: best.lng, companies: best.companyIds.length };
    },

    topCountry() {
      const { countries } = useStore.getState().indexes;
      let best = countries[0];
      for (const c of countries) if (c.companyIds.length > best.companyIds.length) best = c;
      return { code: best.code, lat: best.lat, lng: best.lng, companies: best.companyIds.length };
    },

    meta() {
      const s = useStore.getState();
      return { generatedAt: s.meta.generatedAt, minYear: s.timeline.minYear, maxYear: s.timeline.maxYear, games: s.indexes.games.length, companies: s.indexes.companies.length };
    },

    async findGame() {
      const s = useStore.getState();
      const all = ROLE_TYPES;
      const tiers = [
        { minRoles: 8, minTypes: 4 },
        { minRoles: 6, minTypes: 4 },
        { minRoles: 4, minTypes: 3 },
      ];
      const best = [null, null, null];
      let scanned = 0;
      for (const g of s.indexes.games) {
        const d = await loaderMod.loadGameDetail(g.id);
        scanned++;
        const types = new Set(d.roles.map((r) => r.role));
        for (let i = 0; i < tiers.length; i++) {
          if (d.roles.length >= tiers[i].minRoles && types.size >= tiers[i].minTypes) {
            const arcs = expectedArcs(d, new Set(all));
            if (!best[i] || arcs > best[i].arcs) {
              best[i] = { id: g.id, name: g.name, roles: d.roles.length, types: types.size, arcs };
            }
          }
        }
      }
      const i = best.findIndex((b) => b);
      return i < 0 ? null : { ...best[i], tier: tiers[i], scanned };
    },

    async selectGameAndWait(id) {
      const s = useStore.getState();
      await s.selectGame(id);
      for (let i = 0; i < 100; i++) {
        const st = useStore.getState();
        if (st.selectedGameDetail && st.selectedGameDetail.id === id) return true;
        await new Promise((r) => setTimeout(r, 50));
      }
      return false;
    },

    arcState() {
      const s = useStore.getState();
      const g = findGlobe();
      const detail = s.selectedGameDetail;
      return {
        expected: detail ? expectedArcs(detail, s.enabledRoles) : null,
        scene: g ? sceneArcs(g.globe) : null,
        props: arcProps(),
        enabled: [...s.enabledRoles],
      };
    },

    expectedWithout(roles) {
      const s = useStore.getState();
      const en = new Set(s.enabledRoles);
      for (const r of roles) en.delete(r);
      return expectedArcs(s.selectedGameDetail, en);
    },

    arcsByGroup() {
      const s = useStore.getState();
      const detail = s.selectedGameDetail;
      return rolesMod.ROLE_GROUPS.filter((g) => g.id !== 'lead_developer').map((g) => {
        const en = new Set(s.enabledRoles);
        for (const r of g.roles) en.delete(r);
        return { id: g.id, label: g.label, roles: g.roles, arcs: expectedArcs(detail, s.enabledRoles) - expectedArcs(detail, en) };
      });
    },

    measure(ms, untilYear) {
      return new Promise((resolve) => {
        const t = [];
        let last = null;
        const end = performance.now() + ms;
        const stamps = [];
        window.__frames = stamps;
        const frame = (now) => {
          if (last !== null) {
            t.push(now - last);
            stamps.push([now, now - last]);
          }
          last = now;
          const done = untilYear !== undefined ? useStore.getState().year >= untilYear || now >= end : now >= end;
          if (done) resolve(t);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    },

    toggleRows(labels, everyMs, totalMs) {
      return new Promise((resolve) => {
        const rows = [...document.querySelectorAll('.ow-legend-row')];
        const targets = labels.map((l) => rows.find((r) => r.textContent.includes(l)));
        if (targets.some((t) => !t)) return resolve({ ok: false, toggles: 0 });
        let n = 0;
        const at = [];
        const timer = setInterval(() => {
          at.push(performance.now());
          targets.forEach((t) => t.click());
          n++;
        }, everyMs);
        setTimeout(() => {
          clearInterval(timer);
          const slow = (window.__frames || []).filter(([, dt]) => dt > 20);
          const near = slow.filter(([t]) => at.some((a) => t >= a && t - a <= 250));
          resolve({
            ok: true,
            toggles: n,
            slowFrames: slow.length,
            slowWithin250msOfToggle: near.length,
            worstFrameMs: Math.round(Math.max(0, ...(window.__frames || []).map(([, dt]) => dt))),
            slowFrameMs: slow.map(([, dt]) => Math.round(dt)),
          });
        }, totalMs - 50);
      });
    },

    pressed(label) {
      const row = [...document.querySelectorAll('.ow-legend-row')].find((r) => r.textContent.includes(label));
      return row ? row.getAttribute('aria-pressed') : null;
    },
  };
  return true;
};

async function gpuInfo(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { renderer: 'no webgl', vendor: '' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    };
  });
}

const GPU_FLAGS = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy', '--disable-gpu-sandbox'];
const BASE_FLAGS = [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=CalculateNativeWinOcclusion',
  `--window-size=${WIDTH},${HEIGHT + 130}`,
];

async function launch(attempt, userDataDir) {
  return puppeteer.launch({
    executablePath: chromePath,
    headless: attempt.headless,
    userDataDir,
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
    args: [...BASE_FLAGS, ...(attempt.gpuFlags ? GPU_FLAGS : [])],
    ignoreDefaultArgs: ['--enable-automation'],
  });
}

function classifyUrl(url) {
  if (/images\.igdb\.com/.test(url || '')) return 'igdb-cover';
  if (/tiles\.maps\.eox\.at/.test(url || '')) return 'map-tile';
  return 'other';
}

async function main() {
  mkdirSync(shotsDir, { recursive: true });
  mkdirSync(reportsDir, { recursive: true });

  const baseUrl = await startVite();
  log(`vite dev server (${DATA}) at ${baseUrl}`);
  const pageUrl = `${baseUrl}/?debug=1`;

  const attempts = forceHeadful
    ? [{ headless: false, gpuFlags: false }, { headless: false, gpuFlags: true }]
    : [{ headless: true, gpuFlags: false }, { headless: false, gpuFlags: true }];

  let browser = null;
  let page = null;
  let userDataDir = null;
  let usedAttempt = null;
  let gpu = null;
  const attemptLog = [];

  const closeBrowser = async () => {
    if (browser) {
      try {
        await browser.close();
      } catch {}
      try {
        browser.process()?.kill('SIGKILL');
      } catch {}
      browser = null;
    }
    if (userDataDir) {
      for (let i = 0; i < 10; i++) {
        try {
          rmSync(userDataDir, { recursive: true, force: true });
          break;
        } catch {
          await sleep(300);
        }
      }
      userDataDir = null;
    }
  };

  const collect = { on: false, console: [], failed: [], pageErrors: [] };

  try {
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      userDataDir = mkdtempSync(join(tmpdir(), 'overworld-measure-'));
      log(`launching Chrome: ${attempt.headless ? 'headless' : 'headful'}${attempt.gpuFlags ? ' + GPU flags' : ''}`);
      browser = await launch(attempt, userDataDir);
      page = await browser.newPage();
      await page.goto('about:blank');
      gpu = await gpuInfo(page);
      const software = SOFTWARE_RE.test(gpu.renderer);
      attemptLog.push({ ...attempt, renderer: gpu.renderer, software });
      log(`GPU renderer: ${gpu.renderer}`);
      usedAttempt = attempt;
      if (!software) break;
      log('!!!!!! SOFTWARE RENDERER DETECTED: frame rate numbers would be meaningless !!!!!!');
      if (i < attempts.length - 1) {
        log('retrying with the next launch configuration');
        await closeBrowser();
      }
    }
    const software = SOFTWARE_RE.test(gpu.renderer);
    if (software) log('!!!!!! STILL SOFTWARE RENDERING AFTER RETRIES. RUN WILL FAIL. !!!!!!');

    page.on('console', (msg) => {
      if (!collect.on) return;
      if (msg.type() === 'error') {
        const url = msg.location()?.url ?? '';
        collect.console.push({ text: msg.text(), url, kind: classifyUrl(url) });
      }
    });
    page.on('pageerror', (err) => collect.on && collect.pageErrors.push(String(err.message ?? err)));
    page.on('requestfailed', (req) => {
      if (!collect.on) return;
      collect.failed.push({ url: req.url(), reason: req.failure()?.errorText ?? 'failed', kind: classifyUrl(req.url()) });
    });
    page.on('response', (res) => {
      if (!collect.on || res.status() < 400) return;
      collect.failed.push({ url: res.url(), reason: `HTTP ${res.status()}`, kind: classifyUrl(res.url()) });
    });

    await page.bringToFront();
    await page.goto(pageUrl, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => !!window.__overworld, { timeout: 120000 }).catch(() => {});
    await sleep(1500);

    collect.on = true;
    await page.goto(pageUrl, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => !!window.__overworld && window.__overworld.pointCount() > 0, { timeout: 120000 });
    await page.evaluate(PAGE_SETUP);
    const dataMeta = await page.evaluate(() => window.__m.meta());
    log(`ready: ${dataMeta.games} games, ${dataMeta.companies} companies, years ${dataMeta.minYear}-${dataMeta.maxYear}`);
    const dpr = await page.evaluate(() => window.devicePixelRatio);

    await page.evaluate(() => {
      window.__measureSession = true;
    });
    const guardReload = async () => {
      const same = await page.evaluate(() => window.__measureSession === true).catch(() => false);
      if (!same) throw new Error('page reloaded during the run (dev server HMR full reload: app sources changed while measuring); results invalid');
    };
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    const ensureAlive = async () => {
      for (let i = 0; i < 20; i++) {
        await page.bringToFront();
        const alive = await page.evaluate(
          () =>
            new Promise((res) => {
              let n = 0;
              const t0 = performance.now();
              const f = () => {
                n++;
                if (performance.now() - t0 > 400) res(n > 8);
                else requestAnimationFrame(f);
              };
              requestAnimationFrame(f);
              setTimeout(() => res(false), 1500);
            }),
        );
        if (alive) return;
        log('  page animation stalled (window backgrounded?), retrying');
        await sleep(500);
      }
      log('  WARNING: page animation still stalled');
    };

    const shot = async (name) => {
      const file = join(shotsDir, `${DATA}-${name}.png`);
      await page.screenshot({ path: file });
      return file;
    };

    const scenarios = [];
    const functional = [];
    const addFunc = (name, pass, evidence) => {
      functional.push({ name, pass, evidence });
      log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}: ${evidence}`);
    };

    async function runScenario(id, title, expectLevel, setup, opts = {}) {
      log(`scenario ${id}: ${title}`);
      await guardReload();
      await ensureAlive();
      await setup();
      await sleep(opts.settleMs ?? SETTLE_MS);
      const level = await page.evaluate(() => window.__overworld.level());
      const points = await page.evaluate(() => window.__overworld.pointCount());
      const covers = await page.evaluate(() => window.__overworld.coverCount());
      let during = null;
      let times;
      if (opts.during) during = opts.during();
      if (opts.untilYear !== undefined) {
        times = await page.evaluate((ms, y) => window.__m.measure(ms, y), opts.maxMs, opts.untilYear);
      } else {
        times = await page.evaluate((ms) => window.__m.measure(ms), opts.ms ?? MEASURE_MS);
      }
      const extra = during ? await during : null;
      const appFps = await page.evaluate(() => window.__overworld.fps());
      const s = stats(times) ?? { frames: 0, durationMs: 0, avgFps: 0, low1Fps: 0, medianMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, over20Pct: 100 };
      const levelOk = level === expectLevel;
      const pass = !!s && levelOk && !software && s.avgFps >= PASS_AVG_FPS && s.p95Ms <= PASS_P95_MS;
      const screenshot = await shot(id);
      const rec = { id, title, expectedLevel: expectLevel, level, levelOk, points, covers, appFps, ...s, pass, extra, screenshot };
      scenarios.push(rec);
      log(`  avg ${s.avgFps} fps, 1% low ${s.low1Fps}, median ${s.medianMs} ms, p95 ${s.p95Ms} ms, frames ${s.frames}, >20ms ${s.over20Pct}%, level ${level}${levelOk ? '' : ` (expected ${expectLevel})`} -> ${pass ? 'PASS' : 'FAIL'}`);
      return rec;
    }

    const city = await page.evaluate(() => window.__m.denseCity());
    log(`dense city: ${city.name} (${city.country}) with ${city.companies} companies`);

    await page.waitForFunction(() => window.__overworld.imagery() !== 'pending', { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => window.__overworld.coversLoaded() >= 20, { timeout: 15000 }).catch(() => {});
    const imageryState = await page.evaluate(() => window.__overworld.imagery());
    log(`imagery: ${imageryState}`);

    await runScenario('a-idle-country', 'Idle at country level (default view, default slow auto-rotate)', 'country', async () => {});

    await runScenario('b-orbit-country', 'Orbiting continuously at country level', 'country', async () => {
      await page.evaluate(() => window.__m.pov(20, 10, 2.5, 3));
    });

    await runScenario('c-orbit-city-europe', 'City level over Europe, slow orbit', 'city', async () => {
      await page.evaluate(() => window.__m.pov(50, 10, 0.6, 0.4));
    });

    await runScenario('d-orbit-company-dense-city', `Company level over ${city.name} (${city.companies} companies), slow orbit`, 'company', async () => {
      await page.evaluate((c) => window.__m.pov(c.lat, c.lng, 0.08, 0.03), city);
    });

    const years = dataMeta.maxYear;
    const playMax = Math.ceil((dataMeta.maxYear - dataMeta.minYear + 2) * 350 + 15000);
    const playSetup = (lat, lng, alt) => async () => {
      await page.evaluate(() => window.__m.reset());
      await page.evaluate((a, b, c) => window.__m.pov(a, b, c, 0), lat, lng, alt);
      await sleep(300);
    };
    const playDuring = () =>
      page.evaluate(() => {
        document.querySelector('button.ow-play').click();
        return true;
      });
    await runScenario('e1-year-play-country', `Year slider playing ${dataMeta.minYear} to ${years} at 350 ms/year, country level`, 'country', playSetup(20, 10, 2.5), {
      untilYear: years,
      maxMs: playMax,
      during: playDuring,
    });
    await runScenario('e2-year-play-company', `Year slider playing ${dataMeta.minYear} to ${years} at 350 ms/year, company level over ${city.name}`, 'company', async () => {
      await playSetup(city.lat, city.lng, 0.08)();
    }, { untilYear: years, maxMs: playMax, during: playDuring });
    await page.evaluate(() => window.__m.useStore.getState().setPlaying(false));

    log('finding a game with many roles');
    await page.evaluate(() => window.__m.reset());
    const game = await page.evaluate(() => window.__m.findGame());
    if (!game) throw new Error('no suitable game with several roles found');
    log(`game: ${game.name} (#${game.id}): ${game.roles} roles, ${game.types} role types, ${game.arcs} expected arcs, tier >=${game.tier.minRoles} roles/>=${game.tier.minTypes} types, scanned ${game.scanned} games`);
    const gameOk = game.roles >= 8 && game.types >= 4;
    if (!gameOk) log('  note: no game met >=8 roles and >=4 types; using the closest');

    const gameSetup = async () => {
      await page.evaluate(() => window.__m.reset());
      const ok = await page.evaluate((id) => window.__m.selectGameAndWait(id), game.id);
      if (!ok) throw new Error('game detail did not load');
      await sleep(1800);
    };
    const fScenario = await runScenario('f-game-arcs', `Game selected: ${game.name} (${game.roles} roles, ${game.types} role types), arcs animating`, 'country', gameSetup);
    fScenario.game = game;

    const arcsBefore = await page.evaluate(() => window.__m.arcState());
    const arcsOk = arcsBefore.scene !== null && arcsBefore.scene > 0 ? arcsBefore.scene === arcsBefore.expected : false;
    const propsOk = arcsBefore.props === arcsBefore.expected;
    addFunc(
      'arcs',
      arcsOk && propsOk,
      `expected ${arcsBefore.expected} (from detail data, ${arcsBefore.enabled.length} roles enabled); scene arc objects ${arcsBefore.scene}; globe arcsData prop ${arcsBefore.props}`,
    );

    const groups = await page.evaluate(() => window.__m.arcsByGroup());
    const picked = groups.filter((g) => g.arcs > 0).sort((a, b) => b.arcs - a.arcs).slice(0, 2);
    if (picked.length < 2) log('  note: fewer than two role groups contribute arcs for this game');
    const filterRow = picked[0] ?? groups[0];
    const rowHandle = await page.evaluateHandle((label) => [...document.querySelectorAll('.ow-legend-row')].find((r) => r.textContent.includes(label)), filterRow.label);
    const pressedBefore = await page.evaluate((l) => window.__m.pressed(l), filterRow.label);
    const shotBefore = await page.screenshot();
    await rowHandle.asElement().click();
    await sleep(800);
    const pressedAfter = await page.evaluate((l) => window.__m.pressed(l), filterRow.label);
    const arcsAfter = await page.evaluate(() => window.__m.arcState());
    const expectAfter = await page.evaluate((roles) => window.__m.expectedWithout(roles), []);
    const shotAfter = await page.screenshot();
    const shotAfterPath = await shot('f-role-filter-off');
    const diffBytes = Buffer.compare(shotBefore, shotAfter) !== 0;
    await rowHandle.asElement().click();
    await sleep(600);
    const pressedRestored = await page.evaluate((l) => window.__m.pressed(l), filterRow.label);
    const arcsRestored = await page.evaluate(() => window.__m.arcState());
    const filterPass =
      pressedBefore === 'true' &&
      pressedAfter === 'false' &&
      pressedRestored === 'true' &&
      arcsAfter.scene === arcsAfter.expected &&
      arcsAfter.scene === arcsBefore.scene - filterRow.arcs &&
      arcsRestored.scene === arcsBefore.scene;
    addFunc(
      'role filter',
      filterPass,
      `"${filterRow.label}" aria-pressed ${pressedBefore} -> ${pressedAfter} -> ${pressedRestored}; scene arcs ${arcsBefore.scene} -> ${arcsAfter.scene} (expected ${arcsAfter.expected}) -> ${arcsRestored.scene}; screenshots differ: ${diffBytes}`,
    );
    void expectAfter;
    void shotAfterPath;

    const toggleLabels = picked.slice(0, 2).map((g) => g.label);
    await runScenario('g-game-filter-toggle', `Same game, toggling "${toggleLabels.join('" and "')}" on/off once per second`, 'country', async () => {
      await page.evaluate(() => window.__m.useStore.getState().setPlaying(false));
    }, {
      ms: 6000,
      settleMs: 100,
      during: () => page.evaluate((labels) => window.__m.toggleRows(labels, 1000, 6000), toggleLabels),
    });
    const gRec = scenarios[scenarios.length - 1];
    gRec.toggleLabels = toggleLabels;
    const afterToggle = await page.evaluate((labels) => labels.map((l) => window.__m.pressed(l)), toggleLabels);
    gRec.pressedAfter = afterToggle;
    await page.evaluate((labels) => labels.forEach((l) => {
      const row = [...document.querySelectorAll('.ow-legend-row')].find((r) => r.textContent.includes(l));
      if (row && row.getAttribute('aria-pressed') !== 'true') row.click();
    }), toggleLabels);

    log('functional checks');
    await guardReload();
    await ensureAlive();
    await page.evaluate(() => window.__m.reset());
    await page.evaluate(() => window.__m.pov(20, 10, 2.5, 0));
    await sleep(500);

    const target = await page.evaluate(() => {
      const g = window.__m.useStore.getState().indexes.games;
      const withName = g[Math.floor(g.length / 3)];
      return { id: withName.id, name: withName.name };
    });
    await page.click('input.ow-search-input');
    await page.keyboard.type(target.name, { delay: 25 });
    await sleep(400);
    const results = await page.evaluate(() => [...document.querySelectorAll('.ow-search-option .ow-search-name')].map((e) => e.textContent));
    await shot('search-results');
    await page.keyboard.press('Enter');
    await sleep(1800);
    const cardName = await page.evaluate(() => document.querySelector('aside[aria-label^="Game:"] h2')?.textContent ?? null);
    const storeSelected = await page.evaluate(() => window.__m.useStore.getState().selectedGameId);
    await shot('search-card');
    addFunc(
      'search',
      results.length > 0 && cardName === results[0],
      `typed "${target.name}", ${results.length} results, first "${results[0]}" (is target: ${results[0] === target.name}); Enter -> card heading "${cardName}", selectedGameId ${storeSelected}`,
    );

    await ensureAlive();
    await page.evaluate(() => window.__m.reset());
    await page.evaluate(() => window.__m.pov(20, 10, 2.5, 0));
    await sleep(800);
    const coverWaitStart = Date.now();
    await page.waitForFunction(() => window.__overworld.coversLoaded() >= 20, { timeout: 20000 }).catch(() => {});
    const coverState = await page.evaluate(() => ({
      level: window.__overworld.level(),
      covers: window.__overworld.coverCount(),
      loaded: window.__overworld.coversLoaded(),
      images: window.__overworld.imagesLoaded(),
    }));
    await shot('covers-country');
    addFunc(
      'cover images (country level)',
      coverState.level === 'country' && coverState.loaded >= 20,
      `level ${coverState.level}; ${coverState.covers} covers placed, ${coverState.loaded} of them showing their loaded image after ${Math.round((Date.now() - coverWaitStart) / 100) / 10} s (need >= 20); ${coverState.images} images uploaded to the atlas so far`,
    );

    const finalYear = dataMeta.maxYear;
    const coversFinal = await page.evaluate(() => window.__overworld.visibleCovers());
    const ptsFinal = await page.evaluate(() => window.__overworld.pointCount());
    await page.focus('input.ow-range');
    const steps = finalYear - 1985;
    for (let i = 0; i < Math.floor(steps / 10); i++) await page.keyboard.press('PageDown');
    for (let i = 0; i < steps % 10; i++) await page.keyboard.press('ArrowLeft');
    await sleep(800);
    const yearText = await page.evaluate(() => document.querySelector('.ow-year')?.textContent ?? null);
    const rangeVal = await page.evaluate(() => document.querySelector('input.ow-range')?.value ?? null);
    const pts1985 = await page.evaluate(() => window.__overworld.pointCount());
    const total1985 = await page.evaluate(() => document.querySelector('.ow-slider-total')?.textContent ?? null);
    const covers1985 = await page.evaluate(() => window.__overworld.visibleCovers());
    await shot('year-1985');
    addFunc(
      'year slider',
      yearText === '1985' && pts1985 < ptsFinal,
      `keyboard on slider; readout "${yearText}" (range ${rangeVal}); places drawn (covers + dots) ${pts1985} at 1985 vs ${ptsFinal} at ${finalYear}; "${total1985?.trim()}"`,
    );
    const gameOf = (list) => new Map(list.map((k) => [k.split(':').slice(0, 2).join(':'), k.split(':')[2]]));
    const before = gameOf(coversFinal);
    const after = gameOf(covers1985);
    const shared = [...after.keys()].filter((k) => before.has(k));
    const changed = shared.filter((k) => before.get(k) !== after.get(k));
    addFunc(
      'year changes covers',
      changed.length >= 1,
      `same view, ${finalYear} -> 1985: ${coversFinal.length} -> ${covers1985.length} covers; ${shared.length} places have a cover in both years, ${changed.length} of them now show a different game (need >= 1)`,
    );

    await ensureAlive();
    await page.evaluate(() => window.__m.reset());
    const top = await page.evaluate(() => window.__m.topCountry());
    await page.evaluate((c) => window.__m.pov(c.lat, c.lng, 1.8, 0), top);
    await sleep(900);
    const levelBefore = await page.evaluate(() => window.__overworld.level());
    const xy = await page.evaluate((c) => {
      const { globe } = window.__m.findGlobe();
      const p = globe.getScreenCoords(c.lat, c.lng, 0);
      return { x: p.x, y: p.y };
    }, top);
    await page.mouse.move(xy.x, xy.y);
    await sleep(300);
    const tip = await page.evaluate(() => {
      const t = [...document.querySelectorAll('div')].find((d) => d.style.pointerEvents === 'none' && d.style.display === 'block' && /games led by/.test(d.textContent));
      return t ? t.textContent.replace(/\n/g, ' / ') : null;
    });
    await shot('place-hover');
    await page.mouse.down();
    await page.mouse.up();
    await sleep(2200);
    const placeLabel = await page.evaluate(() => document.querySelector('aside[aria-label^="Place:"]')?.getAttribute('aria-label') ?? null);
    const levelAfter = await page.evaluate(() => window.__overworld.level());
    const selPlace = await page.evaluate(() => JSON.stringify(window.__m.useStore.getState().selectedPlace));
    await shot('place-click');
    addFunc(
      'place click',
      !!placeLabel && levelBefore !== levelAfter,
      `clicked ${top.code} point at (${Math.round(xy.x)},${Math.round(xy.y)}), hover tooltip "${tip}"; panel "${placeLabel}", selectedPlace ${selPlace}; level ${levelBefore} -> ${levelAfter}`,
    );

    await sleep(500);
    await guardReload();
    collect.on = false;

    const errs = collect.console.filter((c) => c.kind === 'other');
    const igdbConsole = collect.console.filter((c) => c.kind === 'igdb-cover');
    const tileFailed = collect.failed.filter((f) => f.kind === 'map-tile');
    const failedOther = collect.failed.filter((f) => f.kind === 'other');
    const igdbFailed = collect.failed.filter((f) => f.kind === 'igdb-cover');
    const igdbExpected = DATA === 'fixture';
    const countedIgdb = igdbExpected ? 0 : igdbConsole.length + igdbFailed.length;
    const uniq = (arr, f) => [...new Set(arr.map(f))];
    const consoleSummary = {
      consoleErrors: uniq(errs, (e) => `${e.text} ${e.url}`),
      pageErrors: collect.pageErrors,
      failedRequests: uniq(failedOther, (f) => `${f.reason} ${f.url}`),
      igdbCoverFailures: { expected: igdbExpected, requests: uniq(igdbFailed, (f) => f.url).length, consoleMessages: igdbConsole.length },
      mapTileFailures: uniq(tileFailed, (f) => `${f.reason} ${f.url}`),
      imagery: imageryState,
    };
    const nErr = errs.length + collect.pageErrors.length + failedOther.length + countedIgdb;
    addFunc(
      'no console errors / failed requests',
      nErr === 0,
      `${errs.length} console errors, ${collect.pageErrors.length} page errors, ${failedOther.length} failed/4xx-5xx requests${igdbExpected ? '' : `, ${countedIgdb} IGDB cover failures`}; ${consoleSummary.mapTileFailures.length} map tile failures (listed, not counted: third-party tile server, the globe falls back to the vector look); ${igdbExpected ? `excluded as expected on sample data: ${uniq(igdbFailed, (f) => f.url).length} IGDB cover requests / ${igdbConsole.length} console messages` : 'IGDB cover failures counted on real data'}`,
    );
    if (errs.length + failedOther.length + collect.pageErrors.length > 0) {
      for (const e of consoleSummary.consoleErrors.slice(0, 10)) log(`    console: ${e}`);
      for (const e of consoleSummary.failedRequests.slice(0, 10)) log(`    failed: ${e}`);
      for (const e of collect.pageErrors.slice(0, 10)) log(`    pageerror: ${e}`);
    }

    const date = new Date().toISOString();
    const allScenariosPass = scenarios.every((s) => s.pass);
    const allFuncPass = functional.every((f) => f.pass);
    const report = {
      date,
      data: DATA,
      mode: usedAttempt.headless ? 'headless' : 'headful',
      gpuFlags: usedAttempt.gpuFlags,
      attempts: attemptLog,
      gpu,
      softwareRenderer: software,
      chrome: await browser.version(),
      viewport: `${WIDTH}x${HEIGHT}`,
      devicePixelRatio: dpr,
      server: 'vite dev server (unminified React development build)',
      dataset: dataMeta,
      criteria: `average >= ${PASS_AVG_FPS} fps and p95 frame time <= ${PASS_P95_MS} ms`,
      denseCity: city,
      scenarios,
      functional,
      console: consoleSummary,
      overallPass: allScenariosPass && allFuncPass && !software,
    };
    writeFileSync(join(reportsDir, `performance-${DATA}.json`), JSON.stringify(report, null, 2));
    writeFileSync(join(reportsDir, `performance-${DATA}.md`), markdown(report));
    log(`wrote reports/performance-${DATA}.json and .md`);
    log(report.overallPass ? 'RESULT: PASS' : 'RESULT: FAIL');
    return report.overallPass ? 0 : 1;
  } finally {
    await closeBrowser();
  }
}

function markdown(r) {
  const L = [];
  L.push(`# Globe performance, ${r.data} data`);
  L.push('');
  L.push(`- Date: ${r.date}`);
  L.push(`- GPU renderer: \`${r.gpu.renderer}\` (vendor \`${r.gpu.vendor}\`)${r.softwareRenderer ? ' **SOFTWARE RENDERER: numbers below are meaningless**' : ''}`);
  L.push(`- Browser: ${r.chrome}, ${r.mode}${r.gpuFlags ? ' with GPU flags' : ''}, viewport ${r.viewport} at devicePixelRatio ${r.devicePixelRatio}`);
  L.push(`- Server: ${r.server}, data set \`${r.data}\`: ${r.dataset.games} games, ${r.dataset.companies} companies, years ${r.dataset.minYear} to ${r.dataset.maxYear}, generatedAt ${r.dataset.generatedAt}`);
  L.push(`- Pass criterion per scenario: ${r.criteria}, and the camera reached the intended zoom level`);
  L.push(`- Overall: **${r.overallPass ? 'PASS' : 'FAIL'}**`);
  L.push('');
  L.push('Frame times come from a requestAnimationFrame loop inside the page. 1% low is 1000 divided by the mean of the slowest 1% of frames. Year-play scenarios cover the whole sweep, not 5 seconds.');
  L.push('');
  L.push(`- Satellite imagery: ${r.console.imagery} (Sentinel-2 cloudless 2016 tiles; Points counts places drawn as a cover or a dot, Covers counts covers placed)`);
  L.push('');
  L.push('| Scenario | Level | Points | Covers | Avg fps | 1% low fps | Median ms | p95 ms | Max ms | Frames | >20 ms | App fps | Result |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of r.scenarios) {
    L.push(`| ${s.id} | ${s.level}${s.levelOk ? '' : ` (wanted ${s.expectedLevel})`} | ${s.points} | ${s.covers} | ${s.avgFps} | ${s.low1Fps} | ${s.medianMs} | ${s.p95Ms} | ${s.maxMs} | ${s.frames} | ${s.over20Pct}% | ${s.appFps} | ${s.pass ? 'PASS' : 'FAIL'} |`);
  }
  L.push('');
  for (const s of r.scenarios) {
    L.push(`- ${s.id}: ${s.title}. Screenshot docs/screenshots/${r.data}-${s.id}.png`);
    if (s.extra && s.extra.slowFrames !== undefined) {
      L.push(`  - ${s.extra.toggles} filter toggles; ${s.extra.slowFrames} frames over 20 ms, ${s.extra.slowWithin250msOfToggle} of them within 250 ms after a toggle; worst frame ${s.extra.worstFrameMs} ms; slow frames (ms): ${s.extra.slowFrameMs.join(', ')}`);
    }
  }
  L.push('');
  L.push('## Functional checks');
  L.push('');
  for (const f of r.functional) L.push(`- ${f.pass ? 'PASS' : 'FAIL'} **${f.name}**: ${f.evidence}`);
  L.push('');
  const c = r.console;
  L.push('## Console and network');
  L.push('');
  L.push(`- Console errors: ${c.consoleErrors.length}${c.consoleErrors.length ? '\n' + c.consoleErrors.map((e) => `  - ${e}`).join('\n') : ''}`);
  L.push(`- Page errors: ${c.pageErrors.length}${c.pageErrors.length ? '\n' + c.pageErrors.map((e) => `  - ${e}`).join('\n') : ''}`);
  L.push(`- Failed requests: ${c.failedRequests.length}${c.failedRequests.length ? '\n' + c.failedRequests.map((e) => `  - ${e}`).join('\n') : ''}`);
  L.push(`- IGDB cover failures (${c.igdbCoverFailures.expected ? 'expected on sample data, not counted' : 'counted'}): ${c.igdbCoverFailures.requests} requests, ${c.igdbCoverFailures.consoleMessages} console messages`);
  L.push(`- Map tile failures (listed, not counted): ${c.mapTileFailures.length}${c.mapTileFailures.length ? '\n' + c.mapTileFailures.map((e) => `  - ${e}`).join('\n') : ''}`);
  L.push('');
  L.push('## Launch attempts');
  L.push('');
  for (const a of r.attempts) L.push(`- ${a.headless ? 'headless' : 'headful'}${a.gpuFlags ? ' + GPU flags' : ''}: \`${a.renderer}\`${a.software ? ' (software)' : ''}`);
  L.push('');
  return L.join('\n');
}

const cleanup = () => stopVite();
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

main()
  .then((code) => {
    stopVite();
    process.exit(code);
  })
  .catch((err) => {
    console.error(err);
    stopVite();
    process.exit(1);
  });
