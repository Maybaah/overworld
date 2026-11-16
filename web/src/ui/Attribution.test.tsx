import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { meta, seedStore } from './testUtils';
import { Attribution } from './Attribution';

describe('Attribution', () => {
  it('shows nothing for real data', () => {
    seedStore();
    const { container } = render(<Attribution />);
    expect(container).toBeEmptyDOMElement();
  });

  it('flags sample data', () => {
    seedStore({ meta: { ...meta, fixture: true } });
    render(<Attribution />);
    expect(screen.getByText('Sample data — not real games')).toBeInTheDocument();
    expect(screen.queryByText(/^Data:/)).toBeNull();
  });

  it('renders nothing before data loads', () => {
    seedStore({ meta: null });
    const { container } = render(<Attribution />);
    expect(container).toBeEmptyDOMElement();
  });
});
