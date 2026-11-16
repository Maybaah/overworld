import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { seedStore } from './testUtils';
import { useStore } from '../data/store';

vi.mock('../data/loader', async (orig) => ({
  ...(await orig<typeof import('../data/loader')>()),
  loadCompanyGames: vi.fn(),
}));

import { loadCompanyGames } from '../data/loader';
import { PlacePanel } from './PlacePanel';

let selectGame: ReturnType<typeof vi.fn>;
let selectPlace: ReturnType<typeof vi.fn>;

beforeEach(() => {
  seedStore();
  selectGame = vi.fn();
  selectPlace = vi.fn();
  useStore.setState({ selectGame, selectPlace });
  vi.mocked(loadCompanyGames).mockResolvedValue(
    new Map([
      [
        1,
        [
          { gameId: 100, role: 'lead_developer' },
          { gameId: 101, role: 'publisher' },
          { gameId: 101, role: 'localization' },
          { gameId: 103, role: 'qa' },
        ],
      ],
    ]),
  );
});

function showPlace(level: 'country' | 'city' | 'company', key: string | number) {
  useStore.setState({ selectedPlace: { level, key } });
}

describe('PlacePanel', () => {
  it('renders nothing without a selection', () => {
    const { container } = render(<PlacePanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a country with counts at the current year, cities and studios', async () => {
    showPlace('country', 'JP');
    useStore.setState({ year: 1995 });
    const user = userEvent.setup();
    render(<PlacePanel />);
    expect(screen.getByRole('heading', { name: 'Japan' })).toBeInTheDocument();
    const stats = screen.getByText('Studios').closest('dl')!;
    expect(stats).toHaveTextContent('Studios2');
    expect(stats).toHaveTextContent('Games led by 19951');
    const cities = screen.getByRole('list', { name: 'Cities' });
    await user.click(within(cities).getByRole('button', { name: 'Tokyo' }));
    expect(selectPlace).toHaveBeenCalledWith({ level: 'city', key: 'JP|Tokyo' });
    const studios = screen.getByRole('list', { name: 'Studios' });
    await user.click(within(studios).getByRole('button', { name: 'Alpha Studio' }));
    expect(selectPlace).toHaveBeenCalledWith({ level: 'company', key: 1 });
  });

  it('sorts studios by games led up to the year', () => {
    showPlace('country', 'JP');
    render(<PlacePanel />);
    const names = within(screen.getByRole('list', { name: 'Studios' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual(['Epsilon Works', 'Alpha Studio']);
  });

  it('shows a city with its country and studios', () => {
    showPlace('city', 'JP|Tokyo');
    render(<PlacePanel />);
    expect(screen.getByRole('heading', { name: 'Tokyo' })).toBeInTheDocument();
    expect(screen.getByText('Japan')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Studios' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows a company with parent, counts, led games and other work', async () => {
    showPlace('company', 1);
    const user = userEvent.setup();
    render(<PlacePanel />);
    expect(screen.getByRole('heading', { name: 'Alpha Studio' })).toBeInTheDocument();
    expect(screen.getByText('Tokyo, Japan')).toBeInTheDocument();
    expect(screen.getByText('Founded').parentElement).toHaveTextContent('1990');
    expect(screen.getByText('Games led', { selector: 'dt' }).closest('div')).toHaveTextContent('2');

    await user.click(screen.getByRole('button', { name: 'Beta Holdings' }));
    expect(selectPlace).toHaveBeenCalledWith({ level: 'company', key: 2 });

    const led = screen.getByRole('list', { name: 'Games led' });
    expect(within(led).getAllByRole('button').map((b) => b.textContent)).toEqual(['Alpha Quest', 'Alpha Two']);
    await user.click(within(led).getByRole('button', { name: 'Alpha Two' }));
    expect(selectGame).toHaveBeenCalledWith(102);

    const other = await screen.findByRole('list', { name: 'Other work' });
    const rows = within(other).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Beta Blast');
    expect(rows[0]).toHaveTextContent('Publisher, Localization');
    expect(rows[1]).toHaveTextContent('Gamma Game');
    expect(rows[1]).toHaveTextContent('QA / LQA');
    await user.click(within(rows[1]!).getByRole('button', { name: 'Gamma Game' }));
    expect(selectGame).toHaveBeenCalledWith(103);
  });

  it('says so when a company has no other work', async () => {
    vi.mocked(loadCompanyGames).mockResolvedValue(new Map());
    showPlace('company', 5);
    render(<PlacePanel />);
    expect(await screen.findByText('No other roles recorded.')).toBeInTheDocument();
  });

  it('reports a failed other-work load and retries', async () => {
    vi.mocked(loadCompanyGames).mockRejectedValueOnce(new Error('HTTP 404'));
    showPlace('company', 1);
    const user = userEvent.setup();
    render(<PlacePanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 404');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Other work' })).toBeInTheDocument();
  });

  it('shows 50 rows and a Show more button for long lists', async () => {
    showPlace('company', 5);
    const user = userEvent.setup();
    render(<PlacePanel />);
    const led = screen.getByRole('list', { name: 'Games led' });
    expect(within(led).getAllByRole('listitem')).toHaveLength(50);
    await user.click(screen.getByRole('button', { name: /Show more/ }));
    expect(within(screen.getByRole('list', { name: 'Games led' })).getAllByRole('listitem')).toHaveLength(60);
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
  });

  it('does not show the button for short lists', () => {
    showPlace('company', 1);
    render(<PlacePanel />);
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
  });

  it('closes with selectPlace(null)', async () => {
    showPlace('company', 1);
    const user = userEvent.setup();
    render(<PlacePanel />);
    await user.click(screen.getByRole('button', { name: 'Close place' }));
    expect(selectPlace).toHaveBeenCalledWith(null);
  });

  it('links the location source for a company', async () => {
    showPlace('company', 1);
    render(<PlacePanel />);
    const link = screen.getByRole('link', { name: 'Wikidata' });
    expect(link).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q9');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await screen.findByRole('list', { name: 'Other work' });
  });

  it('omits the location line when there is no source', async () => {
    showPlace('company', 2);
    render(<PlacePanel />);
    expect(screen.queryByText(/Location from/)).toBeNull();
    await screen.findByText('No other roles recorded.');
  });
});
