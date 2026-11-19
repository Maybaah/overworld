import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore, type AppMode } from '../data/store';

const ALL_MODES: { id: AppMode; label: string }[] = [
  { id: 'explore', label: 'Explore' },
  { id: 'guess', label: 'Guess' },
  { id: 'myglobe', label: 'My globe' },
  { id: 'insights', label: 'Insights' },
];

const UNLISTED: AppMode[] = ['guess'];

export function ModeNav() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const MODES = ALL_MODES.filter((m) => !UNLISTED.includes(m.id) || m.id === mode);
  const active = MODES.findIndex((m) => m.id === mode);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const el = refs.current[active];
    setPill(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
  }, [active, MODES.length]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % MODES.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + MODES.length) % MODES.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = MODES.length - 1;
    else return;
    e.preventDefault();
    refs.current[next]?.focus();
  }

  return (
    <div className="ow-modenav" role="group" aria-label="Mode">
      {pill && <span className="ow-mode-pill" aria-hidden="true" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
      {MODES.map((m, i) => (
        <button
          key={m.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          className="ow-mode-btn"
          aria-pressed={mode === m.id}
          tabIndex={mode === m.id ? 0 : -1}
          onClick={() => setMode(m.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
