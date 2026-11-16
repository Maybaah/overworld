import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDetail } from '@shared';
import { ROLE_TYPES } from '@shared';

vi.mock('./loader', () => ({
  loadCore: vi.fn(),
  loadGameDetail: vi.fn(),
}));

import { loadCore, loadGameDetail } from './loader';
import { useStore } from './store';
import { company, game } from './testData';

function detail(id: number): GameDetail {
  return { id, leadBasis: 'igdb_single_developer', platforms: [], screenshots: [], steamAppId: null, roles: [], sources: [] };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const initial = useStore.getState();

beforeEach(() => {
  useStore.setState(initial, true);
  vi.mocked(loadCore).mockReset();
  vi.mocked(loadGameDetail).mockReset();
});

describe('store', () => {
  it('ignores a stale detail response when another game was selected meanwhile', async () => {
    const first = deferred<GameDetail>();
    const second = deferred<GameDetail>();
    vi.mocked(loadGameDetail).mockImplementation((id) => (id === 1 ? first.promise : second.promise));

    const p1 = useStore.getState().selectGame(1);
    const p2 = useStore.getState().selectGame(2);
    second.resolve(detail(2));
    await p2;
    expect(useStore.getState().selectedGameDetail?.id).toBe(2);

    first.resolve(detail(1));
    await p1;
    expect(useStore.getState().selectedGameId).toBe(2);
    expect(useStore.getState().selectedGameDetail?.id).toBe(2);
  });

  it('ignores a stale detail error', async () => {
    const first = deferred<GameDetail>();
    vi.mocked(loadGameDetail).mockImplementation((id) => (id === 1 ? first.promise : Promise.resolve(detail(id))));
    const p1 = useStore.getState().selectGame(1);
    await useStore.getState().selectGame(2);
    first.reject(new Error('boom'));
    await p1;
    expect(useStore.getState().detailError).toBeNull();
    expect(useStore.getState().selectedGameDetail?.id).toBe(2);
  });

  it('clears the detail when the selection is cleared', async () => {
    vi.mocked(loadGameDetail).mockResolvedValue(detail(1));
    await useStore.getState().selectGame(1);
    await useStore.getState().selectGame(null);
    expect(useStore.getState().selectedGameId).toBeNull();
    expect(useStore.getState().selectedGameDetail).toBeNull();
  });

  it('toggles roles and starts with all enabled', () => {
    expect([...useStore.getState().enabledRoles]).toEqual([...ROLE_TYPES]);
    useStore.getState().toggleRole('qa');
    expect(useStore.getState().enabledRoles.has('qa')).toBe(false);
    useStore.getState().toggleRole('qa');
    expect(useStore.getState().enabledRoles.has('qa')).toBe(true);
  });

  it('sets year, playing and place', () => {
    useStore.getState().setYear(1999);
    useStore.getState().setPlaying(true);
    useStore.getState().selectPlace({ level: 'country', key: 'JP' });
    const s = useStore.getState();
    expect([s.year, s.playing, s.selectedPlace]).toEqual([1999, true, { level: 'country', key: 'JP' }]);
  });

  it('init builds indexes and timeline, and reports errors', async () => {
    const meta = { fixture: true, counts: { games: 1, companies: 1 } } as never;
    vi.mocked(loadCore).mockResolvedValueOnce({ meta, companies: [company(1)], games: [game(1, { year: 2005 })] });
    await useStore.getState().init();
    let s = useStore.getState();
    expect(s.status).toBe('ready');
    expect(s.year).toBe(new Date().getFullYear());
    expect(s.timeline?.countAt('company', 1, 2005)).toBe(1);

    vi.mocked(loadCore).mockRejectedValueOnce(new Error('HTTP 500'));
    await useStore.getState().init();
    s = useStore.getState();
    expect(s.status).toBe('error');
    expect(s.error).toBe('HTTP 500');
  });
});
