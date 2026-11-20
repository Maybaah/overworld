import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SourceLink } from './parts';

describe('SourceLink', () => {
  afterEach(cleanup);

  it('links web addresses', () => {
    render(<SourceLink source={{ source: 'igdb', id: '1', url: 'https://www.igdb.com/games/x' }} label="IGDB" />);
    expect(screen.getByRole('link', { name: 'IGDB' })).toHaveAttribute('href', 'https://www.igdb.com/games/x');
  });

  it('shows other schemes as plain text', () => {
    render(<SourceLink source={{ source: 'igdb', id: '1', url: 'javascript:alert(1)' }} label="IGDB" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('IGDB')).toBeInTheDocument();
  });
});
