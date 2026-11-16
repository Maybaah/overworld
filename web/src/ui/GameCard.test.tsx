import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ROLE_TYPES } from '@shared';
import type { LeadBasis } from '@shared';
import { detailFor, seedStore } from './testUtils';
import { useStore } from '../data/store';
import { LEAD_BASIS_TEXT } from './format';
import { GameCard } from './GameCard';

let selectGame: ReturnType<typeof vi.fn>;
let selectPlace: ReturnType<typeof vi.fn>;

function open(id = 100, basis: LeadBasis = 'igdb_single_developer') {
  seedStore({ selectedGameId: id, selectedGameDetail: detailFor(id, basis) });
  selectGame = vi.fn();
  selectPlace = vi.fn();
  useStore.setState({ selectGame, selectPlace });
}

beforeEach(() => open());

describe('GameCard', () => {
  it('renders nothing without a selected game', () => {
    seedStore();
    const { container } = render(<GameCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows header facts and the cover URL', () => {
    render(<GameCard />);
    expect(screen.getByRole('heading', { name: 'Alpha Quest' })).toBeInTheDocument();
    expect(screen.getByText('1995')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Puzzle')).toBeInTheDocument();
    expect(screen.queryByText('Indie')).toBeNull();
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc123.jpg');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('shows an Indie tag and a placeholder when the cover is null', () => {
    open(101);
    render(<GameCard />);
    expect(screen.getByText('Indie')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('No cover')).toBeInTheDocument();
  });

  it('falls back to the placeholder when the image fails', () => {
    render(<GameCard />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('No cover')).toBeInTheDocument();
  });

  it('shows the lead studio with city, country and location precision', () => {
    render(<GameCard />);
    const lead = screen.getByRole('heading', { name: 'Lead studio' }).parentElement!;
    expect(within(lead).getByRole('button', { name: 'Alpha Studio' })).toBeInTheDocument();
    expect(lead).toHaveTextContent('Tokyo, Japan');
    expect(lead).toHaveTextContent('Location is city-level.');
  });

  it('describes country-level and unknown locations', () => {
    open(103);
    const { unmount } = render(<GameCard />);
    expect(screen.getByText('Location is country-level only.')).toBeInTheDocument();
    expect(screen.getAllByText(/Germany/).length).toBeGreaterThan(0);
    unmount();
    open(104);
    render(<GameCard />);
    expect(screen.getByText('Location is unknown.')).toBeInTheDocument();
  });

  it.each(Object.entries(LEAD_BASIS_TEXT) as [LeadBasis, string][])('explains lead basis %s', (basis, text) => {
    open(100, basis);
    render(<GameCard />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('groups roles in ROLE_TYPES order with labels and counts', () => {
    const { container } = render(<GameCard />);
    const groups = [...container.querySelectorAll('[data-role]')].map((e) => e.getAttribute('data-role'));
    expect(groups).toEqual(ROLE_TYPES.filter((r) => ['lead_developer', 'port', 'publisher', 'qa', 'art', 'audio'].includes(r)));
    const port = container.querySelector('[data-role="port"]') as HTMLElement;
    expect(within(port).getByRole('heading', { name: /Port/ })).toBeInTheDocument();
    expect(within(port).getByRole('button', { name: 'Beta Holdings' })).toBeInTheDocument();
    expect(port).toHaveTextContent('Austin, United States');
    expect(port).toHaveTextContent('Mega Drive · 1997');
  });

  it('says location unknown for companies without one', () => {
    const { container } = render(<GameCard />);
    const art = container.querySelector('[data-role="art"]') as HTMLElement;
    expect(art).toHaveTextContent('Delta Nowhere');
    expect(art).toHaveTextContent('location unknown');
  });

  it('shows no source label on role rows', () => {
    const { container } = render(<GameCard />);
    const port = container.querySelector('[data-role="port"]') as HTMLElement;
    expect(within(port).queryByRole('link', { name: 'MobyGames' })).toBeNull();
    const qa = container.querySelector('[data-role="qa"]') as HTMLElement;
    expect(within(qa).queryByText('Curated')).toBeNull();
  });

  it('lists the game sources at the bottom', () => {
    render(<GameCard />);
    const line = screen.getByText(/^Sources:/);
    expect(within(line).getByRole('link', { name: 'IGDB' })).toHaveAttribute('href', 'https://www.igdb.com/g/1');
    expect(within(line).getByRole('link', { name: 'Wikidata' })).toHaveAttribute('target', '_blank');
  });

  it('dims, but still shows, roles that are filtered out', () => {
    const enabled = new Set(ROLE_TYPES);
    enabled.delete('port');
    enabled.delete('qa');
    useStore.setState({ enabledRoles: enabled });
    const { container } = render(<GameCard />);
    expect(container.querySelector('[data-role="port"]')).toHaveAttribute('data-dimmed', 'true');
    expect(container.querySelector('[data-role="qa"]')).toHaveAttribute('data-dimmed', 'true');
    expect(container.querySelector('[data-role="publisher"]')).toHaveAttribute('data-dimmed', 'false');
    expect(screen.getAllByText('filtered out')).toHaveLength(2);
  });

  it('opens a company when its name is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<GameCard />);
    const pub = container.querySelector('[data-role="publisher"]') as HTMLElement;
    await user.click(within(pub).getByRole('button', { name: 'Beta Holdings' }));
    expect(selectPlace).toHaveBeenCalledWith({ level: 'company', key: 2 });
  });

  it('closes with selectGame(null)', async () => {
    const user = userEvent.setup();
    render(<GameCard />);
    await user.click(screen.getByRole('button', { name: 'Close game' }));
    expect(selectGame).toHaveBeenCalledWith(null);
  });

  it('shows a loading state', () => {
    seedStore({ selectedGameId: 100, selectedGameDetail: null });
    render(<GameCard />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading details');
  });

  it('shows an error with a retry', async () => {
    seedStore({ selectedGameId: 100, selectedGameDetail: null, detailError: 'HTTP 500' });
    const retry = vi.fn();
    useStore.setState({ selectGame: retry });
    const user = userEvent.setup();
    render(<GameCard />);
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP 500');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledWith(100);
  });

  it('says country only on rows whose company has a country-level location', () => {
    const { container } = render(<GameCard />);
    const qa = container.querySelector('[data-role="qa"]') as HTMLElement;
    expect(qa).toHaveTextContent('country only');
    const port = container.querySelector('[data-role="port"]') as HTMLElement;
    expect(port).not.toHaveTextContent('country only');
    const art = container.querySelector('[data-role="art"]') as HTMLElement;
    expect(art).not.toHaveTextContent('country only');
  });
});
