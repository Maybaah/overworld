import { useEffect, useState } from 'react';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import './tokens.css';
import './overlay.css';
import { useStore } from '../data/store';
import { Search } from './Search';
import { GameCard } from './GameCard';
import { PlacePanel } from './PlacePanel';
import { Legend } from './Legend';
import { YearSlider } from './YearSlider';
import { Attribution } from './Attribution';

export function Overlay() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const gameId = useStore((s) => s.selectedGameId);
  const place = useStore((s) => s.selectedPlace);
  const [front, setFront] = useState<'game' | 'place'>('game');

  useEffect(() => {
    if (gameId !== null) setFront('game');
  }, [gameId]);
  useEffect(() => {
    if (place !== null) setFront('place');
  }, [place]);

  const shown = gameId === null ? 'place' : place === null ? 'game' : front;
  const sheet = gameId !== null || place !== null;

  return (
    <div className="ow-root" data-front={shown} data-sheet={sheet}>
      <header className="ow-header">
        <span className="ow-wordmark">Overworld</span>
        <Search />
      </header>
      {status === 'error' && (
        <div className="ow-panel ow-load-error" role="alert">
          Could not load data: {error}
        </div>
      )}
      <div className="ow-left">
        <PlacePanel />
        <Legend />
      </div>
      <div className="ow-right">
        <GameCard />
      </div>
      <YearSlider />
      <Attribution />
    </div>
  );
}
