import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../data/store';
import { resetSteamMapCache } from '../data/loader';
import { games, seedStore } from '../ui/testUtils';
import { MyGlobePanel, shareParamsToSummary, summaryToShareParams } from './MyGlobePanel';

const steamMap = Object.fromEntries(games.map((g) => [String(1000 + g.id), g.id]));
const ID = '76561198000000001';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

let owned: () => Response;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetSteamMapCache();
  seedStore({ gameFilter: null, selectedPlace: null, mode: 'myglobe' });
  owned = () => json({ steamId: ID, games: [] });
  fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/steam.json')) return json(steamMap);
    if (url.startsWith('/api/steam/owned')) return owned();
    return json({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function submit(user: ReturnType<typeof userEvent.setup>, value: string) {
  const field = screen.getByLabelText('Steam profile');
  await user.clear(field);
  if (value) await user.type(field, value);
  await user.click(screen.getByRole('button', { name: 'Show my globe' }));
}

describe('MyGlobePanel', () => {
  it('starts idle with the field, hint, privacy line and attribution', () => {
    render(<MyGlobePanel />);
    expect(screen.getByLabelText('Steam profile')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show my globe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try a sample library' })).toBeInTheDocument();
    expect(screen.getByText(/steamcommunity\.com\/id\/yourname/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is stored/)).toBeInTheDocument();
    expect(screen.getByText('Game library data from Steam. Overworld is not affiliated with Valve or Steam.')).toBeInTheDocument();
  });

  it('builds a sample library end to end and filters the globe', async () => {
    const user = userEvent.setup();
    render(<MyGlobePanel />);
    await user.click(screen.getByRole('button', { name: 'Try a sample library' }));

    expect(await screen.findByText(/of your games come from Japan/)).toBeInTheDocument();
    expect(screen.getByText(/not a real profile/)).toBeInTheDocument();
    expect(screen.getAllByText(/found in Overworld/).length).toBeGreaterThan(0);

    const filter = useStore.getState().gameFilter;
    expect(filter).toBeInstanceOf(Set);
    expect(filter!.size).toBe(60);
    expect(filter!.has(100)).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith('/api/steam/owned'))).toBe(false);

    expect(within(screen.getByRole('list', { name: 'Countries' })).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(screen.getByRole('list', { name: 'Top studios' })).toBeInTheDocument();
    expect((screen.getByLabelText('Summary to copy') as HTMLTextAreaElement).value).toContain('Japan');
  });

  it('selects a place when a country, city or studio row is clicked', async () => {
    const user = userEvent.setup();
    render(<MyGlobePanel />);
    await user.click(screen.getByRole('button', { name: 'Try a sample library' }));
    await screen.findByText(/of your games come from/);

    await user.click(within(screen.getByRole('list', { name: 'Countries' })).getAllByRole('button')[0]!);
    expect(useStore.getState().selectedPlace).toEqual({ level: 'country', key: 'JP' });

    await user.click(within(screen.getByRole('list', { name: 'Top cities' })).getAllByRole('button')[0]!);
    expect(useStore.getState().selectedPlace?.level).toBe('city');

    await user.click(within(screen.getByRole('list', { name: 'Top studios' })).getAllByRole('button')[0]!);
    expect(useStore.getState().selectedPlace?.level).toBe('company');
  });

  it('toggles between games and playtime', async () => {
    const user = userEvent.setup();
    render(<MyGlobePanel />);
    await user.click(screen.getByRole('button', { name: 'Try a sample library' }));
    await screen.findByText(/of your games come from/);
    const byGames = screen.getByRole('button', { name: 'By games' });
    expect(byGames).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'By playtime' }));
    expect(screen.getByRole('button', { name: 'By playtime' })).toHaveAttribute('aria-pressed', 'true');
    expect(byGames).toHaveAttribute('aria-pressed', 'false');
  });

  it('loads a real profile through the proxy route', async () => {
    owned = () =>
      json({
        steamId: ID,
        games: [
          { appId: 1100, minutes: 60 },
          { appId: 1101, minutes: 10 },
          { appId: 1103, minutes: 5 },
          { appId: 7, minutes: 5 },
        ],
      });
    const user = userEvent.setup();
    render(<MyGlobePanel />);
    await submit(user, 'https://steamcommunity.com/id/gabe');
    expect(await screen.findByText(/of your games come from/)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find((c) => String(c[0]).startsWith('/api/steam/owned'))!;
    expect(call[0]).toBe('/api/steam/owned?profile=gabe');
    expect(useStore.getState().gameFilter).toEqual(new Set([100, 101, 103]));
    expect(screen.queryByText(/not a real profile/)).not.toBeInTheDocument();
  });

  it('shows a loading state', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fetchMock.mockImplementation(async (url: string) => {
      await gate;
      return url.endsWith('/steam.json') ? json(steamMap) : owned();
    });
    const user = userEvent.setup();
    render(<MyGlobePanel />);
    await submit(user, 'gabe');
    expect(await screen.findByText(/Loading your library/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show my globe' })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.queryByText(/Loading your library/)).not.toBeInTheDocument());
  });

  describe('errors', () => {
    const cases: [string, number, Record<string, unknown>, RegExp][] = [
      ['invalid_profile', 400, { error: 'invalid_profile', reason: 'Server says no.' }, /Server says no\./],
      ['profile_not_found', 404, { error: 'profile_not_found' }, /No Steam profile was found/],
      ['private_profile', 403, { error: 'private_profile' }, /Edit profile.*Privacy settings.*Game details to Public/],
      ['steam_unavailable', 502, { error: 'steam_unavailable' }, /Steam did not answer/],
      ['rate_limited', 429, { error: 'rate_limited' }, /Too many requests/],
      ['not_configured', 503, { error: 'not_configured' }, /not connected to Steam/],
    ];

    for (const [name, status, body, message] of cases) {
      it(`shows a specific message for ${name}`, async () => {
        owned = () => json(body, status);
        const user = userEvent.setup();
        render(<MyGlobePanel />);
        await submit(user, 'gabe');
        expect(await screen.findByRole('alert')).toHaveTextContent(message);
        expect(useStore.getState().gameFilter).toBeNull();
      });
    }

    it('shows a message when the server cannot be reached', async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.endsWith('/steam.json')) return json(steamMap);
        throw new TypeError('offline');
      });
      const user = userEvent.setup();
      render(<MyGlobePanel />);
      await submit(user, 'gabe');
      expect(await screen.findByRole('alert')).toHaveTextContent(/Could not reach the Overworld server/);
    });

    it('rejects bad input before calling the server', async () => {
      const user = userEvent.setup();
      render(<MyGlobePanel />);
      await submit(user, 'bad name!');
      expect(await screen.findByRole('alert')).toHaveTextContent(/custom profile name|steamcommunity/);
      await submit(user, '');
      expect(await screen.findByRole('alert')).toHaveTextContent(/Enter a Steam profile/);
      expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith('/api/steam/owned'))).toBe(false);
    });

    it('clears a previous filter when a new lookup fails', async () => {
      const user = userEvent.setup();
      render(<MyGlobePanel />);
      await user.click(screen.getByRole('button', { name: 'Try a sample library' }));
      await screen.findByText(/of your games come from/);
      expect(useStore.getState().gameFilter).not.toBeNull();
      owned = () => json({ error: 'private_profile' }, 403);
      await submit(user, 'gabe');
      await screen.findByRole('alert');
      expect(useStore.getState().gameFilter).toBeNull();
    });
  });

  it('clears the filter with Clear and returns to idle', async () => {
    const user = userEvent.setup();
    render(<MyGlobePanel />);
    await user.click(screen.getByRole('button', { name: 'Try a sample library' }));
    await screen.findByText(/of your games come from/);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(useStore.getState().gameFilter).toBeNull();
    expect(screen.queryByText(/of your games come from/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show my globe' })).toBeEnabled();
  });

  it('clears the filter on unmount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<MyGlobePanel />);
    await user.click(screen.getByRole('button', { name: 'Try a sample library' }));
    await screen.findByText(/of your games come from/);
    expect(useStore.getState().gameFilter).not.toBeNull();
    unmount();
    expect(useStore.getState().gameFilter).toBeNull();
  });

  it('copies the summary text', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    render(<MyGlobePanel />);
    await user.click(screen.getByRole('button', { name: 'Try a sample library' }));
    await screen.findByText(/of your games come from/);
    await user.click(screen.getByRole('button', { name: 'Copy text' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('found in Overworld'));
    expect(await screen.findByText('Copied.')).toBeInTheDocument();
  });

  it('exports the share param helpers', () => {
    const summary = { owned: 10, matched: 8, countries: [{ code: 'JP', percent: 100 }] };
    expect(shareParamsToSummary(summaryToShareParams(summary))).toEqual(summary);
  });
});
