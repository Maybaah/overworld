import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import './tokens.css';
import './loader.css';

const FADE_MS = 450;
const GIVE_UP_MS = 20000;

export function Loader() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const globeReady = useStore((s) => s.globeReady);
  const [gaveUp, setGaveUp] = useState(false);
  const [gone, setGone] = useState(false);
  const done = status === 'ready' && (globeReady || gaveUp);

  useEffect(() => {
    if (status !== 'ready') return;
    const id = setTimeout(() => setGaveUp(true), GIVE_UP_MS);
    return () => clearTimeout(id);
  }, [status]);

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(id);
  }, [done]);

  if (gone) return null;
  return (
    <div className={`ow-loader${done ? ' ow-loader-out' : ''}`} aria-busy={!done} aria-live="polite">
      <svg className="ow-loader-globe" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="50" className="ow-loader-rim" />
        <ellipse cx="60" cy="60" rx="50" ry="17" className="ow-loader-line" />
        <line x1="10" y1="60" x2="110" y2="60" className="ow-loader-line" />
        {[0, 1, 2, 3].map((k) => (
          <ellipse key={k} cx="60" cy="60" rx="50" ry="50" className="ow-loader-meridian" style={{ animationDelay: `${-k * 0.9}s` }} />
        ))}
      </svg>
      {status === 'error' ? (
        <p role="alert" className="ow-loader-text">
          Failed to load data: {error}
        </p>
      ) : (
        <p className="ow-loader-text">{status === 'ready' ? 'Laying out the covers' : 'Loading games'}</p>
      )}
    </div>
  );
}
