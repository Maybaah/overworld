import { describe, expect, it } from 'vitest';
import { countryCentre, countryName, numericToAlpha2, currentCountry } from './countries';

describe('countries', () => {
  it('maps ISO numeric codes to alpha-2', () => {
    expect(numericToAlpha2(392)).toBe('JP');
    expect(numericToAlpha2(840)).toBe('US');
    expect(numericToAlpha2(4)).toBe('AF');
    expect(numericToAlpha2(99999)).toBeNull();
    expect(numericToAlpha2(null)).toBeNull();
  });

  it('places IGDB North Korea codes in South Korea', () => {
    expect(numericToAlpha2(408)).toBe('KR');
    expect(numericToAlpha2(410)).toBe('KR');
  });

  it('returns a centre for known countries only', () => {
    const jp = countryCentre('JP')!;
    expect(jp.lat).toBeGreaterThan(30);
    expect(jp.lng).toBeGreaterThan(130);
    expect(countryCentre('jp')).toEqual(jp);
    expect(countryCentre('ZZ')).toBeNull();
    expect(countryCentre(null)).toBeNull();
  });

  it('returns common names', () => {
    expect(countryName('JP')).toBe('Japan');
    expect(countryName('ZZ')).toBeNull();
  });
});

describe('currentCountry', () => {
  it('moves dissolved states to their successor and keeps others', () => {
    expect(currentCountry('SU')).toBe('RU');
    expect(currentCountry('yu')).toBe('RS');
    expect(currentCountry('JP')).toBe('JP');
    expect(currentCountry(null)).toBeNull();
  });
});
