const TRAILING = new Set([
  'inc', 'llc', 'ltd', 'co', 'corp', 'corporation', 'gmbh', 'sa', 'srl', 'ab', 'oy', 'kk',
  'limited', 'plc', 'bv', 'pty',
]);

const LETTER_FIXES: Record<string, string> = {
  'ł': 'l', 'ø': 'o', 'đ': 'd', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ð': 'd', 'þ': 'th',
};

export function normalizeCompanyName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]+/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[łøđßæœðþ]/g, (ch) => LETTER_FIXES[ch] ?? ch)
    .replace(/[.'’`]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim();
  const kept = base.split(' ').filter(Boolean);
  while (kept.length > 1 && TRAILING.has(kept[kept.length - 1]!)) kept.pop();
  return kept.join(' ');
}
