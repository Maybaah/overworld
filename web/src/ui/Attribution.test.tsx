import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { meta, seedStore } from './testUtils';
import { useStore } from '../data/store';
import { Attribution } from './Attribution';

describe('Attribution', () => {
  it('links the data sources and IGDB cover art without a fixture note', () => {
    seedStore();
    render(<Attribution />);
    expect(screen.getByText(/^Data:/)).toHaveTextContent('Data: IGDB · Wikidata · Cover art via IGDB');
    const wikidata = screen.getByRole('link', { name: 'Wikidata' });
    expect(wikidata).toHaveAttribute('href', 'https://www.wikidata.org');
    expect(wikidata).toHaveAttribute('target', '_blank');
    expect(wikidata).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByText(/Sample data/)).toBeNull();
  });

  it('credits the satellite imagery exactly as EOX asks', () => {
    seedStore();
    render(<Attribution />);
    const eox = screen.getByRole('link', {
      name: 'Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)',
    });
    expect(eox).toHaveAttribute('href', 'https://s2maps.eu');
    expect(eox).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('flags sample data', () => {
    seedStore({ meta: { ...meta, fixture: true, attribution: [{ source: 'curated', name: 'Fixture', url: 'https://x.test', licence: 'n/a' }] } });
    render(<Attribution />);
    expect(screen.getByText('Sample data — not real games')).toBeInTheDocument();
    expect(screen.getByText(/Cover art via/)).toBeInTheDocument();
    expect(screen.queryByText(/^Data:/)).toBeNull();
    expect(useStore.getState().meta?.fixture).toBe(true);
  });

  it('renders nothing before data loads', () => {
    seedStore({ meta: null });
    const { container } = render(<Attribution />);
    expect(container).toBeEmptyDOMElement();
  });
});
