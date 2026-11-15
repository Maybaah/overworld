import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ROLE_GROUPS } from '../data/roles';
import { detailFor, seedStore } from './testUtils';
import { useStore } from '../data/store';
import { Legend } from './Legend';

beforeEach(() => seedStore());

describe('Legend', () => {
  it('has one toggle button per role group, all pressed by default', () => {
    render(<Legend />);
    for (const g of ROLE_GROUPS) {
      expect(screen.getByRole('button', { name: new RegExp(g.label) })).toHaveAttribute('aria-pressed', 'true');
    }
  });

  it('toggles a role and shows the off state', async () => {
    const user = userEvent.setup();
    render(<Legend />);
    const port = screen.getByRole('button', { name: 'Port' });
    await user.click(port);
    expect(useStore.getState().enabledRoles.has('port')).toBe(false);
    expect(port).toHaveAttribute('aria-pressed', 'false');
    expect(port).toHaveAttribute('data-off', 'true');
    await user.click(port);
    expect(useStore.getState().enabledRoles.has('port')).toBe(true);
    expect(port).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles art and audio together', async () => {
    const user = userEvent.setup();
    render(<Legend />);
    const row = screen.getByRole('button', { name: /Art \/ audio/ });
    await user.click(row);
    const { enabledRoles } = useStore.getState();
    expect(enabledRoles.has('art')).toBe(false);
    expect(enabledRoles.has('audio')).toBe(false);
    await user.click(row);
    expect(useStore.getState().enabledRoles.has('art')).toBe(true);
    expect(useStore.getState().enabledRoles.has('audio')).toBe(true);
  });

  it('keeps the lead developer row on', async () => {
    const user = userEvent.setup();
    render(<Legend />);
    const lead = screen.getByRole('button', { name: /Lead developer/ });
    expect(lead).toHaveAttribute('aria-disabled', 'true');
    await user.click(lead);
    expect(useStore.getState().enabledRoles.has('lead_developer')).toBe(true);
    expect(lead).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows no counts without a game and counts companies per role with one', () => {
    const { rerender } = render(<Legend />);
    expect(screen.getByRole('button', { name: 'Publisher' })).toHaveTextContent(/^Publisher$/);
    useStore.setState({ selectedGameId: 100, selectedGameDetail: detailFor(100) });
    rerender(<Legend />);
    expect(screen.getByRole('button', { name: /Publisher/ })).toHaveTextContent('Publisher1');
    expect(screen.getByRole('button', { name: /Art \/ audio/ })).toHaveTextContent('Art / audio2');
    expect(screen.getByRole('button', { name: /Co-development/ })).toHaveTextContent('Co-development0');
  });

  it('has a collapse toggle for small screens', async () => {
    const user = userEvent.setup();
    render(<Legend />);
    const toggle = screen.getByRole('button', { name: 'Roles' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});
