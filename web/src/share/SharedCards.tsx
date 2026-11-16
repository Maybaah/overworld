import { useStore } from '../data/store';
import { countryName, formatCount } from '../ui/format';
import { shareTotal, type ShareResult } from '../guess/share';
import { MAX_GAME_SCORE } from '../guess/scoring';
import type { ShareSummary } from '../myglobe/share';
import { myGlobeHeadline } from './card';
import './share.css';

export function SharedGuessResult({ result, onPlay }: { result: ShareResult; onPlay: () => void }) {
  const gameById = useStore((s) => s.indexes?.gameById);
  return (
    <section className="ow-shared" aria-label="Shared result">
      <h2 className="gs-title">Someone shared a result</h2>
      <p className="gs-total gs-mono">
        {formatCount(shareTotal(result))} <span className="gs-muted">/ {formatCount(MAX_GAME_SCORE)}</span>
      </p>
      <ol className="ow-shared-rows">
        {result.rounds.map((r, i) => (
          <li key={`${r.gameId}-${i}`} className="ow-shared-row">
            <span>
              {i + 1}. {gameById?.get(r.gameId)?.name ?? `Game ${r.gameId}`}
              <span className="gs-muted gs-small">
                {' '}
                · {formatCount(r.km)} km{r.hint ? ' · hint used' : ''}
              </span>
            </span>
            <span className="gs-mono">{formatCount(r.score)}</span>
          </li>
        ))}
      </ol>
      <div className="gs-actions">
        <button type="button" className="gs-btn gs-btn-primary" onClick={onPlay}>
          Play these five games
        </button>
      </div>
    </section>
  );
}

export function SharedSummary({ summary, onMake }: { summary: ShareSummary; onMake: () => void }) {
  return (
    <section className="ow-shared" aria-label="Shared summary">
      <p className="omg-headline">{myGlobeHeadline(summary)}</p>
      <ul className="ow-shared-rows" aria-label="Countries">
        {summary.countries.map((c) => (
          <li key={c.code} className="ow-shared-row">
            <span>{countryName(c.code)}</span>
            <span className="ow-mono ow-muted">{c.percent}%</span>
          </li>
        ))}
      </ul>
      <p className="ow-muted">
        <span className="ow-mono">{formatCount(summary.matched)}</span> of <span className="ow-mono">{formatCount(summary.owned)}</span> games matched
      </p>
      <div className="omg-actions">
        <button type="button" className="omg-primary" onClick={onMake}>
          Make your own
        </button>
      </div>
    </section>
  );
}
