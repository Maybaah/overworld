const TRAILING = new Set([
  'inc', 'llc', 'ltd', 'co', 'corp', 'corporation', 'gmbh', 'sa', 'srl', 'ab', 'oy', 'kk',
  'limited', 'plc', 'bv', 'pty', 'aps', 'nv', 'sas', 'sarl', 'sro', 'ou', 'ag', 'spa', 'oyj', 'kft', 'llp',
  'ltda', 'as',
]);

const GENERIC = new Set([
  'the', 'games', 'game', 'studio', 'studios', 'entertainment', 'software', 'interactive', 'productions',
  'production', 'digital', 'media', 'publishing', 'company', 'team',
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
    .trim()
    .replace(/ sp z oo$/, '');
  const kept = base.split(' ').filter(Boolean);
  while (kept.length > 1 && TRAILING.has(kept[kept.length - 1]!)) kept.pop();
  return kept.join(' ');
}

export function companyNameCore(name: string): string[] {
  const tokens = normalizeCompanyName(name).split(' ').filter(Boolean);
  const kept = tokens.filter((t) => !GENERIC.has(t));
  return kept.length > 0 ? kept : tokens;
}

export function sameCompanyLoosely(a: string, b: string): boolean {
  const x = companyNameCore(a);
  const y = companyNameCore(b);
  if (x.join('') === y.join('')) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length === 0 || short.join('').length < 4) return false;
  const offset = long.length - short.length;
  return short.every((t, j) => long[offset + j] === t);
}
