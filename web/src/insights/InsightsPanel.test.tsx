import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FlowsFile, StatsFile } from '@shared';
import { seedStore } from '../ui/testUtils';
import { useStore } from '../data/store';

const mocks = vi.hoisted(() => ({
  loadStats: vi.fn(),
  loadFlows: vi.fn(),
}));

vi.mock('../data/loader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/loader')>()),
  loadStats: mocks.loadStats,
  loadFlows: mocks.loadFlows,
}));

import { InsightsPanel } from './InsightsPanel';

const stats: StatsFile = {
  countries: [
    { code: 'US', region: 'Americas', subregion: '', population: 330_000_000, studios: 9, gamesLed: 60, gamesPerMillion: 0.18, genres: {} },
    { code: 'JP', region: 'Asia', subregion: '', population: 120_000_000, studios: 9, gamesLed: 30, gamesPerMillion: 0.25, genres: {} },
    { code: 'FR', region: 'Europe', subregion: '', population: null, studios: 9, gamesLed: 20, gamesPerMillion: null, genres: {} },
    { code: 'DE', region: 'Europe', subregion: '', population: 80_000_000, studios: 9, gamesLed: 8, gamesPerMillion: 0.1, genres: {} },
    { code: 'SE', region: 'Europe', subregion: '', population: 10_000_000, studios: 9, gamesLed: 6, gamesPerMillion: 0.6, genres: {} },
    { code: 'NO', region: 'Europe', subregion: '', population: 5_000_000, studios: 9, gamesLed: 4, gamesPerMillion: 0.8, genres: {} },
  ],
  regions: [
    { region: 'Asia', gamesLed: 30, genres: { '1': 15, '2': 9, '3': 8, '4': 7, '5': 6, '6': 5, '7': 4, '8': 1 } },
    { region: 'Americas', gamesLed: 60, genres: { '1': 6, '2': 30 } },
    { region: 'Europe', gamesLed: 34, genres: { '1': 17, '2': 1 } },
  ],
  years: [
    { year: 1970, total: 2, indie: 0, majorPublisher: 1 },
    { year: 1971, total: 4, indie: 1, majorPublisher: 2 },
    { year: 1973, total: 10, indie: 5, majorPublisher: 1 },
  ],
  majorPublishers: [
    { companyId: 1, name: 'Mega Publishing', games: 90 },
    { companyId: 2, name: 'Big Games Inc', games: 80 },
  ],
  populationSource: { name: 'Wikidata', url: 'https://www.wikidata.org', licence: 'CC0', retrieved: '2026-11-16' },
};

const flows: FlowsFile = {
  flows: [
    { role: 'publisher', from: 'JP', to: 'US', games: 100, examples: [100, 101] },
    { role: 'publisher', from: 'JP', to: 'JP', games: 300, examples: [102] },
    { role: 'port', from: 'US', to: 'DE', games: 30, examples: [103] },
    { role: 'support', from: 'DE', to: 'JP', games: 5, examples: [] },
    { role: 'art', from: 'JP', to: 'DE', games: 3, examples: [] },
  ],
};

beforeEach(() => {
  seedStore({ mode: 'insights' });
  useStore.setState({ countryShade: null, extraArcs: [], extraMarkers: [], cameraRequest: null });
  mocks.loadStats.mockReset().mockResolvedValue(stats);
  mocks.loadFlows.mockReset().mockResolvedValue(flows);
});

async function openTab(name: RegExp | string) {
  fireEvent.click(screen.getByRole('tab', { name }));
}

describe('tabs', () => {
  it('has tab semantics and moves with the arrow keys', async () => {
    render(<InsightsPanel />);
    const tabs = screen.getAllByRole('tab');
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabs[0]!.id);

    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveFocus();
    fireEvent.keyDown(tabs[1]!, { key: 'End' });
    expect(tabs[3]).toHaveFocus();
    fireEvent.keyDown(tabs[3]!, { key: 'ArrowRight' });
    expect(tabs[0]).toHaveFocus();
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' });
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tabs[3]!, { key: 'Home' });
    expect(tabs[0]).toHaveFocus();
    await screen.findByRole('list', { name: /per million/i });
  });
});

