import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { detailFor, seedStore } from './testUtils';
import { useStore } from '../data/store';

vi.mock('../guess/GuessPanel', () => ({ GuessPanel: () => <div data-testid="guess-panel" /> }));
vi.mock('../myglobe/MyGlobePanel', () => ({ MyGlobePanel: () => <div data-testid="myglobe-panel" /> }));
vi.mock('../insights/InsightsPanel', () => ({ InsightsPanel: () => <div data-testid="insights-panel" /> }));

import { Overlay } from './Overlay';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubWidth(mid: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    get matches() {
      return mid;
    },
    media: '',
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal('matchMedia', () => mq);
  return {
    set(next: boolean) {
      mid = next;
      act(() => listeners.forEach((fn) => fn()));
    },
  };
}

const searchBox = () => screen.queryByRole('combobox', { name: 'Search games' });
const slider = () => screen.queryByRole('slider', { name: 'Year' });
const legend = () => screen.queryByRole('region', { name: 'Role filters' });
const card = () => screen.queryByRole('complementary', { name: /^Game:/ });
const place = () => screen.queryByRole('complementary', { name: /^Place:/ });

describe('Overlay', () => {
  it('renders the wordmark and the explore panels', () => {
    seedStore();
    render(<Overlay />);
    expect(screen.getByText('Overworld')).toBeInTheDocument();
    expect(searchBox()).toBeInTheDocument();
    expect(legend()).toBeNull();
    expect(slider()).toBeInTheDocument();
    expect(screen.queryByText(/Cover art via/)).toBeNull();
    expect(card()).toBeNull();
    expect(screen.queryByTestId('guess-panel')).toBeNull();
  });

  it('shows the game card and place panel together on wide screens', () => {
    seedStore({
      selectedGameId: 100,
      selectedGameDetail: detailFor(100),
      selectedPlace: { level: 'country', key: 'JP' },
    });
    const { container } = render(<Overlay />);
    expect(card()).toBeInTheDocument();
    expect(place()).toBeInTheDocument();
    expect(container.querySelector('.ow-root')).toHaveAttribute('data-front', 'game');
  });

  it('has an accessible name on every button', () => {
    seedStore({ selectedGameId: 100, selectedGameDetail: detailFor(100), selectedPlace: { level: 'country', key: 'JP' } });
    render(<Overlay />);
    for (const b of screen.getAllByRole('button')) expect(b).toHaveAccessibleName();
  });

  it('shows a load error', () => {
    seedStore({ status: 'error', error: 'offline', indexes: null, timeline: null, meta: null });
    render(<Overlay />);
    expect(screen.getByRole('alert')).toHaveTextContent('offline');
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  describe('modes', () => {
    it('switches modes from the nav', async () => {
      seedStore();
      const user = userEvent.setup();
      render(<Overlay />);
      await user.click(screen.getByRole('button', { name: 'Insights' }));
      expect(useStore.getState().mode).toBe('insights');
      expect(screen.getByRole('button', { name: 'Insights' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Explore' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('guess: only the guess panel', () => {
      seedStore({ mode: 'guess', selectedGameId: 100, selectedGameDetail: detailFor(100) });
      render(<Overlay />);
      expect(screen.getByTestId('guess-panel')).toBeInTheDocument();
      expect(searchBox()).toBeNull();
      expect(place()).toBeNull();
      expect(card()).toBeNull();
      expect(legend()).toBeNull();
      expect(slider()).toBeNull();
      expect(screen.queryByText(/Cover art via/)).toBeNull();
    });

    it('myglobe: panel, card and slider but no search or legend', () => {
      seedStore({ mode: 'myglobe', selectedGameId: 100, selectedGameDetail: detailFor(100) });
      render(<Overlay />);
      expect(screen.getByTestId('myglobe-panel')).toBeInTheDocument();
      expect(legend()).toBeNull();
      expect(card()).toBeInTheDocument();
      expect(slider()).toBeInTheDocument();
      expect(searchBox()).toBeNull();
      expect(screen.queryByTestId('guess-panel')).toBeNull();
    });

    it('insights: panel and card, no search, slider or legend', () => {
      seedStore({ mode: 'insights', selectedGameId: 100, selectedGameDetail: detailFor(100) });
      render(<Overlay />);
      expect(screen.getByTestId('insights-panel')).toBeInTheDocument();
      expect(legend()).toBeNull();
      expect(card()).toBeInTheDocument();
      expect(slider()).toBeNull();
      expect(searchBox()).toBeNull();
      expect(screen.queryByText(/Cover art via/)).toBeNull();
    });

    it('insights and myglobe hide the legend while no game is open', () => {
      seedStore({ mode: 'insights' });
      const { unmount } = render(<Overlay />);
      expect(legend()).toBeNull();
      unmount();
      seedStore({ mode: 'myglobe' });
      render(<Overlay />);
      expect(legend()).toBeNull();
    });

    it('explore panels return when switching back', async () => {
      seedStore({ mode: 'insights' });
      const user = userEvent.setup();
      render(<Overlay />);
      await user.click(screen.getByRole('button', { name: 'Explore' }));
      expect(searchBox()).toBeInTheDocument();
      expect(slider()).toBeInTheDocument();
      expect(screen.queryByTestId('insights-panel')).toBeNull();
    });
  });

  describe('between 760 and 1100 px', () => {
    it('shows only the most recently opened side panel and a tab for the other', async () => {
      stubWidth(true);
      seedStore({ selectedPlace: { level: 'country', key: 'JP' } });
      const user = userEvent.setup();
      render(<Overlay />);
      expect(place()).toBeInTheDocument();
      act(() => {
        useStore.setState({ selectedGameId: 100, selectedGameDetail: detailFor(100) });
      });
      expect(card()).toBeInTheDocument();
      expect(place()).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Show place panel' }));
      expect(place()).toBeInTheDocument();
      expect(card()).toBeNull();
      expect(screen.getByRole('button', { name: 'Show game panel' })).toBeInTheDocument();
    });

    it('opening a place panel after a game brings the place forward', () => {
      stubWidth(true);
      seedStore({ selectedGameId: 100, selectedGameDetail: detailFor(100) });
      render(<Overlay />);
      expect(card()).toBeInTheDocument();
      act(() => {
        useStore.setState({ selectedPlace: { level: 'country', key: 'JP' } });
      });
      expect(place()).toBeInTheDocument();
      expect(card()).toBeNull();
    });

    it('does not collapse when only one panel is open', () => {
      stubWidth(true);
      seedStore({ selectedGameId: 100, selectedGameDetail: detailFor(100) });
      render(<Overlay />);
      expect(screen.queryByRole('button', { name: /^Show / })).toBeNull();
    });

    it('collapses the mode panel when a game opens in my globe mode', () => {
      stubWidth(true);
      seedStore({ mode: 'myglobe', selectedGameId: 100, selectedGameDetail: detailFor(100) });
      render(<Overlay />);
      expect(card()).toBeInTheDocument();
      expect(screen.queryByTestId('myglobe-panel')).toBeNull();
      expect(screen.getByRole('button', { name: 'Show my globe panel' })).toBeInTheDocument();
    });

    it('shows both panels outside that range', () => {
      const w = stubWidth(true);
      seedStore({ selectedPlace: { level: 'country', key: 'JP' }, selectedGameId: 100, selectedGameDetail: detailFor(100) });
      render(<Overlay />);
      expect(place()).toBeNull();
      w.set(false);
      expect(place()).toBeInTheDocument();
      expect(card()).toBeInTheDocument();
    });
  });
});
