import { useEffect, useRef } from 'react';
import { useStore, type AppMode, type SelectedPlace } from '../data/store';
import type { Indexes } from '../data/indexes';

const MODES: readonly AppMode[] = ['explore', 'guess', 'myglobe', 'insights'];
const MAX_KEY_LENGTH = 200;

export interface ParsedUrlState {
  mode: AppMode;
  gameId: number | null;
  place: SelectedPlace | null;
  year: number | null;
}

export interface SyncedState {
  mode: AppMode;
  gameId: number | null;
  place: SelectedPlace | null;
}

function positiveInt(text: string | null): number | null {
  if (text === null || !/^\d{1,10}$/.test(text)) return null;
  const n = Number(text);
  return n > 0 && n <= 2_000_000_000 ? n : null;
}

export function parsePlace(text: string | null): SelectedPlace | null {
  if (text === null) return null;
  const i = text.indexOf(':');
  if (i < 0) return null;
  const kind = text.slice(0, i);
  const value = text.slice(i + 1);
  if (kind === 'country') return /^[A-Z]{2}$/.test(value) ? { level: 'country', key: value } : null;
  if (kind === 'city') {
    return value.length > 0 && value.length <= MAX_KEY_LENGTH && value.includes('|') ? { level: 'city', key: value } : null;
  }
  if (kind === 'company') {
    const id = positiveInt(value);
    return id === null ? null : { level: 'company', key: id };
  }
  return null;
}

export function formatPlace(place: SelectedPlace): string {
  return `${place.level}:${place.key}`;
}

export function parseUrlState(search: string): ParsedUrlState {
  const p = new URLSearchParams(search);
  const rawMode = p.get('mode');
  const explicit = MODES.find((m) => m === rawMode) ?? null;
  const gameId = positiveInt(p.get('game'));
  const mode: AppMode = explicit ?? 'explore';
  const explore = mode === 'explore';
  const yearText = p.get('year');
  return {
    mode,
    gameId: explore ? gameId : null,
    place: explore ? parsePlace(p.get('place')) : null,
    year: yearText !== null && /^-?\d{1,6}$/.test(yearText) ? Number(yearText) : null,
  };
}

export function serialiseUrlState(search: string, state: SyncedState): string {
  const p = new URLSearchParams(search);
  const explore = state.mode === 'explore';
  if (explore) p.delete('mode');
  else p.set('mode', state.mode);
  if (explore && state.gameId !== null) p.set('game', String(state.gameId));
  else p.delete('game');
  if (explore && state.place) p.set('place', formatPlace(state.place));
  else p.delete('place');
  const text = p.toString();
  return text === '' ? '' : `?${text}`;
}

export function withoutParam(search: string, name: string): string {
  const p = new URLSearchParams(search);
  p.delete(name);
  const text = p.toString();
  return text === '' ? '' : `?${text}`;
}

export function clampYear(year: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, year));
}

export function placeExists(place: SelectedPlace, indexes: Indexes): boolean {
  if (place.level === 'country') return indexes.countries.some((c) => c.code === place.key);
  if (place.level === 'city') return indexes.cities.some((c) => c.key === place.key);
  return indexes.companyById.has(Number(place.key));
}

export function baseUrl(loc: Pick<Location, 'origin' | 'pathname'>, base: string = import.meta.env.BASE_URL): string {
  if (base.startsWith('/')) return `${loc.origin}${base.endsWith('/') ? base : `${base}/`}`;
  const dir = loc.pathname.slice(0, loc.pathname.lastIndexOf('/') + 1);
  return `${loc.origin}${dir}`;
}

export const SHARE_PAGE_LIMIT = 10_000;

export function gameLink(id: number, loc: Pick<Location, 'origin' | 'pathname'> = window.location, pages = !import.meta.env.DEV, base?: string): string {
  const root = baseUrl(loc, base);
  return pages ? `${root}g/${id}/` : `${root}?game=${id}`;
}

export function pageLink(
  kind: 'guess' | 'myglobe',
  params: URLSearchParams,
  loc: Pick<Location, 'origin' | 'pathname'> = window.location,
  pages = !import.meta.env.DEV,
  base?: string,
): string {
  const root = baseUrl(loc, base);
  const q = new URLSearchParams(params);
  q.set('mode', kind);
  return `${root}${pages ? `share/${kind}/` : ''}?${q.toString()}`;
}

export function applyUrlToStore(search: string): void {
  const { indexes, timeline } = useStore.getState();
  if (!indexes) return;
  const parsed = parseUrlState(search);
  const state = useStore.getState();
  state.setMode(parsed.mode);
  const after = useStore.getState();
  if (parsed.gameId !== null && indexes.gameById.has(parsed.gameId)) void after.selectGame(parsed.gameId);
  if (parsed.place && placeExists(parsed.place, indexes)) after.selectPlace(parsed.place);
  if (parsed.year !== null && timeline) after.setYear(clampYear(parsed.year, timeline.minYear, timeline.maxYear));
}

function current(): SyncedState {
  const s = useStore.getState();
  return { mode: s.mode, gameId: s.selectedGameId, place: s.selectedPlace };
}

function writeAddressBar(): void {
  const next = serialiseUrlState(window.location.search, current());
  if (next === window.location.search) return;
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${next}${window.location.hash}`);
}

export function useUrlState(): void {
  const status = useStore((s) => s.status);
  const applied = useRef(false);

  useEffect(() => {
    if (status !== 'ready') return;
    if (!applied.current) {
      applied.current = true;
      try {
        const search = window.location.search;
        applyUrlToStore(search);
        if (new URLSearchParams(search).has('year')) {
          window.history.replaceState(window.history.state, '', `${window.location.pathname}${withoutParam(search, 'year')}${window.location.hash}`);
        }
        writeAddressBar();
      } catch {
        applied.current = true;
      }
    }
    let last = current();
    return useStore.subscribe(() => {
      const now = current();
      if (now.mode === last.mode && now.gameId === last.gameId && now.place === last.place) return;
      last = now;
      try {
        writeAddressBar();
      } catch {
        last = now;
      }
    });
  }, [status]);
}
