import { useEffect, useMemo, useState, type KeyboardEvent, type CSSProperties } from 'react';
import { useStore } from '../data/store';
import { formatCount } from './format';

const STEP_MS = 350;
const REDUCED_STEP_MS = 1000;
const TICK_MS = 50;
const MAX_WAIT_MS = 3000;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export function YearSlider() {
  const timeline = useStore((s) => s.timeline);
  const indexes = useStore((s) => s.indexes);
  const rawYear = useStore((s) => s.year);
  const playing = useStore((s) => s.playing);
  const setYear = useStore((s) => s.setYear);
  const setPlaying = useStore((s) => s.setPlaying);
  const reduced = useReducedMotion();

  const min = timeline?.minYear ?? 1970;
  const max = timeline?.maxYear ?? 1970;
  const year = Math.min(max, Math.max(min, Math.round(rawYear)));

  useEffect(() => {
    if (!playing) return;
    const step = reduced ? REDUCED_STEP_MS : STEP_MS;
    let elapsed = 0;
    const id = setInterval(() => {
      const { year: current, shownYear } = useStore.getState();
      if (current >= max) {
        setPlaying(false);
        return;
      }
      elapsed += TICK_MS;
      if (elapsed < step) return;
      if (shownYear !== null && shownYear !== current && elapsed < MAX_WAIT_MS) return;
      elapsed = 0;
      setYear(current + 1);
      if (current + 1 >= max) setPlaying(false);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, reduced, max, setYear, setPlaying]);

  const perYear = useMemo(() => {
    const counts = new Array<number>(max - min + 1).fill(0);
    for (const g of indexes?.games ?? []) {
      if (g.year !== null && g.year >= min && g.year <= max) counts[g.year - min]!++;
    }
    return counts;
  }, [indexes, min, max]);

  const total = useMemo(() => {
    if (!timeline) return 0;
    let sum = 0;
    for (const n of timeline.levelAt('company', year)) sum += n;
    return sum;
  }, [timeline, year]);

  if (!timeline) return null;

  const peak = Math.max(1, ...perYear);
  const clamp = (y: number) => Math.min(max, Math.max(min, y));

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const delta = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageUp: 10, PageDown: -10 }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    setPlaying(false);
    setYear(clamp(Math.round(useStore.getState().year) + delta));
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (year >= max) setYear(min);
    setPlaying(true);
  }

  const playLabel = playing ? 'Pause timeline' : reduced ? 'Play timeline, steps once per second' : 'Play timeline';

  return (
    <section className="ow-panel ow-slider" aria-label="Timeline">
      <div className="ow-slider-top">
        <button type="button" className="ow-icon-btn ow-play" aria-label={playLabel} title={playLabel} onClick={togglePlay}>
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z" fill="currentColor" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M5 3l8 5-8 5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <output className="ow-year ow-mono" aria-live="off">
          {year}
        </output>
        <span className="ow-slider-total ow-muted">
          <span className="ow-mono">{formatCount(total)}</span> games led worldwide
        </span>
      </div>
      <div className="ow-track">
        <svg className="ow-bars" viewBox={`0 0 ${perYear.length} 100`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {perYear.map((n, i) => {
            const h = (n / peak) * 100;
            return (
              <rect
                key={i}
                x={i + 0.1}
                width={0.8}
                y={100 - h}
                height={h}
                className={min + i <= year ? 'ow-bar' : 'ow-bar ow-bar-future'}
                style={{ '--i': i } as CSSProperties}
              />
            );
          })}
        </svg>
        <input
          type="range"
          className="ow-range"
          aria-label="Year"
          min={min}
          max={max}
          step={1}
          value={year}
          onChange={(e) => setYear(clamp(Number(e.target.value)))}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="ow-mono ow-muted ow-slider-ends" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </section>
  );
}
