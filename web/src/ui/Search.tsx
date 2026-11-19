import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useStore } from '../data/store';
import { searchGames } from '../data/search';
import { countryName } from './format';
import { track } from '../telemetry/telemetry';

const MAX_RESULTS = 8;

export function Search() {
  const indexes = useStore((s) => s.indexes);
  const selectGame = useStore((s) => s.selectGame);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const base = useId();
  const listId = `${base}-list`;

  const results = useMemo(
    () => (indexes ? searchGames(indexes.games, query, MAX_RESULTS) : []),
    [indexes, query],
  );
  const expanded = open && results.length > 0;
  const optionId = (i: number) => `${base}-opt-${i}`;

  function pick(id: number) {
    track('search', { game: id, title: indexes?.gameById.get(id)?.name });
    void selectGame(id);
    setQuery('');
    setOpen(false);
    setActive(0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!expanded) setOpen(true);
      else setActive((active + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!expanded) setOpen(true);
      else setActive((active - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      const game = expanded ? results[active] : undefined;
      if (game) {
        e.preventDefault();
        pick(game.id);
      }
    } else if (e.key === 'Escape') {
      if (expanded) {
        e.preventDefault();
        setOpen(false);
      } else if (query !== '') {
        e.preventDefault();
        setQuery('');
      }
    }
  }

  return (
    <div className="ow-search">
      <input
        type="text"
        role="combobox"
        className="ow-search-input"
        placeholder="Search games"
        aria-label="Search games"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        disabled={!indexes}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} role="listbox" aria-label="Matching games" className="ow-search-list" hidden={!expanded}>
        {results.map((g, i) => {
          const lead = indexes?.companyById.get(g.leadCompanyId);
          return (
            <li
              key={g.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className="ow-search-option"
              data-active={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(g.id)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="ow-search-main">
                <span className="ow-search-name">{g.name}</span>
                <span className="ow-mono ow-muted">{g.year ?? 'n/a'}</span>
              </span>
              <span className="ow-muted ow-search-sub">
                {lead ? `${lead.name}${lead.country ? `, ${countryName(lead.country)}` : ''}` : 'Unknown studio'}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="ow-sr-only" role="status">
        {query !== '' && indexes ? (results.length > 0 ? `${results.length} results` : 'No results') : ''}
      </div>
      {open && query.trim() !== '' && results.length === 0 && indexes && (
        <div className="ow-search-empty ow-muted">No games found</div>
      )}
    </div>
  );
}
