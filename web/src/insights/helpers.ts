import type { CountryFlow, CountryStats, RoleType, YearStats } from '@shared';
import { ROLE_GROUPS, type RoleGroup } from '../data/roles';

export const MIN_GAMES = 5;
export const TOP_COUNTRIES = 25;
export const TOP_FLOWS = 20;
export const LOW_DATA_LINKS = 25;
export const CHART_MIN_YEAR = 1970;
export const ALL_WORK = 'all';
export const NEUTRAL_COLOR = '#A0A7B4';

export type CapitaMetric = 'perMillion' | 'total';

export interface CapitaRow {
  code: string;
  gamesLed: number;
  population: number | null;
  perMillion: number | null;
  value: number;
}

export function sqrtScale(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.min(1, Math.sqrt(value / max));
}

export function capitaRows(countries: CountryStats[], metric: CapitaMetric, minGames = MIN_GAMES): CapitaRow[] {
  const rows: CapitaRow[] = [];
  for (const c of countries) {
    if (c.gamesLed < minGames) continue;
    const perMillion = c.population && c.population > 0 ? (c.gamesLed / c.population) * 1_000_000 : null;
    const value = metric === 'perMillion' ? perMillion : c.gamesLed;
    if (value === null) continue;
    rows.push({ code: c.code, gamesLed: c.gamesLed, population: c.population, perMillion, value });
  }
  return rows.sort((a, b) => b.value - a.value || a.code.localeCompare(b.code));
}

export function shadeFor(rows: CapitaRow[]): Record<string, number> {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  const shade: Record<string, number> = {};
  for (const r of rows) shade[r.code] = sqrtScale(r.value, max);
  return shade;
}

export function formatPopulation(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} million`;
  return n.toLocaleString('en-US');
}

export function formatPerMillion(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

export function shareOf(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

export function formatPercent(share: number): string {
  const p = share * 100;
  if (p <= 0) return '0%';
  if (p < 1) return '<1%';
  if (p < 10) return `${Math.round(p * 10) / 10}%`;
  return `${Math.round(p)}%`;
}

export interface Counted {
  id: string;
  count: number;
}

export interface TopWithOther {
  top: Counted[];
  otherKinds: number;
  otherCount: number;
}

export function topWithOther(counts: Record<string, number>, n: number): TopWithOther {
  const all: Counted[] = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || Number(a.id) - Number(b.id) || a.id.localeCompare(b.id));
  const rest = all.slice(n);
  return { top: all.slice(0, n), otherKinds: rest.length, otherCount: rest.reduce((s, r) => s + r.count, 0) };
}

export interface YearPoint {
  year: number;
  total: number;
  indie: number;
  major: number;
  indieShare: number | null;
  majorShare: number | null;
}

export function yearSeries(years: YearStats[], minYear = CHART_MIN_YEAR): YearPoint[] {
  const byYear = new Map(years.map((y) => [y.year, y]));
  const last = years.reduce((m, y) => Math.max(m, y.year), minYear);
  const out: YearPoint[] = [];
  for (let year = minYear; year <= last; year++) {
    const y = byYear.get(year);
    const total = y?.total ?? 0;
    const indie = y?.indie ?? 0;
    const major = y?.majorPublisher ?? 0;
    out.push({
      year,
      total,
      indie,
      major,
      indieShare: total > 0 ? indie / total : null,
      majorShare: total > 0 ? major / total : null,
    });
  }
  return out;
}

export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export const WORK_GROUPS: RoleGroup[] = ROLE_GROUPS.filter((g) => g.id !== 'lead_developer');

export function rolesOf(groupId: string): RoleType[] | null {
  if (groupId === ALL_WORK) return null;
  return WORK_GROUPS.find((g) => g.id === groupId)?.roles ?? [];
}

export function linkTotals(flows: CountryFlow[]): Record<string, number> {
  const totals: Record<string, number> = { [ALL_WORK]: 0 };
  for (const g of WORK_GROUPS) totals[g.id] = 0;
  for (const f of flows) {
    const group = WORK_GROUPS.find((g) => g.roles.includes(f.role));
    if (!group) continue;
    totals[group.id]! += f.games;
    totals[ALL_WORK]! += f.games;
  }
  return totals;
}

export interface FlowRow {
  from: string;
  to: string;
  games: number;
  examples: number[];
}

export function topFlows(flows: CountryFlow[], groupId: string, includeSame: boolean, limit = TOP_FLOWS): FlowRow[] {
  const roles = rolesOf(groupId);
  const merged = new Map<string, FlowRow>();
  for (const f of flows) {
    if (f.role === 'lead_developer') continue;
    if (roles && !roles.includes(f.role)) continue;
    if (!includeSame && f.from === f.to) continue;
    const key = `${f.from}|${f.to}`;
    const row = merged.get(key);
    if (!row) {
      merged.set(key, { from: f.from, to: f.to, games: f.games, examples: [...f.examples] });
    } else {
      row.games += f.games;
      for (const id of f.examples) if (!row.examples.includes(id)) row.examples.push(id);
    }
  }
  return [...merged.values()]
    .sort((a, b) => b.games - a.games || a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
    .slice(0, limit);
}

export function arcWidth(games: number, max: number): number {
  return 0.3 + 1.2 * sqrtScale(games, max);
}

const EARTH_KM = 6371;

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function midpoint(aLat: number, aLng: number, bLat: number, bLng: number): { lat: number; lng: number } {
  const rad = Math.PI / 180;
  const toVec = (lat: number, lng: number) => [Math.cos(lat * rad) * Math.cos(lng * rad), Math.cos(lat * rad) * Math.sin(lng * rad), Math.sin(lat * rad)];
  const a = toVec(aLat, aLng);
  const b = toVec(bLat, bLng);
  const x = a[0]! + b[0]!;
  const y = a[1]! + b[1]!;
  const z = a[2]! + b[2]!;
  if (Math.hypot(x, y, z) < 1e-9) return { lat: aLat, lng: aLng };
  return { lat: Math.atan2(z, Math.hypot(x, y)) / rad, lng: Math.atan2(y, x) / rad };
}

export function flyAltitude(distance: number): number {
  return Math.min(2.8, Math.max(1.1, 0.9 + (distance / EARTH_KM) * 1.6));
}
