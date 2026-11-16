import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { seedStore } from './testUtils';
import { useStore } from '../data/store';
import { ModeNav } from './ModeNav';

beforeEach(() => seedStore());

describe('ModeNav', () => {
  it('is a labelled group of three toggle buttons with Explore pressed', () => {
    render(<ModeNav />);
    const group = screen.getByRole('group', { name: 'Mode' });
    const buttons = screen.getAllByRole('button');
    expect(group).toContainElement(buttons[0]!);
    expect(buttons.map((b) => b.textContent)).toEqual(['Explore', 'My globe', 'Insights']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
  });

  it('lists Guess only while guess mode is open', () => {
    useStore.setState({ mode: 'guess' });
    render(<ModeNav />);
    expect(screen.getByRole('button', { name: 'Guess' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking sets the mode', async () => {
    const user = userEvent.setup();
    render(<ModeNav />);
    await user.click(screen.getByRole('button', { name: 'Insights' }));
    expect(useStore.getState().mode).toBe('insights');
    expect(screen.getByRole('button', { name: 'Insights' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('arrow keys, Home and End move focus with wrapping, Enter selects', async () => {
    const user = userEvent.setup();
    render(<ModeNav />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Explore' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'My globe' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('button', { name: 'Insights' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Explore' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('button', { name: 'Insights' })).toHaveFocus();
    await user.keyboard('{Home}{ArrowRight}');
    expect(useStore.getState().mode).toBe('explore');
    await user.keyboard('{Enter}');
    expect(useStore.getState().mode).toBe('myglobe');
  });

  it('only the pressed button is in the tab order', () => {
    render(<ModeNav />);
    const tabbable = screen.getAllByRole('button').filter((b) => b.tabIndex === 0);
    expect(tabbable.map((b) => b.textContent)).toEqual(['Explore']);
  });
});
