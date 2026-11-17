// A cover-shaped card with the game's title, for games that have no cover anywhere we can load.
const PALETTE = ['#1f3a5f', '#3d2c5c', '#4a2f2a', '#1f4a3d', '#4a4320', '#2f3b4a', '#4a2340', '#23404a'];
export const CARD_W = 264;
export const CARD_H = 374;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Greedy word wrap; a word longer than a line is cut.
export function wrap(text: string, perLine: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = word.length > perLine ? `${word.slice(0, perLine - 1)}…` : word;
    if (!line) line = w;
    else if (line.length + 1 + w.length <= perLine) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.slice(0, perLine - 1)}…`;
    return kept;
  }
  return lines;
}

export function titleCardSvg(title: string, byline: string, year: number | null): string {
  const bg = PALETTE[hash(title) % PALETTE.length]!;
  const size = title.length > 28 ? 26 : title.length > 14 ? 32 : 40;
  const perLine = Math.floor((CARD_W - 40) / (size * 0.56));
  const lines = wrap(title, perLine, 5);
  const top = 150 - ((lines.length - 1) * size * 1.15) / 2;
  const text = lines
    .map((l, i) => `<text x="22" y="${(top + i * size * 1.15).toFixed(1)}" font-size="${size}" font-weight="700">${escape(l)}</text>`)
    .join('');
  const meta = [byline, year === null ? '' : String(year)].filter(Boolean).join(' · ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#0c0c0f"/></linearGradient></defs>
<rect width="${CARD_W}" height="${CARD_H}" fill="url(#g)"/>
<rect x="22" y="40" width="44" height="5" fill="#fafafa" opacity="0.85"/>
<g fill="#fafafa" font-family="Arial, Helvetica, sans-serif">${text}</g>
<text x="22" y="${CARD_H - 28}" fill="#d4d4d8" font-family="Arial, Helvetica, sans-serif" font-size="15">${escape(meta.slice(0, 34))}</text>
</svg>`;
}
