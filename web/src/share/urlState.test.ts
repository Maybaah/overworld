import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { companies, seedStore } from '../ui/testUtils';
import { useStore } from '../data/store';
import {
  applyUrlToStore,
  baseUrl,
  clampYear,
  gameLink,
  pageLink,
  parsePlace,
  parseUrlState,
  serialiseUrlState,
} from './urlState';

const loc = { origin: 'https://u.github.io', pathname: '/overworld/' };

describe('parseUrlState', () => {
  it('defaults to explore with nothing selected', () => {
    expect(parseUrlState('')).toEqual({ mode: 'explore', gameId: null, place: null, year: null });
  });

  it('reads game, place and year', () => {
    expect(parseUrlState('?game=1942&place=country:JP&year=2010')).toEqual({
      mode: 'explore',
      gameId: 1942,
      place: { level: 'country', key: 'JP' },
      year: 2010,
    });
  });

  it('reads every place kind', () => {
    expect(parsePlace('city:JP|Tokyo')).toEqual({ level: 'city', key: 'JP|Tokyo' });
    expect(parsePlace('company:12')).toEqual({ level: 'company', key: 12 });
    expect(parseUrlState('?place=city%3AJP%7CTokyo').place).toEqual({ level: 'city', key: 'JP|Tokyo' });
  });

  it('reads modes and ignores game and place outside explore', () => {
    expect(parseUrlState('?mode=guess&seed=abc123&game=5').gameId).toBeNull();
    for (const m of ['guess', 'myglobe', 'insights'] as const) expect(parseUrlState(`?mode=${m}`).mode).toBe(m);
  });

  it('ignores invalid values without throwing', () => {
    expect(parseUrlState('?mode=nope&game=abc&place=planet:Mars&year=soon')).toEqual({
      mode: 'explore',
      gameId: null,
      place: null,
      year: null,
    });
    for (const bad of ['country:jp', 'country:JPN', 'city:', 'city:nobar', 'company:0', 'company:x', 'x', '', 'country:']) {
      expect(parsePlace(bad)).toBeNull();
    }
    expect(parseUrlState('?game=-4').gameId).toBeNull();
    expect(parseUrlState('?game=99999999999').gameId).toBeNull();
  });
});

describe('serialiseUrlState', () => {
  it('writes game and place in explore', () => {
    const out = serialiseUrlState('', { mode: 'explore', gameId: 7, place: { level: 'company', key: 3 } });
    expect(out).toBe('?game=7&place=company%3A3');
    expect(parseUrlState(out)).toMatchObject({ gameId: 7, place: { level: 'company', key: 3 } });
  });

  it('round trips a city place', () => {
    const out = serialiseUrlState('', { mode: 'explore', gameId: null, place: { level: 'city', key: 'JP|Tokyo' } });
    expect(parseUrlState(out).place).toEqual({ level: 'city', key: 'JP|Tokyo' });
  });

  it('writes the mode and drops game and place outside explore', () => {
    expect(serialiseUrlState('?game=7', { mode: 'insights', gameId: 7, place: null })).toBe('?mode=insights');
  });

  it('removes mode, game and place when back to a clean explore', () => {
    expect(serialiseUrlState('?mode=guess&game=1&place=country:JP', { mode: 'explore', gameId: null, place: null })).toBe('');
  });

  it('keeps unknown params', () => {
    const out = serialiseUrlState('?mode=guess&seed=abc123&r=1.2.3.0&s=o%3D1&x=y', { mode: 'guess', gameId: null, place: null });
    const p = new URLSearchParams(out);
    expect(p.get('seed')).toBe('abc123');
    expect(p.get('r')).toBe('1.2.3.0');
    expect(p.get('s')).toBe('o=1');
    expect(p.get('x')).toBe('y');
    expect(p.get('mode')).toBe('guess');
  });

  it('never writes year', () => {
    expect(serialiseUrlState('', { mode: 'explore', gameId: 1, place: null })).not.toContain('year');
  });
});

describe('links under a sub-path', () => {
  it('uses the base path', () => {
    expect(baseUrl(loc, '/overworld/')).toBe('https://u.github.io/overworld/');
    expect(baseUrl(loc, '/overworld')).toBe('https://u.github.io/overworld/');
    expect(baseUrl({ origin: 'https://u.github.io', pathname: '/overworld/index.html' }, './')).toBe('https://u.github.io/overworld/');
  });

  it('builds game and page links', () => {
    expect(gameLink(1942, loc, true, '/overworld/')).toBe('https://u.github.io/overworld/g/1942/?share');
    expect(gameLink(1942, loc, false, '/overworld/')).toBe('https://u.github.io/overworld/?game=1942');
    const q = new URLSearchParams({ seed: 'abc123', r: '1.2.3.0' });
    expect(pageLink('guess', q, loc, true, '/')).toBe('https://u.github.io/share/guess/?seed=abc123&r=1.2.3.0&mode=guess');
    expect(pageLink('myglobe', new URLSearchParams({ s: 'o=1&m=1&c=' }), loc, false, '/x/')).toBe(
      'https://u.github.io/x/?s=o%3D1%26m%3D1%26c%3D&mode=myglobe',
    );
  });
});

describe('clampYear', () => {
  it('clamps', () => {
    expect(clampYear(1800, 1970, 2024)).toBe(1970);
    expect(clampYear(3000, 1970, 2024)).toBe(2024);
    expect(clampYear(2000, 1970, 2024)).toBe(2000);
  });
});

describe('applyUrlToStore', () => {
  beforeEach(() => seedStore());
  afterEach(() => seedStore());

  it('selects a game and clamps the year', () => {
    applyUrlToStore('?game=100&year=1800');
    const s = useStore.getState();
    expect(s.selectedGameId).toBe(100);
    expect(s.year).toBe(s.timeline!.minYear);
  });

  it('ignores unknown game and place', () => {
    applyUrlToStore('?game=999999&place=company:999999');
    const s = useStore.getState();
    expect(s.selectedGameId).toBeNull();
    expect(s.selectedPlace).toBeNull();
  });

  it('selects a place and switches mode', () => {
    applyUrlToStore(`?place=company:${companies[0]!.id}`);
    expect(useStore.getState().selectedPlace).toEqual({ level: 'company', key: companies[0]!.id });
    applyUrlToStore('?mode=guess&seed=abc123');
    expect(useStore.getState().mode).toBe('guess');
  });
});
