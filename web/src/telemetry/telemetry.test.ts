import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildBatches,
  deviceClass,
  entryOf,
  flush,
  referrerHost,
  resetForTests,
  scrubMessage,
  telemetryAllowed,
  track,
  utmOf,
} from './telemetry';

afterEach(() => {
  resetForTests();
  vi.useRealTimers();
});

describe('telemetryAllowed', () => {
  const base = { endpoint: '/api/e', hostname: 'overworld.example' };

  it('is on for a real host with an endpoint', () => {
    expect(telemetryAllowed(base)).toBe(true);
  });

  it('is off without an endpoint, in dev, for bots, Do Not Track and opt-outs', () => {
    expect(telemetryAllowed({ ...base, endpoint: '' })).toBe(false);
    expect(telemetryAllowed({ ...base, dev: true })).toBe(false);
    expect(telemetryAllowed({ ...base, webdriver: true })).toBe(false);
    expect(telemetryAllowed({ ...base, doNotTrack: true })).toBe(false);
    expect(telemetryAllowed({ ...base, optedOut: true })).toBe(false);
  });

  it('is off on local hosts and on hosts missing from the list', () => {
    for (const hostname of ['localhost', '127.0.0.1', 'app.localhost', 'overworld.test']) {
      expect(telemetryAllowed({ ...base, hostname })).toBe(false);
    }
    expect(telemetryAllowed({ ...base, hosts: 'overworld.example, www.overworld.example' })).toBe(true);
    expect(telemetryAllowed({ ...base, hostname: 'preview.pages.dev', hosts: 'overworld.example' })).toBe(false);
  });
});

describe('context helpers', () => {
  it('classifies devices', () => {
    expect(deviceClass(390, 844, true)).toBe('phone');
    expect(deviceClass(820, 1180, true)).toBe('tablet');
    expect(deviceClass(1440, 900, false)).toBe('desktop');
  });

  it('keeps only a foreign referrer host', () => {
    expect(referrerHost('https://www.reddit.com/r/games/comments/1', 'overworld.example')).toBe('reddit.com');
    expect(referrerHost('https://overworld.example/?game=1', 'www.overworld.example')).toBeUndefined();
    expect(referrerHost('not a url', 'overworld.example')).toBeUndefined();
  });

  it('reads UTM tags and the entry kind', () => {
    expect(utmOf('?utm_source=x&utm_campaign=launch&other=1')).toEqual({ utm_source: 'x', utm_campaign: 'launch' });
    expect(entryOf('?game=959')).toBe('game');
    expect(entryOf('?place=country:JP')).toBe('place');
    expect(entryOf('?mode=insights')).toBe('mode');
    expect(entryOf('?mode=explore')).toBe('landing');
    expect(entryOf('')).toBe('landing');
  });

  it('masks URLs and decimal numbers in error messages', () => {
    expect(scrubMessage('Failed to fetch https://cdn.example/a.json at 51.507, -0.127')).toBe('Failed to fetch [url] at #, #');
    expect(scrubMessage('   ')).toBeUndefined();
  });
});

describe('queue', () => {
  it('batches events with their age and drops empty fields', () => {
    const now = 1_000_000;
    const [body] = buildBatches(
      [
        { type: 'mode', t: now - 1500, p: { mode: 'insights' } },
        { type: 'ready', t: now - 900_000, p: {} },
      ],
      now,
      'sid_aaaaaaaaaaaaaaaa',
      { device: 'phone' },
    );
    expect(JSON.parse(body!)).toEqual({
      sid: 'sid_aaaaaaaaaaaaaaaa',
      ctx: { device: 'phone' },
      events: [
        { type: 'mode', dt: 1500, p: { mode: 'insights' } },
        { type: 'ready', dt: 600_000 },
      ],
    });
  });

  it('splits more than 50 events into several requests', () => {
    const events = Array.from({ length: 120 }, () => ({ type: 'ready' as const, t: 0, p: {} }));
    expect(buildBatches(events, 0, 'sid_aaaaaaaaaaaaaaaa', {})).toHaveLength(3);
  });

  it('sends nothing while telemetry is off', () => {
    const sender = vi.fn();
    const q = resetForTests({ allowed: false, sender });
    track('mode', { mode: 'explore' });
    flush(true);
    expect(q.queue()).toHaveLength(0);
    expect(sender).not.toHaveBeenCalled();
  });

  it('flushes after a pause and on page hide', () => {
    vi.useFakeTimers();
    const sender = vi.fn();
    resetForTests({ allowed: true, sender, endpoint: 'https://api.example/api/e' });
    track('game_open', { game: 1, title: 'Tetris', empty: '' });
    expect(sender).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(sender).toHaveBeenCalledTimes(1);
    const [url, body, beacon] = sender.mock.calls[0]!;
    expect(url).toBe('https://api.example/api/e');
    expect(beacon).toBe(false);
    expect(JSON.parse(body).events[0].p).toEqual({ game: 1, title: 'Tetris' });

    track('mode', { mode: 'myglobe' });
    flush(true);
    expect(sender).toHaveBeenCalledTimes(2);
    expect(sender.mock.calls[1]![2]).toBe(true);
  });
});
