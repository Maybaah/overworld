import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { navBus, type NavCommand } from '../globe/controls';
import { useStore } from '../data/store';
import { NavButtons } from './NavButtons';

describe('NavButtons', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

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

  it('turns zoom detail on and off and remembers it', () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v) });
    useStore.setState({ zoomDetail: false });
    render(<NavButtons />);
    const btn = screen.getByRole('button', { name: 'More games when zoomed in' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(useStore.getState().zoomDetail).toBe(true);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('overworld.zoomDetail')).toBe('1');
    fireEvent.click(btn);
    expect(useStore.getState().zoomDetail).toBe(false);
    expect(localStorage.getItem('overworld.zoomDetail')).toBe('0');
  });
});
