import { describe, expect, it } from 'vitest';
import { parseSteamInput } from './steamInput';

const ID = '76561198000000000';

describe('parseSteamInput', () => {
  it('accepts a SteamID64', () => {
    expect(parseSteamInput(ID)).toEqual({ kind: 'steamid', id: ID });
    expect(parseSteamInput(`  ${ID}\n`)).toEqual({ kind: 'steamid', id: ID });
  });

  it('accepts profile URLs with ids', () => {
    for (const u of [
      `https://steamcommunity.com/profiles/${ID}`,
      `https://steamcommunity.com/profiles/${ID}/`,
      `http://www.steamcommunity.com/profiles/${ID}/games/?tab=all`,
      `steamcommunity.com/profiles/${ID}?x=1`,
      `HTTPS://SteamCommunity.com/Profiles/${ID}#top`,
    ]) {
      expect(parseSteamInput(u)).toEqual({ kind: 'steamid', id: ID });
    }
  });

  it('accepts vanity URLs', () => {
    for (const u of [
      'https://steamcommunity.com/id/gabelogannewell',
      'https://steamcommunity.com/id/gabelogannewell/',
      'www.steamcommunity.com/id/gabelogannewell/games?tab=all',
      'steamcommunity.com/id/gabelogannewell#x',
    ]) {
      expect(parseSteamInput(u)).toEqual({ kind: 'vanity', name: 'gabelogannewell' });
    }
  });

  it('accepts bare vanity names', () => {
    expect(parseSteamInput('gabelogannewell')).toEqual({ kind: 'vanity', name: 'gabelogannewell' });
    expect(parseSteamInput('a_b-9')).toEqual({ kind: 'vanity', name: 'a_b-9' });
    expect(parseSteamInput('ab')).toEqual({ kind: 'vanity', name: 'ab' });
    expect(parseSteamInput('x'.repeat(32))).toEqual({ kind: 'vanity', name: 'x'.repeat(32) });
    expect(parseSteamInput('12345')).toEqual({ kind: 'vanity', name: '12345' });
  });

  it('rejects bad input with a reason', () => {
    const bad = [
      '',
      '   ',
      'a',
      'x'.repeat(33),
      'has space',
      'bad!name',
      '12345678901234567',
      'https://steamcommunity.com/profiles/123',
      'https://steamcommunity.com/profiles/',
      'https://steamcommunity.com/id/',
      'https://steamcommunity.com/id/a',
      'https://example.com/id/gabelogannewell',
      'https://steamcommunity.com.evil.com/id/gabe',
      'https://steamcommunity.com/groups/valve',
      'https://store.steampowered.com/app/10',
      'gabe/newell',
    ];
    for (const b of bad) {
      const r = parseSteamInput(b);
      expect(r.kind, b).toBe('invalid');
      if (r.kind === 'invalid') expect(r.reason.length).toBeGreaterThan(5);
    }
  });
});
