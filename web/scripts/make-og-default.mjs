import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'og-default.png');

async function font(pkg, file) {
  const data = await readFile(path.join(root, 'node_modules', '@fontsource', pkg, 'files', file));
  return `url(data:font/woff2;base64,${data.toString('base64')}) format('woff2')`;
}

const display = await font('space-grotesk', 'space-grotesk-latin-700-normal.woff2');
const text = await font('ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff2');

const html = `<!doctype html><html><head><style>
@font-face { font-family: 'Space Grotesk'; font-weight: 700; src: ${display}; }
@font-face { font-family: 'IBM Plex Sans'; font-weight: 400; src: ${text}; }
html, body { margin: 0; width: 1200px; height: 630px; background: #07090d; overflow: hidden; }
.bar { position: absolute; left: 72px; top: 40px; width: 56px; height: 6px; background: #F0E442; }
.word { position: absolute; left: 72px; top: 210px; font: 700 160px/1 'Space Grotesk', system-ui, sans-serif; color: #e6e9ef; }
.line { position: absolute; left: 76px; top: 400px; font: 400 44px/1.2 'IBM Plex Sans', system-ui, sans-serif; color: #8a93a3; }
.dot { position: absolute; left: 72px; top: 540px; width: 16px; height: 16px; border-radius: 50%; background: #F0E442; }
</style></head><body>
<div class="bar"></div><div class="word">Overworld</div><div class="line">Where video games are made</div><div class="dot"></div>
</body></html>`;

const profile = await mkdtemp(path.join(tmpdir(), 'overworld-og-'));
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: profile,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await writeFile(out, png);
  console.log(`Wrote ${out}`);
} finally {
  if (browser) await browser.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