describe('per capita tab', () => {
  it('shows loading, then ranked rows for countries with at least five games', async () => {
    render(<InsightsPanel />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    const list = await screen.findByRole('list', { name: /per million/i });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Sweden'),
      expect.stringContaining('Japan'),
      expect.stringContaining('United States'),
      expect.stringContaining('Germany'),
    ]);
    expect(items[0]).toHaveTextContent('0.6');
    expect(items[0]).toHaveTextContent('6 games led');
    expect(items[0]).toHaveTextContent('10.0 million people');
    expect(screen.getByText(/Population: Wikidata, retrieved 2026-11-16/)).toBeInTheDocument();
    expect(screen.queryByText('Norway')).not.toBeInTheDocument();
  });

  it('shades the globe with values in 0..1 and re-sorts on the toggle', async () => {
    render(<InsightsPanel />);
    await screen.findByRole('list', { name: /per million/i });
    const shade = useStore.getState().countryShade!;
    expect(Object.keys(shade).sort()).toEqual(['DE', 'JP', 'SE', 'US']);
    for (const v of Object.values(shade)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(shade.SE).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Total games' }));
    const list = screen.getByRole('list', { name: /games led, by country/i });
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('United States');
    const total = useStore.getState().countryShade!;
    expect(Object.keys(total).sort()).toEqual(['DE', 'FR', 'JP', 'SE', 'US']);
    expect(total.US).toBe(1);
  });

  it('selects the country when a row is clicked', async () => {
    render(<InsightsPanel />);
    const list = await screen.findByRole('list', { name: /per million/i });
    fireEvent.click(within(list).getByRole('button', { name: /Japan/ }));
    expect(useStore.getState().selectedPlace).toEqual({ level: 'country', key: 'JP' });
  });

  it('limits to 25 rows until Show all', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      code: `A${i}`,
      region: 'R',
      subregion: '',
      population: 1_000_000,
      studios: 1,
      gamesLed: 10 + i,
      gamesPerMillion: 10 + i,
      genres: {},
    }));
    mocks.loadStats.mockResolvedValue({ ...stats, countries: many });
    render(<InsightsPanel />);
    const list = await screen.findByRole('list', { name: /per million/i });
    expect(within(list).getAllByRole('listitem')).toHaveLength(25);
    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    expect(within(screen.getByRole('list', { name: /per million/i })).getAllByRole('listitem')).toHaveLength(30);
  });

  it('clears the shade on tab change and on unmount', async () => {
    const { unmount } = render(<InsightsPanel />);
    await screen.findByRole('list', { name: /per million/i });
    expect(useStore.getState().countryShade).not.toBeNull();
    await openTab('Genres by region');
    expect(useStore.getState().countryShade).toBeNull();
    await openTab('Per capita');
    await waitFor(() => expect(useStore.getState().countryShade).not.toBeNull());
    unmount();
    expect(useStore.getState().countryShade).toBeNull();
  });

  it('shows an error with a retry', async () => {
    mocks.loadStats.mockRejectedValueOnce(new Error('HTTP 404'));
    render(<InsightsPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 404');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('list', { name: /per million/i });
  });
});

describe('genres by region tab', () => {
  it('shows the top six genres of each region as shares, largest region first', async () => {
    render(<InsightsPanel />);
    await openTab('Genres by region');
    const asia = await screen.findByLabelText('Asia: top genres');
    const rows = within(asia).getAllByRole('listitem');
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveTextContent('Action');
    expect(rows[0]).toHaveTextContent('50%');
    expect(rows[1]).toHaveTextContent('Puzzle');
    expect(rows[1]).toHaveTextContent('30%');
    expect(rows[2]).toHaveTextContent('Genre 3');
    expect(within(asia).getByText('2 more genres not shown.')).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(headings[0]).toContain('Americas');
  });

  it('switches to a single genre across regions', async () => {
    render(<InsightsPanel />);
    await openTab('Genres by region');
    await screen.findByLabelText('Asia: top genres');
    fireEvent.click(screen.getByRole('button', { name: 'One genre everywhere' }));
    fireEvent.change(screen.getByLabelText('Genre'), { target: { value: '2' } });
    const list = screen.getByRole('list', { name: /Puzzle/ });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Americas'),
      expect.stringContaining('Europe'),
      expect.stringContaining('Asia'),
    ]);
    expect(rows[0]).toHaveTextContent('50%');
    expect(rows[1]).toHaveTextContent('2.9%');
    expect(useStore.getState().countryShade).toBeNull();
  });
});

