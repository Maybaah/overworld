import { useState } from 'react';
import { kmToMiles } from './distance';
import { challengeLink, countryName, fmt, fmtKm, fmtMiles, placeText, shareSummary } from './format';
import type { GameState, RoundResult } from './game';
import { totalScore } from './game';
import { Picture } from './Picture';
import { MAX_GAME_SCORE, MAX_ROUND_SCORE } from './scoring';
import { resultToShareParams, shareParamsToResult, type ShareResult } from './share';
import { ShareButton } from '../share/ShareButton';
import { guessCardSpec } from '../share/card';
import { pageLink } from '../share/urlState';

export function StartScreen({
  ready,
  error,
  onStart,
}: {
  ready: boolean;
  error: string | null;
  onStart: () => void;
}) {
  return (
    <div className="gs-body">
      <h2 className="gs-title">Guess where it was made</h2>
      <p>
        You will see a picture from a game. Click the globe where you think its lead studio is based. Five rounds,
        closer is better.
      </p>
      {error && (
        <p className="gs-error" role="alert">
          {error}
        </p>
      )}
      <div className="gs-actions">
        <button type="button" className="gs-btn gs-btn-primary" onClick={onStart} disabled={!ready}>
          Start
        </button>
      </div>
      {!ready && !error && (
        <p className="gs-muted" role="status">
          Loading data…
        </p>
      )}
    </div>
  );
}

export function RoundView({
  state,
  countries,
  onHint,
  onConfirm,
  onCountry,
}: {
  state: GameState;
  countries: { code: string; name: string }[];
  onHint: () => void;
  onConfirm: () => void;
  onCountry: (code: string) => void;
}) {
  const round = state.rounds[state.index]!;
  const soFar = totalScore(state.results);
  return (
    <div className="gs-body">
      <div className="gs-head">
        <h2 className="gs-title">
          Round {state.index + 1} of {state.rounds.length}
        </h2>
        <p className="gs-mono gs-muted">{fmt(soFar)} points</p>
      </div>
      <Picture key={round.gameId} gameId={round.gameId} cover={round.cover} />

      {state.hintUsed ? (
        <p className="gs-hint">
          <strong>{round.name}</strong> <span className="gs-mono">{round.year ?? 'Year unknown'}</span>
          <span className="gs-muted"> · score halved</span>
        </p>
      ) : (
        <div className="gs-row">
          <button type="button" className="gs-btn" onClick={onHint}>
            Show title
          </button>
          <span className="gs-muted gs-small">Halves this round's score</span>
        </div>
      )}

      <p>{state.phase === 'placed' ? 'Guess placed. Click the globe again to move it.' : 'Click the globe to place your guess.'}</p>

      <div className="gs-field">
        <label htmlFor={`gs-country-${state.index}`}>Guess by country</label>
        <select
          id={`gs-country-${state.index}`}
          key={state.index}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onCountry(e.target.value);
          }}
        >
          <option value="" disabled>
            Choose a country
          </option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="gs-actions">
        <button
          type="button"
          className="gs-btn gs-btn-primary"
          onClick={onConfirm}
          disabled={state.phase !== 'placed'}
        >
          Confirm guess
        </button>
      </div>
    </div>
  );
}

export function RevealView({
  state,
  onNext,
  onOpenCard,
}: {
  state: GameState;
  onNext: () => void;
  onOpenCard: (gameId: number) => void;
}) {
  const result = state.results[state.index]!;
  const { round } = result;
  const last = state.index + 1 >= state.rounds.length;
  return (
    <div className="gs-body">
      <h2 className="gs-title">
        Round {state.index + 1} of {state.rounds.length}
      </h2>
      <dl className="gs-facts">
        <div>
          <dt>Distance</dt>
          <dd>
            <span className="gs-mono">{fmtKm(result.distanceKm)}</span>{' '}
            <span className="gs-mono gs-muted">({fmtMiles(result.distanceKm)})</span>
          </dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd>
            <span className="gs-mono gs-score">{fmt(result.score)}</span>
            <span className="gs-mono gs-muted"> / {fmt(MAX_ROUND_SCORE)}</span>
            {result.hintUsed && <span className="gs-muted"> · halved by the title hint</span>}
          </dd>
        </div>
        <div>
          <dt>Game</dt>
          <dd>
            {round.name} <span className="gs-mono gs-muted">{round.year ?? 'Year unknown'}</span>
          </dd>
        </div>
        <div>
          <dt>Studio</dt>
          <dd>
            {round.studioName}
            <span className="gs-muted"> · {placeText(round)}</span>
          </dd>
        </div>
      </dl>
      <div className="gs-actions">
        <button type="button" className="gs-btn gs-btn-primary" onClick={onNext}>
          {last ? 'See results' : 'Next round'}
        </button>
        <button type="button" className="gs-btn" disabled={!last} onClick={() => onOpenCard(round.gameId)}>
          Open game card
        </button>
      </div>
      {!last && <p className="gs-muted gs-small">The game card opens after the last round.</p>}
    </div>
  );
}

function CopyRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [status, setStatus] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Copied');
    } catch {
      setStatus('Could not copy. Select the text and copy it.');
    }
  };
  return (
    <div className="gs-field">
      <label>
        {label}
        {multiline ? (
          <textarea readOnly rows={6} value={value} onFocus={(e) => e.currentTarget.select()} />
        ) : (
          <input type="text" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        )}
      </label>
      <div className="gs-row">
        <button type="button" className="gs-btn" onClick={() => void copy()}>
          Copy {multiline ? 'text' : 'link'}
        </button>
        <span className="gs-muted gs-small" role="status">
          {status}
        </span>
      </div>
    </div>
  );
}

function ShareResultButton({ state }: { state: GameState }) {
  let params: URLSearchParams;
  let result: ShareResult;
  try {
    params = new URLSearchParams(
      resultToShareParams({
        seed: state.seed ?? '',
        rounds: state.results.map((r) => ({
          gameId: r.round.gameId,
          km: r.distanceKm,
          score: r.score,
          hint: r.hintUsed,
        })),
      }),
    );
    const decoded = shareParamsToResult(params);
    if (!decoded) return null;
    result = decoded;
  } catch {
    return null;
  }
  return <ShareButton url={pageLink('guess', params)} title="My Overworld guess result" card={guessCardSpec(result)} fileName="overworld-guess" />;
}

export function EndScreen({
  state,
  onAgain,
  onSame,
  onOpenCard,
}: {
  state: GameState;
  onAgain: () => void;
  onSame: () => void;
  onOpenCard: (gameId: number) => void;
}) {
  const total = totalScore(state.results);
  const seed = state.seed ?? '';
  return (
    <div className="gs-body">
      <h2 className="gs-title">Game over</h2>
      <p className="gs-total gs-mono">
        {fmt(total)} <span className="gs-muted">/ {fmt(MAX_GAME_SCORE)}</span>
      </p>
      <ol className="gs-results" aria-label="Rounds">
        {state.results.map((r: RoundResult, i) => (
          <li key={r.round.gameId}>
            <div className="gs-result-main">
              <span>
                {i + 1}. {r.round.name}
              </span>
              <span className="gs-mono">{fmt(r.score)}</span>
            </div>
            <div className="gs-muted gs-small">
              {r.round.city ?? countryName(r.round.country)} · <span className="gs-mono">{fmtKm(r.distanceKm)}</span>
              {r.hintUsed && ' · hint used'}
            </div>
            <button
              type="button"
              className="gs-link"
              aria-label={`Open game card: ${r.round.name}`}
              onClick={() => onOpenCard(r.round.gameId)}
            >
              Open game card
            </button>
          </li>
        ))}
      </ol>
      <div className="gs-actions">
        <button type="button" className="gs-btn gs-btn-primary" onClick={onAgain}>
          Play again
        </button>
        <button type="button" className="gs-btn" onClick={onSame}>
          Play the same five
        </button>
      </div>
      <section className="gs-share" aria-label="Share result">
        <h3 className="gs-subtitle">Share result</h3>
        <CopyRow label="Result summary" value={shareSummary(state.results, total)} multiline />
        <CopyRow label="Challenge link" value={challengeLink(seed)} />
        <ShareResultButton state={state} />
      </section>
    </div>
  );
}

export function liveMessage(state: GameState): string {
  const n = state.index + 1;
  switch (state.phase) {
    case 'guessing':
      return `Round ${n} of ${state.rounds.length}. Place your guess on the globe.`;
    case 'placed':
      return 'Guess placed. Confirm it or click the globe to move it.';
    case 'revealed': {
      const r = state.results[state.index];
      if (!r) return '';
      return `Round ${n} score ${fmt(r.score)}. ${fmt(r.distanceKm)} kilometres, ${fmt(kmToMiles(r.distanceKm))} miles away.`;
    }
    case 'finished':
      return `Game over. Total score ${fmt(totalScore(state.results))} out of ${fmt(MAX_GAME_SCORE)}.`;
    default:
      return '';
  }
}
