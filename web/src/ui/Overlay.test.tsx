import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { detailFor, seedStore } from './testUtils';
import { Overlay } from './Overlay';

describe('Overlay', () => {
  it('renders the wordmark and the always-on panels', () => {
    seedStore();
    render(<Overlay />);
    expect(screen.getByText('Overworld')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Search games' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Role filters' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Year' })).toBeInTheDocument();
    expect(screen.getByText(/Cover art via/)).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('shows the game card and place panel together on desktop', () => {
    seedStore({
      selectedGameId: 100,
      selectedGameDetail: detailFor(100),
      selectedPlace: { level: 'country', key: 'JP' },
    });
    const { container } = render(<Overlay />);
    expect(screen.getByRole('complementary', { name: 'Game: Alpha Quest' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Place: Japan' })).toBeInTheDocument();
    expect(container.querySelector('.ow-root')).toHaveAttribute('data-front', 'place');
  });

  it('has an accessible name on every button', () => {
    seedStore({ selectedGameId: 100, selectedGameDetail: detailFor(100), selectedPlace: { level: 'country', key: 'JP' } });
    render(<Overlay />);
    for (const b of screen.getAllByRole('button')) {
      expect(b).toHaveAccessibleName();
    }
  });

  it('shows a load error', () => {
    seedStore({ status: 'error', error: 'offline', indexes: null, timeline: null, meta: null });
    render(<Overlay />);
    expect(screen.getByRole('alert')).toHaveTextContent('offline');
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
