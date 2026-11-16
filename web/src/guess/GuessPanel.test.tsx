import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../data/loader', () => ({
  loadCore: vi.fn(),
  loadGameDetail: vi.fn(),
}));

import { loadGameDetail } from '../data/loader';
import { useStore } from '../data/store';
import { fixtureData } from './fixtures';
import { GuessPanel } from './GuessPanel';
import { buildPool, pickRounds } from './rounds';
import { haversineKm } from './distance';

const { indexes } = fixtureData();
const SEED = 'flow';
const rounds = pickRounds(buildPool(indexes), SEED);
let selectGame: ReturnType<typeof vi.fn>;

function click(lat: number, lng: number) {
  act(() => useStore.getState().reportGlobeClick(lat, lng));
}

function setUrl(search: string) {
  window.history.replaceState({}, '', `/${search}`);
}

async function placeAt(index: number) {
  click(rounds[index]!.lat, rounds[index]!.lng);
  await userEvent.click(screen.getByRole('button', { name: 'Confirm guess' }));
}

beforeEach(() => {
  setUrl('');
  selectGame = vi.fn();
  vi.mocked(loadGameDetail).mockImplementation(async (id: number) => ({
    id,
    leadBasis: 'igdb_single_developer',
    platforms: [],
    screenshots: [`shot${id}`],
    steamAppId: null,
    roles: [],
    sources: [],
  }));
  useStore.setState({
    status: 'ready',
    indexes,
    mode: 'guess',
    globeClick: null,
    extraArcs: [],
    extraMarkers: [],
    cameraRequest: null,
    selectGame,
  });
});

afterEach(() => {
  cleanup();
  setUrl('');
});