describe('indie and major publishers tab', () => {
  it('draws the chart and shows a readout that follows the keyboard', async () => {
    render(<InsightsPanel />);
    await openTab('Indie and major');
    const chart = await screen.findByRole('slider', { name: /Games released per year, 1970 to 1973/ });
    expect(chart).toHaveAttribute('aria-valuenow', '1973');
    expect(chart.textContent).toContain('All games');
    chart.focus();
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(chart).toHaveAttribute('aria-valuenow', '1971');
    expect(chart.getAttribute('aria-valuetext')).toBe('1971: All games 4, Indie 1, Major 2');
  });

  it('hides the all series in share view', async () => {
    render(<InsightsPanel />);
    await openTab('Indie and major');
    await screen.findByRole('slider');
    fireEvent.click(screen.getByRole('button', { name: 'Share of all games' }));
    const chart = screen.getByRole('slider', { name: /Share of all games/ });
    expect(chart.textContent).not.toContain('All games');
    expect(chart.getAttribute('aria-valuetext')).toBe('1973: Indie 50%, Major 10%');
  });

  it('offers the data as a table', async () => {
    render(<InsightsPanel />);
    await openTab('Indie and major');
    await screen.findByRole('slider');
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(5);
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Year', 'All games', 'Indie', 'Major']);
    expect(rows[2]).toHaveTextContent('1971');
    expect(rows[2]).toHaveTextContent('4');
    fireEvent.click(screen.getByRole('button', { name: 'Share of all games' }));
    expect(within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Year', 'Indie', 'Major']);
    expect(within(screen.getByRole('table')).getAllByRole('row')[4]).toHaveTextContent('50%');
  });

  it('defines major publisher and lists them in a collapsible', async () => {
    render(<InsightsPanel />);
    await openTab('Indie and major');
    await screen.findByRole('slider');
    expect(screen.getByText(/No source labels games as AAA/)).toBeInTheDocument();
    const summary = screen.getByText('The 2 major publishers');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Mega Publishing')).toBeInTheDocument();
  });
});

describe('where the work goes tab', () => {
  it('lists outside work between countries by default and draws arcs', async () => {
    render(<InsightsPanel />);
    await openTab('Where the work goes');
    const list = await screen.findByRole('list', { name: /Largest flows/ });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Japan → United States'),
      expect.stringContaining('United States → Germany'),
      expect.stringContaining('Germany → Japan'),
      expect.stringContaining('Japan → Germany'),
    ]);
    expect(rows[0]).toHaveTextContent('100');
    await waitFor(() => expect(useStore.getState().extraArcs).toHaveLength(4));
    const s = useStore.getState();
    expect(s.extraArcs[0]).toMatchObject({ startLat: 35.68, startLng: 139.69, color: '#A0A7B4' });
    expect(s.extraArcs[0]!.width).toBeGreaterThan(s.extraArcs[3]!.width!);
    expect(s.cameraRequest).not.toBeNull();
  });

  it('colours arcs by role and filters by role', async () => {
    render(<InsightsPanel />);
    await openTab('Where the work goes');
    await screen.findByRole('list', { name: /Largest flows/ });
    fireEvent.click(screen.getByRole('button', { name: /^Port/ }));
    const rows = within(screen.getByRole('list', { name: /Largest flows/ })).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('United States → Germany');
    await waitFor(() => expect(useStore.getState().extraArcs).toHaveLength(1));
    expect(useStore.getState().extraArcs[0]!.color).toBe('#56B4E9');
  });

  it('disables roles with no links and shows their counts', async () => {
    render(<InsightsPanel />);
    await openTab('Where the work goes');
    await screen.findByRole('list', { name: /Largest flows/ });
    expect(screen.getByRole('button', { name: /^Localization/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^QA \/ LQA/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Co-development/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Publisher 400/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^All outside work 438/ })).toBeEnabled();
    expect(screen.getByText(/No links yet for Co-development, Localization, QA \/ LQA\./)).toBeInTheDocument();
  });

  it('shows the low-data note under 25 links and not at or above', async () => {
    render(<InsightsPanel />);
    await openTab('Where the work goes');
    await screen.findByRole('list', { name: /Largest flows/ });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Art \/ audio/ }));
    expect(screen.getByRole('note')).toHaveTextContent('Only 3 links in the data. The sources used so far rarely record this kind of work.');
    fireEvent.click(screen.getByRole('button', { name: /^Other support/ }));
    expect(screen.getByRole('note')).toHaveTextContent('Only 5 links');
    fireEvent.click(screen.getByRole('button', { name: /^Port/ }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('includes same-country work when switched on', async () => {
    render(<InsightsPanel />);
    await openTab('Where the work goes');
    await screen.findByRole('list', { name: /Largest flows/ });
    fireEvent.click(screen.getByRole('switch', { name: /same country/ }));
    const rows = within(screen.getByRole('list', { name: /Largest flows/ })).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Japan → Japan');
    await waitFor(() => expect(useStore.getState().extraMarkers).toHaveLength(1));
  });

  it('opens example games and selects one', async () => {
    const selectGame = vi.fn().mockResolvedValue(undefined);
    useStore.setState({ selectGame });
    render(<InsightsPanel />);
    await openTab('Where the work goes');
    const list = await screen.findByRole('list', { name: /Largest flows/ });
    fireEvent.click(within(list).getByRole('button', { name: /Japan → United States/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Alpha Quest' }));
    expect(selectGame).toHaveBeenCalledWith(100);
    expect(screen.getByRole('button', { name: 'Beta Blast' })).toBeInTheDocument();
  });

  it('clears the extras on tab change and on unmount', async () => {
    const { unmount } = render(<InsightsPanel />);
    await openTab('Where the work goes');
    await waitFor(() => expect(useStore.getState().extraArcs.length).toBeGreaterThan(0));
    await openTab('Per capita');
    expect(useStore.getState().extraArcs).toEqual([]);
    await openTab('Where the work goes');
    await waitFor(() => expect(useStore.getState().extraArcs.length).toBeGreaterThan(0));
    unmount();
    expect(useStore.getState().extraArcs).toEqual([]);
    expect(useStore.getState().extraMarkers).toEqual([]);
  });

  it('shows an error state', async () => {
    mocks.loadFlows.mockRejectedValue(new Error('boom'));
    render(<InsightsPanel />);
    await openTab('Where the work goes');
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    await act(async () => {});
  });
});
