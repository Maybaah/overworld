import { largestRemainderPercents, type Origins } from './origins';

export interface ShareSummary {
  owned: number;
  matched: number;
  countries: { code: string; percent: number }[];
}

const TOP_COUNTRIES = 5;
const MAX_COUNT = 1_000_000;

export function summarizeOrigins(origins: Origins): ShareSummary {
  const head = origins.byCountry.slice(0, TOP_COUNTRIES);
  const tail = origins.byCountry.slice(TOP_COUNTRIES);
  const shares = [...head.map((c) => c.share), ...(tail.length > 0 ? [tail.reduce((a, c) => a + c.share, 0)] : [])];
  const percents = largestRemainderPercents(shares);
  return {
    owned: origins.owned,
    matched: origins.matched,
    countries: head.map((c, i) => ({ code: c.code, percent: percents[i]! })),
  };
}

export function summaryToShareParams(summary: ShareSummary): URLSearchParams {
  const params = new URLSearchParams();
  params.set('o', String(summary.owned));
  params.set('m', String(summary.matched));
  params.set('c', summary.countries.slice(0, TOP_COUNTRIES).map((c) => `${c.code}${c.percent}`).join('.'));
  return params;
}

function count(value: string | null): number | null {
  if (value === null || !/^\d{1,7}$/.test(value)) return null;
  const n = Number(value);
  return n <= MAX_COUNT ? n : null;
}

export function shareParamsToSummary(input: URLSearchParams | string): ShareSummary | null {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;
  const owned = count(params.get('o'));
  const matched = count(params.get('m'));
  const raw = params.get('c');
  if (owned === null || matched === null || matched > owned || raw === null) return null;

  const countries: ShareSummary['countries'] = [];
  const seen = new Set<string>();
  let total = 0;
  if (raw !== '') {
    const parts = raw.split('.');
    if (parts.length > TOP_COUNTRIES) return null;
    for (const part of parts) {
      const m = /^([A-Z]{2})(\d{1,3})$/.exec(part);
      if (!m) return null;
      const percent = Number(m[2]);
      if (percent > 100 || seen.has(m[1]!)) return null;
      seen.add(m[1]!);
      total += percent;
      countries.push({ code: m[1]!, percent });
    }
  }
  if (total > 100) return null;
  return { owned, matched, countries };
}
