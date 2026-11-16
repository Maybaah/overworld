import { describe, expect, it } from 'vitest';
import { buildIndexes } from '../data/indexes';
import { company, game } from '../data/testData';
import { altitudeForDistance, haversineKm, kmToMiles, midpoint } from './distance';
import { baseScore, roundScore } from './scoring';
import { POOL_SIZE, buildPool, isValidSeed, pickRounds, randomSeed } from './rounds';
import { fixtureData } from './fixtures';

describe('haversineKm', () => {
  const cases: [string, [number, number], [number, number], number][] = [
    ['London to Paris', [51.5074, -0.1278], [48.8566, 2.3522], 344],
    ['New York to Los Angeles', [40.7128, -74.006], [34.0522, -118.2437], 3936],
    ['Tokyo to Sydney', [35.6762, 139.6503], [-33.8688, 151.2093], 7823],
  ];
  it.each(cases)('%s within 1%%', (_n, a, b, expected) => {
    const d = haversineKm({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });
    expect(Math.abs(d - expected) / expected).toBeLessThan(0.01);
  });

  it('is zero for the same point and symmetric', () => {
    const a = { lat: 10, lng: 20 };
    const b = { lat: -30, lng: 100 };
    expect(haversineKm(a, a)).toBe(0);
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });

  it('converts to miles', () => {
    expect(kmToMiles(100)).toBeCloseTo(62.1371, 3);
  });

  it('finds the midpoint and clamps the altitude', () => {
    const m = midpoint({ lat: 0, lng: 0 }, { lat: 0, lng: 90 });
    expect(m.lat).toBeCloseTo(0, 6);
    expect(m.lng).toBeCloseTo(45, 6);
    expect(altitudeForDistance(0)).toBe(0.5);
    expect(altitudeForDistance(5000)).toBeCloseTo(1, 6);
    expect(altitudeForDistance(20000)).toBe(2.5);
    expect(altitudeForDistance(50000)).toBe(2.5);
  });
});

describe('scoring', () => {
  it('gives the maximum inside the 50 km plateau', () => {
    expect(baseScore(0)).toBe(5000);
    expect(baseScore(50)).toBe(5000);
  });

  it('decays after the plateau', () => {
    expect(baseScore(50.5)).toBeLessThan(5000);
    expect(baseScore(1550)).toBe(Math.round(5000 * Math.exp(-1)));
    expect(baseScore(3050)).toBe(Math.round(5000 * Math.exp(-2)));
  });

  it('never goes below zero', () => {
    expect(baseScore(20000)).toBeGreaterThanOrEqual(0);
    expect(baseScore(1e9)).toBe(0);
  });

  it('halves and rounds when the hint was used', () => {
    expect(roundScore(10, true)).toBe(2500);
    expect(roundScore(10, false)).toBe(5000);
    const base = baseScore(1550);
    expect(roundScore(1550, true)).toBe(Math.round(base / 2));
    expect(roundScore(1e9, true)).toBe(0);
  });
});

describe('pool', () => {
  it('keeps only games with a cover whose lead studio has city precision', () => {
    const pool = buildPool(fixtureData().indexes);
    const ids = pool.map((p) => p.gameId);
    expect(ids).toContain(100);
    expect(ids).not.toContain(201);
    expect(ids).not.toContain(202);
    expect(ids).not.toContain(203);
    expect(pool.find((p) => p.gameId === 100)).toMatchObject({ studioName: 'Studio Tokyo', city: 'Tokyo', country: 'JP' });
  });

  it('only looks at the most popular games', () => {
    const companies = [company(1)];
    const games = Array.from({ length: POOL_SIZE + 5 }, (_, i) => game(i + 1, { cover: `c${i}`, leadCompanyId: 1 }));
    const pool = buildPool(buildIndexes(companies, games));
    expect(pool).toHaveLength(POOL_SIZE);
    expect(pool.at(-1)!.gameId).toBe(POOL_SIZE);
  });
});

describe('pickRounds', () => {
  const pool = buildPool(fixtureData().indexes);
  const key = (seed: string) => pickRounds(pool, seed).map((r) => r.gameId);

  it('returns five rounds, the same for the same seed', () => {
    expect(key('abc123')).toHaveLength(5);
    expect(key('abc123')).toEqual(key('abc123'));
  });

  it('differs between seeds', () => {
    const seen = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((s) => key(s).join(',')));
    expect(seen.size).toBeGreaterThan(1);
    expect(key('seed-one')).not.toEqual(key('seed-two'));
  });

  it('never uses a studio twice', () => {
    for (let i = 0; i < 50; i++) {
      const rounds = pickRounds(pool, `s${i}`);
      expect(new Set(rounds.map((r) => r.companyId)).size).toBe(rounds.length);
    }
  });

  it('returns fewer rounds when there are not enough studios', () => {
    expect(pickRounds(pool.slice(0, 3), 'x')).toHaveLength(3);
  });

  it('makes valid random seeds', () => {
    for (let i = 0; i < 20; i++) expect(isValidSeed(randomSeed())).toBe(true);
    expect(isValidSeed('')).toBe(false);
    expect(isValidSeed('a b')).toBe(false);
    expect(isValidSeed('x'.repeat(33))).toBe(false);
    expect(isValidSeed(5)).toBe(false);
  });
});
