import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { navBus, type NavCommand } from '../globe/controls';
import { NavButtons } from './NavButtons';

describe('NavButtons', () => {
  it('sends zoom in, zoom out and whole-globe commands', () => {
    const got: NavCommand[] = [];
    const on = (e: Event) => got.push((e as CustomEvent<NavCommand>).detail);
    navBus.addEventListener('nav', on);
    render(<NavButtons />);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Whole globe' }));
    navBus.removeEventListener('nav', on);
    expect(got.map((c) => c.kind)).toEqual(['zoom', 'zoom', 'home']);
    expect((got[0] as { amount: number }).amount).toBeLessThan(0);
    expect((got[1] as { amount: number }).amount).toBeGreaterThan(0);
  });
});
