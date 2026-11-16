import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import './guess.css';
import { useStore } from '../data/store';
import type { ExtraMarker } from '../data/store';
import { altitudeForDistance, midpoint } from './distance';
import { countryName } from './format';
import { gameReducer, initialGameState } from './game';
import { buildPool, isValidSeed, pickRounds, randomSeed } from './rounds';
import { ROUNDS_PER_GAME } from './scoring';
import { EndScreen, RevealView, RoundView, StartScreen, liveMessage } from './Views';

const GUESS_COLOR = '#56B4E9';
const ANSWER_COLOR = '#F0E442';

function seedFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const seed = params.get('seed');
  return params.get('mode') === 'guess' && isValidSeed(seed) ? seed : null;
}

export function GuessPanel() {
  const indexes = useStore((s) => s.indexes);
  const globeClick = useStore((s) => s.globeClick);
  const setExtras = useStore((s) => s.setExtras);
  const flyTo = useStore((s) => s.flyTo);
  const setMode = useStore((s) => s.setMode);
  const selectGame = useStore((s) => s.selectGame);

  const [state, dispatch] = useReducer(gameReducer, initialGameState);
  const [startError, setStartError] = useState<string | null>(null);

  const pool = useMemo(() => (indexes ? buildPool(indexes) : []), [indexes]);
  const countries = useMemo(() => {
    if (!indexes) return [];
    return indexes.countries
      .map((c) => ({ code: c.code, name: countryName(c.code) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [indexes]);

  const start = useCallback(
    (seed: string) => {
      const rounds = pickRounds(pool, seed);
      if (rounds.length < ROUNDS_PER_GAME) {
        setStartError('There are not enough games with a known studio city to start a game.');
        return;
      }
      setStartError(null);
      dispatch({ type: 'start', seed, rounds });
    },
    [pool],
  );

  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !indexes) return;
    autoStarted.current = true;
    const seed = seedFromUrl();
    if (seed) start(seed);
  }, [indexes, start]);

  const lastSeq = useRef(globeClick?.seq ?? 0);
  useEffect(() => {
    if (!globeClick) {
      lastSeq.current = 0;
      return;
    }
    if (globeClick.seq === lastSeq.current) return;
    lastSeq.current = globeClick.seq;
    dispatch({ type: 'place', lat: globeClick.lat, lng: globeClick.lng });
  }, [globeClick]);

  useEffect(() => {
    const round = state.rounds[state.index];
    const result = state.results[state.index];
    const guessMarker = (guess: { lat: number; lng: number }): ExtraMarker => ({
      id: 'guess',
      lat: guess.lat,
      lng: guess.lng,
      color: GUESS_COLOR,
      kind: 'pin',
      label: 'Your guess',
    });
    if (state.phase === 'placed' && state.guess) {
      setExtras([], [guessMarker(state.guess)]);
    } else if (state.phase === 'revealed' && result && round) {
      setExtras(
        [
          {
            id: 'guess-arc',
            startLat: result.guess.lat,
            startLng: result.guess.lng,
            endLat: round.lat,
            endLng: round.lng,
            color: ANSWER_COLOR,
          },
        ],
        [
          guessMarker(result.guess),
          { id: 'answer', lat: round.lat, lng: round.lng, color: ANSWER_COLOR, kind: 'pin', label: round.studioName },
        ],
      );
    } else {
      setExtras([], []);
    }
  }, [state.phase, state.guess, state.index, state.rounds, state.results, setExtras]);

  useEffect(() => {
    if (state.phase !== 'revealed') return;
    const result = state.results[state.index];
    if (!result) return;
    const mid = midpoint(result.guess, result.round);
    flyTo(mid.lat, mid.lng, altitudeForDistance(result.distanceKm));
  }, [state.phase, state.index, state.results, flyTo]);

  useEffect(
    () => () => {
      useStore.getState().setExtras([], []);
    },
    [],
  );

  const openCard = (gameId: number) => {
    setMode('explore');
    void selectGame(gameId);
  };

  const pickCountry = (code: string) => {
    const place = indexes?.countries.find((c) => c.code === code);
    if (place) dispatch({ type: 'place', lat: place.lat, lng: place.lng });
  };

  let view;
  switch (state.phase) {
    case 'guessing':
    case 'placed':
      view = (
        <RoundView
          state={state}
          countries={countries}
          onHint={() => dispatch({ type: 'hint' })}
          onConfirm={() => dispatch({ type: 'confirm' })}
          onCountry={pickCountry}
        />
      );
      break;
    case 'revealed':
      view = <RevealView state={state} onNext={() => dispatch({ type: 'next' })} onOpenCard={openCard} />;
      break;
    case 'finished':
      view = (
        <EndScreen
          state={state}
          onAgain={() => start(randomSeed())}
          onSame={() => state.seed && start(state.seed)}
          onOpenCard={openCard}
        />
      );
      break;
    default:
      view = <StartScreen ready={indexes !== null} error={startError} onStart={() => start(randomSeed())} />;
  }

  return (
    <aside className="gs-panel" aria-label="Guess mode">
      {view}
      <div className="gs-sr-only" role="status" aria-live="polite">
        {liveMessage(state)}
      </div>
    </aside>
  );
}
