import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Admin } from './Admin';
import { parseStats } from './api';
import { niceMax } from './charts';
import { mockStats } from './fixture';

afterEach(() => {
  history.replaceState(null, '', '/');
});

describe('parseStats', () => {
  it('accepts the RPC shape and drops malformed parts', () => {
    const s = parseStats({
      range: '24h',
      generatedAt: 10,
      from: 5,
      bucket: 'hour',
      totals: { session: 3, bad: 'x' },
      series: [[1, 2, 3, 4, 5, 6], 'nope'],
      top: { 'game_open.title': [['Tetris', 2], [3, 4]], broken: 'x' },
      recentErrors: [{ t: 1, msg: 'boom' }, 4],
      rolledThrough: null,
    });
    expect(s).toMatchObject({
      range: '24h',
      totals: { session: 3, bad: 0 },
      series: [[1, 2, 3, 4, 5, 6]],
      top: { 'game_open.title': [['Tetris', 2]] },
      recentErrors: [{ t: 1, msg: 'boom', where: undefined }],
      rolledThrough: null,
      maintAt: null,
    });
    expect(parseStats({ range: 'year' })).toBeNull();
    expect(parseStats(null)).toBeNull();
  });
});

describe('fixture', () => {
  it('has one bucket per hour or day of the range', () => {
    const now = Date.UTC(2026, 10, 19, 15, 30);
    expect(mockStats('24h', now).series).toHaveLength(24);
    expect(mockStats('7d', now).series).toHaveLength(6 * 24 + 16);
    expect(mockStats('30d', now).series).toHaveLength(30);
    expect(mockStats('30d', now).bucket).toBe('day');
  });
});

describe('niceMax', () => {
  it('rounds up to 1, 2 or 5 times a power of ten', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(130)).toBe(200);
    expect(niceMax(4100)).toBe(5000);
  });
});

describe('Admin', () => {
  it('explains how to configure a build without Supabase', () => {
    render(<Admin />);
    expect(screen.getByRole('heading', { name: 'No backend configured' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open with sample data' })).toHaveAttribute('href', '?mock=1');
  });

  it('shows sample stats and switches range and measure', async () => {
    history.replaceState(null, '', '/admin.html?mock=1');
    const user = userEvent.setup();
    render(<Admin />);
    expect(screen.getByText('Sample data. Nothing here is real.')).toBeInTheDocument();
    const totals = screen.getByRole('region', { name: 'Totals' });
    expect(within(totals).getByText('Game opens')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Games opened' })).toHaveTextContent('Half-Life');

    const range = screen.getByRole('group', { name: 'Range' });
    await user.click(within(range).getByRole('button', { name: '30 days' }));
    expect(within(range).getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: 'Tabs per day' })).toBeInTheDocument();

    await user.click(within(screen.getByRole('group', { name: 'Measure' })).getByRole('button', { name: 'Searches' }));
    expect(screen.getByRole('img', { name: 'Searches per day' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });
});
