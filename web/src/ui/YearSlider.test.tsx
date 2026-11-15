import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { seedStore } from './testUtils';
import { useStore } from '../data/store';
import { YearSlider } from './YearSlider';

beforeEach(() => {
  seedStore();
  useStore.setState({ year: 2000 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const year = () => useStore.getState().year;

describe('YearSlider', () => {
  it('spans 1970 to the last year and shows year and total', () => {
    render(<YearSlider />);
    const range = screen.getByRole('slider', { name: 'Year' });
    expect(range).toHaveAttribute('min', '1970');
    expect(range).toHaveAttribute('max', '2010');
    expect(range).toHaveValue('2000');
    expect(screen.getByText('2000', { selector: 'output' })).toBeInTheDocument();
    expect(screen.getByText(/games led worldwide/)).toHaveTextContent('61 games led worldwide');
  });

  it('binds the range input to the store', () => {
    render(<YearSlider />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1985' } });
    expect(year()).toBe(1985);
  });

  it('steps with arrow keys and pages by ten, clamped', async () => {
    const user = userEvent.setup();
    render(<YearSlider />);
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowRight}');
    expect(year()).toBe(2001);
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(year()).toBe(1999);
    await user.keyboard('{PageUp}');
    expect(year()).toBe(2009);
    await user.keyboard('{PageUp}');
    expect(year()).toBe(2010);
    await user.keyboard('{PageDown}{PageDown}{PageDown}');
    expect(year()).toBe(1980);
    useStore.setState({ year: 1975 });
    await user.keyboard('{PageDown}');
    expect(year()).toBe(1970);
  });

  it('plays one year per 350 ms and pauses', () => {
    vi.useFakeTimers();
    render(<YearSlider />);
    fireEvent.click(screen.getByRole('button', { name: 'Play timeline' }));
    expect(useStore.getState().playing).toBe(true);
    act(() => void vi.advanceTimersByTime(350));
    expect(year()).toBe(2001);
    act(() => void vi.advanceTimersByTime(700));
    expect(year()).toBe(2003);
    fireEvent.click(screen.getByRole('button', { name: 'Pause timeline' }));
    expect(useStore.getState().playing).toBe(false);
    act(() => void vi.advanceTimersByTime(2000));
    expect(year()).toBe(2003);
  });

  it('stops at the end and restarts from 1970 when played from the end', () => {
    vi.useFakeTimers();
    useStore.setState({ year: 2008 });
    render(<YearSlider />);
    fireEvent.click(screen.getByRole('button', { name: 'Play timeline' }));
    act(() => void vi.advanceTimersByTime(350 * 5));
    expect(year()).toBe(2010);
    expect(useStore.getState().playing).toBe(false);
    expect(screen.getByRole('button', { name: 'Play timeline' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Play timeline' }));
    expect(year()).toBe(1970);
    expect(useStore.getState().playing).toBe(true);
    act(() => void vi.advanceTimersByTime(350));
    expect(year()).toBe(1971);
  });

  it('steps once per second under reduced motion and says so', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('reduce'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<YearSlider />);
    const play = screen.getByRole('button', { name: /once per second/ });
    fireEvent.click(play);
    act(() => void vi.advanceTimersByTime(350));
    expect(year()).toBe(2000);
    act(() => void vi.advanceTimersByTime(650));
    expect(year()).toBe(2001);
  });

  it('draws one bar per year', () => {
    const { container } = render(<YearSlider />);
    expect(container.querySelectorAll('rect')).toHaveLength(41);
  });
});
