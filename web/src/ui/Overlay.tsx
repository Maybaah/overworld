import { useEffect, useState } from 'react';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import './tokens.css';
import './overlay.css';
import { useStore } from '../data/store';
import { Search } from './Search';
import { GameCard } from './GameCard';
import { PlacePanel } from './PlacePanel';
import { YearSlider } from './YearSlider';
import { Attribution } from './Attribution';
import { ModeNav } from './ModeNav';
import { GuessPanel } from '../guess/GuessPanel';
import { MyGlobePanel } from '../myglobe/MyGlobePanel';
import { InsightsPanel } from '../insights/InsightsPanel';

const MID_QUERY = '(min-width: 760px) and (max-width: 1100px)';

function useMatches(query: string): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function Overlay() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const mode = useStore((s) => s.mode);
  const gameId = useStore((s) => s.selectedGameId);
  const place = useStore((s) => s.selectedPlace);
  const [front, setFront] = useState<'game' | 'place'>('game');
  const [side, setSide] = useState<'left' | 'right'>('left');
  const mid = useMatches(MID_QUERY);

  useEffect(() => {
    setSide(mode === 'guess' ? 'right' : 'left');
  }, [mode]);
  useEffect(() => {
    if (place !== null) {
      setFront('place');
      setSide('left');
    }
  }, [place]);
  useEffect(() => {
    if (gameId !== null) {
      setFront('game');
      setSide('right');
    }
  }, [gameId]);

  const explore = mode === 'explore';
  const shown = gameId === null ? 'place' : place === null ? 'game' : front;
  const sheet = gameId !== null || place !== null || mode === 'myglobe' || mode === 'insights';

  const leftName = explore ? 'place' : mode === 'myglobe' ? 'my globe' : 'insights';
  const hasLeft = explore ? place !== null : mode === 'myglobe' || mode === 'insights';
  const hasRight = mode === 'guess' || gameId !== null;
  const both = mid && hasLeft && hasRight;
  const collapseLeft = both && side === 'right';
  const collapseRight = both && side === 'left';
  const rightName = mode === 'guess' ? 'guess' : 'game';

  return (
    <div className="ow-root" data-front={shown} data-sheet={sheet} data-mode={mode}>
      <header className="ow-header">
        <span className="ow-wordmark">Overworld</span>
        <ModeNav />
        {explore && <Search />}
      </header>
      {status === 'error' && (
        <div className="ow-panel ow-load-error" role="alert">
          Could not load data: {error}
        </div>
      )}
      <div className="ow-left">
        {collapseLeft && (
          <button type="button" className="ow-panel ow-tab" onClick={() => setSide('left')}>
            Show {leftName} panel
          </button>
        )}
        {!collapseLeft && explore && <PlacePanel />}
        {!collapseLeft && mode === 'myglobe' && <MyGlobePanel />}
        {!collapseLeft && mode === 'insights' && <InsightsPanel />}
      </div>
      <div className="ow-right">
        {collapseRight && (
          <button type="button" className="ow-panel ow-tab" onClick={() => setSide('right')}>
            Show {rightName} panel
          </button>
        )}
        {!collapseRight && mode === 'guess' && <GuessPanel />}
        {!collapseRight && mode !== 'guess' && <GameCard />}
      </div>
      {(explore || mode === 'myglobe') && <YearSlider />}
      <Attribution />
    </div>
  );
}