describe('GuessPanel', () => {
  it('shows the start screen and starts a game on Start', async () => {
    render(<GuessPanel />);
    expect(screen.getByRole('heading', { name: 'Guess where it was made' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('heading', { name: 'Round 1 of 5' })).toBeInTheDocument();
  });

  it('disables Start until the data is loaded', () => {
    useStore.setState({ indexes: null });
    render(<GuessPanel />);
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('starts the seed from the URL without the start screen', () => {
    setUrl(`?mode=guess&seed=${SEED}`);
    render(<GuessPanel />);
    expect(screen.getByRole('heading', { name: 'Round 1 of 5' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it('ignores an invalid seed in the URL', () => {
    setUrl('?mode=guess&seed=a%20b');
    render(<GuessPanel />);
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('shows the screenshot, hides title and year, and falls back to the cover', async () => {
    setUrl(`?mode=guess&seed=${SEED}`);
    render(<GuessPanel />);
    const first = rounds[0]!;
    const img = await screen.findByRole('img');
    expect(img).toHaveAttribute('src', `https://images.igdb.com/igdb/image/upload/t_screenshot_big/shot${first.gameId}.jpg`);
    expect(screen.queryByText(first.name)).toBeNull();
    fireEvent.error(img);
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      `https://images.igdb.com/igdb/image/upload/t_cover_big/${first.cover}.jpg`,
    );
  });

  it('uses the cover when there is no screenshot', async () => {
    vi.mocked(loadGameDetail).mockImplementation(async (id: number) => ({
      id,
      leadBasis: 'igdb_single_developer',
      platforms: [],
      screenshots: [],
      steamAppId: null,
      roles: [],
      sources: [],
    }));
    setUrl(`?mode=guess&seed=${SEED}`);
    render(<GuessPanel />);
    const img = await screen.findByRole('img');
    expect(img.getAttribute('src')).toContain(`t_cover_big/${rounds[0]!.cover}`);
  });

  it('places, moves and confirms a guess, drawing extras and flying the camera', async () => {
    setUrl(`?mode=guess&seed=${SEED}`);
    render(<GuessPanel />);
    const confirm = screen.getByRole('button', { name: 'Confirm guess' });
    expect(confirm).toBeDisabled();

    click(10, 10);
    expect(confirm).toBeEnabled();
    expect(useStore.getState().extraMarkers).toHaveLength(1);
    click(20, 30);
    const markers = useStore.getState().extraMarkers;
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ lat: 20, lng: 30, color: '#56B4E9' });

    await userEvent.click(confirm);
    const { extraMarkers, extraArcs, cameraRequest } = useStore.getState();
    const answer = rounds[0]!;
    expect(extraMarkers).toHaveLength(2);
    expect(extraMarkers.find((m) => m.color === '#F0E442')).toMatchObject({ lat: answer.lat, lng: answer.lng });
    expect(extraArcs).toHaveLength(1);
    expect(extraArcs[0]).toMatchObject({ startLat: 20, startLng: 30, endLat: answer.lat, endLng: answer.lng, color: '#F0E442' });
    expect(cameraRequest).not.toBeNull();
    expect(cameraRequest!.altitude).toBeGreaterThanOrEqual(0.5);
    expect(cameraRequest!.altitude).toBeLessThanOrEqual(2.5);

    const km = Math.round(haversineKm({ lat: 20, lng: 30 }, answer));
    expect(screen.getByText(`${km.toLocaleString('en-US')} km`)).toBeInTheDocument();
    expect(screen.getByText(answer.name)).toBeInTheDocument();
    expect(screen.getByText(answer.studioName)).toBeInTheDocument();

    click(0, 0);
    expect(useStore.getState().extraMarkers).toHaveLength(2);
    expect(useStore.getState().extraMarkers.find((m) => m.color === '#56B4E9')).toMatchObject({ lat: 20, lng: 30 });
  });

  it('shows the title and halves the score with the hint', async () => {
    setUrl(`?mode=guess&seed=${SEED}`);
    render(<GuessPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'Show title' }));
    expect(screen.getByText(rounds[0]!.name)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show title' })).toBeNull();
    await placeAt(0);
    expect(screen.getByText('2,500')).toBeInTheDocument();
  });

  it('announces the score in a live region', async () => {
    setUrl(`?mode=guess&seed=${SEED}`);
    render(<GuessPanel />);
    await placeAt(0);
    const live = document.querySelector('[aria-live="polite"]')!;
    expect(live).toHaveTextContent('Round 1 score 5,000.');
  });

  it('plays five rounds and shows the end screen', async () => {
    setUrl(`?mode=guess&seed=${SEED}`);
    render(<GuessPanel />);
    for (let i = 0; i < 5; i++) {
      expect(screen.getByRole('heading', { name: `Round ${i + 1} of 5` })).toBeInTheDocument();
      await placeAt(i);
      const open = screen.getByRole('button', { name: 'Open game card' });
      if (i < 4) expect(open).toBeDisabled();
      else expect(open).toBeEnabled();
      await userEvent.click(screen.getByRole('button', { name: i < 4 ? 'Next round' : 'See results' }));
    }
    expect(screen.getByRole('heading', { name: 'Game over' })).toBeInTheDocument();
    expect(screen.getByText(/25,000/, { selector: '.gs-total' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Rounds' });
    expect(list.querySelectorAll('li')).toHaveLength(5);
    expect(list).toHaveTextContent(rounds[0]!.name);
    expect(list).toHaveTextContent(rounds[0]!.city!);

    const summary = screen.getByRole('textbox', { name: 'Result summary' }) as HTMLTextAreaElement;
    expect(summary.value).toContain('Overworld guess: 25,000 / 25,000');
    expect(summary.value).toContain('1. 0 km — 5,000');
    const link = screen.getByRole('textbox', { name: 'Challenge link' }) as HTMLInputElement;
    expect(link.value).toBe(`${window.location.origin}/?mode=guess&seed=${SEED}`);
    expect(useStore.getState().extraMarkers).toHaveLength(0);
  });

  it('plays the same five again and starts a new game on Play again', async () => {
    setUrl(`?mode=guess&seed=${SEED}`);
    render(<GuessPanel />);
    for (let i = 0; i < 5; i++) {
      await placeAt(i);
      await userEvent.click(screen.getByRole('button', { name: i < 4 ? 'Next round' : 'See results' }));
    }
    await userEvent.click(screen.getByRole('button', { name: 'Play the same five' }));
    expect(screen.getByRole('heading', { name: 'Round 1 of 5' })).toBeInTheDocument();
    await placeAt(0);
    expect(screen.getByText(rounds[0]!.name)).toBeInTheDocument();
    for (let i = 1; i < 5; i++) {
      await userEvent.click(screen.getByRole('button', { name: 'Next round' }));
      await placeAt(i);
    }
    await userEvent.click(screen.getByRole('button', { name: 'See results' }));
    await userEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(screen.getByRole('heading', { name: 'Round 1 of 5' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Game over' })).toBeNull();
  });

  it('opens the game card in explore mode after the last round', async () => {
    setUrl(`?mode=guess&seed=${SEED}`);
    render(<GuessPanel />);
    for (let i = 0; i < 4; i++) {
      await placeAt(i);
      await userEvent.click(screen.getByRole('button', { name: 'Next round' }));
    }
    await placeAt(4);
    await userEvent.click(screen.getByRole('button', { name: 'Open game card' }));
    expect(useStore.getState().mode).toBe('explore');
    expect(selectGame).toHaveBeenCalledWith(rounds[4]!.gameId);
  });

  it('places a guess from the country select', async () => {
    setUrl(`?mode=guess&seed=${SEED}`);
    render(<GuessPanel />);
    const select = screen.getByRole('combobox', { name: 'Guess by country' });
    const codes = Array.from(select.querySelectorAll('option'))
      .map((o) => o.getAttribute('value'))
      .filter(Boolean);
    expect(codes.sort()).toEqual(indexes.countries.map((c) => c.code).sort());
    expect(codes).toContain('IT');

    expect(screen.getByRole('button', { name: 'Confirm guess' })).toBeDisabled();
    await userEvent.selectOptions(select, 'FR');
    const fr = indexes.countries.find((c) => c.code === 'FR')!;
    expect(useStore.getState().extraMarkers[0]).toMatchObject({ lat: fr.lat, lng: fr.lng });
    expect(screen.getByRole('button', { name: 'Confirm guess' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm guess' }));
    expect(screen.getByRole('button', { name: 'Next round' })).toBeInTheDocument();
  });

  it('clears the extras on unmount', () => {
    setUrl(`?mode=guess&seed=${SEED}`);
    const { unmount } = render(<GuessPanel />);
    click(10, 10);
    expect(useStore.getState().extraMarkers).toHaveLength(1);
    unmount();
    expect(useStore.getState().extraMarkers).toHaveLength(0);
    expect(useStore.getState().extraArcs).toHaveLength(0);
  });

  it('ignores a stale globe click that existed before mounting', async () => {
    useStore.setState({ globeClick: { lat: 1, lng: 1, seq: 4 } });
    setUrl(`?mode=guess&seed=${SEED}`);
    render(<GuessPanel />);
    expect(screen.getByRole('button', { name: 'Confirm guess' })).toBeDisabled();
    await waitFor(() => expect(useStore.getState().extraMarkers).toHaveLength(0));
  });
});
