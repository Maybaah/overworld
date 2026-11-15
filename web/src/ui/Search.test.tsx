import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { seedStore } from './testUtils';
import { useStore } from '../data/store';
import { Search } from './Search';

let selectGame: ReturnType<typeof vi.fn>;

beforeEach(() => {
  seedStore();
  selectGame = vi.fn();
  useStore.setState({ selectGame });
});

describe('Search', () => {
  it('has combobox semantics and starts collapsed', () => {
    render(<Search />);
    const box = screen.getByRole('combobox', { name: 'Search games' });
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(box).toHaveAttribute('aria-autocomplete', 'list');
    expect(box).toHaveAttribute('aria-controls', screen.getByRole('listbox', { hidden: true }).id);
  });

  it('lists results with year, studio and country', async () => {
    const user = userEvent.setup();
    render(<Search />);
    await user.type(screen.getByRole('combobox'), 'alpha');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('Alpha Quest'),
      expect.stringContaining('Alpha Two'),
    ]);
    expect(options[0]).toHaveTextContent('1995');
    expect(options[0]).toHaveTextContent('Alpha Studio, Japan');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
  });

  it('caps the dropdown at 8 results', async () => {
    const user = userEvent.setup();
    render(<Search />);
    await user.type(screen.getByRole('combobox'), 'epsilon');
    expect(screen.getAllByRole('option')).toHaveLength(8);
  });

  it('moves with arrow keys, wraps, and selects with Enter', async () => {
    const user = userEvent.setup();
    render(<Search />);
    const box = screen.getByRole('combobox');
    await user.type(box, 'alpha');
    const [first, second] = screen.getAllByRole('option');
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(box).toHaveAttribute('aria-activedescendant', first!.id);
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(box).toHaveAttribute('aria-activedescendant', second!.id);
    await user.keyboard('{ArrowDown}');
    expect(first).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowUp}');
    expect(second).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    expect(selectGame).toHaveBeenCalledWith(102);
    expect(box).toHaveValue('');
    expect(box).toHaveAttribute('aria-expanded', 'false');
  });

  it('selects by clicking a result', async () => {
    const user = userEvent.setup();
    render(<Search />);
    await user.type(screen.getByRole('combobox'), 'beta');
    await user.click(screen.getByRole('option', { name: /Beta Blast/ }));
    expect(selectGame).toHaveBeenCalledWith(101);
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('Escape closes the list first, then clears the text', async () => {
    const user = userEvent.setup();
    render(<Search />);
    const box = screen.getByRole('combobox');
    await user.type(box, 'alpha');
    await user.keyboard('{Escape}');
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(box).toHaveValue('alpha');
    await user.keyboard('{Escape}');
    expect(box).toHaveValue('');
    expect(selectGame).not.toHaveBeenCalled();
  });

  it('shows a message when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Search />);
    await user.type(screen.getByRole('combobox'), 'zzzz');
    expect(screen.getByText('No games found')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(selectGame).not.toHaveBeenCalled();
  });
});
