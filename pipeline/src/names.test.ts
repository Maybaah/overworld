import { describe, expect, it } from 'vitest';
import { normalizeCompanyName as n } from './names';

describe('normalizeCompanyName', () => {
  it('lower-cases, strips diacritics and punctuation, collapses spaces', () => {
    expect(n('  Ubisoft   Montréal ')).toBe('ubisoft montreal');
    expect(n("Larian-Studios!")).toBe('larian studios');
    expect(n('CD Projekt RED')).toBe('cd projekt red');
    expect(n('Paradox  Development Studio')).toBe('paradox development studio');
  });

  it('drops trailing legal words', () => {
    expect(n('Capcom Co., Ltd.')).toBe('capcom');
    expect(n('Valve Corporation')).toBe('valve');
    expect(n('Bohemia Interactive s.r.o.')).toBe('bohemia interactive sro');
    expect(n('Mojang AB')).toBe('mojang');
    expect(n('Rovio Entertainment Oy')).toBe('rovio entertainment');
    expect(n('Konami Digital Entertainment K.K.')).toBe('konami digital entertainment');
    expect(n('Foo S.A.')).toBe('foo');
    expect(n('Foo Pty Ltd')).toBe('foo');
    expect(n('Foo Games GmbH')).toBe('foo games');
    expect(n('Bar BV')).toBe('bar');
    expect(n('Baz Limited')).toBe('baz');
    expect(n('Baz PLC')).toBe('baz');
  });

  it('keeps words that tell companies apart', () => {
    expect(n('Foo Games')).not.toBe(n('Foo'));
    expect(n('Foo Studios')).toBe('foo studios');
    expect(n('Foo Entertainment Inc.')).toBe('foo entertainment');
    expect(n('Foo Interactive')).toBe('foo interactive');
  });

  it('only drops trailing words, and never everything', () => {
    expect(n('Co Op Games')).toBe('co op games');
    expect(n('Inc')).toBe('inc');
    expect(n('Acme Inc Ltd')).toBe('acme');
  });

  it('keeps non-latin names', () => {
    expect(n('株式会社 カプコン')).toBe('株式会社 カプコン');
  });
});
