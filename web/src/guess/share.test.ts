import { describe, expect, it } from 'vitest';
import { resultToShareParams, shareParamsToResult, shareTotal } from './share';
import type { ShareResult } from './share';
import { roundScore } from './scoring';

const kms = [312, 0, 4500, 20000, 51];
const result: ShareResult = {
  seed: 'abc123',
  rounds: kms.map((km, i) => ({ gameId: 100 + i, km, score: roundScore(km, i === 2), hint: i === 2 })),
};

describe('share params', () => {
  it('round trips', () => {
    const params = resultToShareParams(result);
    expect(params).toMatch(/^[A-Za-z0-9=&._%-]+$/);
    expect(shareParamsToResult(params)).toEqual(result);
    expect(shareParamsToResult(new URLSearchParams(params))).toEqual(result);
  });

  it('computes the total', () => {
    expect(shareTotal(result)).toBe(result.rounds.reduce((s, r) => s + r.score, 0));
  });

  it('refuses to encode an incomplete result', () => {
    expect(() => resultToShareParams({ ...result, rounds: result.rounds.slice(0, 4) })).toThrow();
    expect(() => resultToShareParams({ ...result, seed: 'bad seed!' })).toThrow();
  });

  const good = resultToShareParams(result);
  const parts = new URLSearchParams(good).get('r')!.split('_');
  const withRounds = (r: string) => new URLSearchParams({ v: '1', seed: 'abc123', r }).toString();
  const replaceFirst = (p: string) => withRounds([p, ...parts.slice(1)].join('_'));

  it.each([
    ['empty', ''],
    ['garbage', 'hello world'],
    ['broken escape', '%E0%A4%A'],
    ['wrong version', good.replace('v=1', 'v=2')],
    ['missing seed', good.replace('seed=abc123&', '')],
    ['bad seed', good.replace('seed=abc123', 'seed=a%20b')],
    ['too few rounds', withRounds(parts.slice(0, 4).join('_'))],
    ['too many rounds', withRounds([...parts, parts[0]].join('_'))],
    ['missing field', replaceFirst('100.0.5000')],
    ['non numeric', replaceFirst('a.b.c.d')],
    ['negative km', replaceFirst('100.-5.5000.0')],
    ['km too large', replaceFirst('100.99999.0.0')],
    ['score too large', replaceFirst('100.0.9999.0')],
    ['score does not match distance', replaceFirst('100.5000.5000.0')],
    ['bad hint flag', replaceFirst('100.0.5000.2')],
    ['zero game id', replaceFirst('0.0.5000.0')],
  ])('rejects %s', (_name, input) => {
    expect(shareParamsToResult(input)).toBeNull();
  });
});
