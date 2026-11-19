import { useMemo, useState } from 'react';
import { ROLE_TYPES } from '@shared';
import type { GameCompanyRole, RoleType } from '@shared';
import { useStore } from '../data/store';
import { ROLE_META } from '../data/roles';
import { CloseButton, LinkButton, SourceLink, Swatch } from './parts';
import { LEAD_BASIS_TEXT, placeLabel, precisionText, formatPlayers, PLAYERS_BASIS_TEXT } from './format';
import { ShareButton } from '../share/ShareButton';
import { gameCardSpec } from '../share/card';
import { gameLink, SHARE_PAGE_LIMIT } from '../share/urlState';

const COVER_URL = 'https://images.igdb.com/igdb/image/upload/t_cover_big/';

function Cover({ cover, name }: { cover: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="ow-cover">
      {cover !== null && !failed ? (
        <img
          src={`${COVER_URL}${cover}.jpg`}
          alt={`Cover of ${name}`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="ow-cover-empty ow-muted">No cover</span>
      )}
    </div>
  );
}

export function GameCard() {
  const gameId = useStore((s) => s.selectedGameId);
  const detail = useStore((s) => s.selectedGameDetail);
  const detailError = useStore((s) => s.detailError);
  const indexes = useStore((s) => s.indexes);
  const meta = useStore((s) => s.meta);
  const enabledRoles = useStore((s) => s.enabledRoles);
  const selectGame = useStore((s) => s.selectGame);
  const selectPlace = useStore((s) => s.selectPlace);

  const genreNames = useMemo(() => new Map((meta?.genres ?? []).map((g) => [g.id, g.name])), [meta]);

  const grouped = useMemo(() => {
    const byType = new Map<RoleType, GameCompanyRole[]>();
    for (const r of detail?.roles ?? []) {
      const list = byType.get(r.role);
      if (list) list.push(r);
      else byType.set(r.role, [r]);
    }
    return ROLE_TYPES.filter((t) => byType.has(t)).map((t) => ({ type: t, roles: byType.get(t)! }));
  }, [detail]);

  if (gameId === null || !indexes) return null;
  const game = indexes.gameById.get(gameId);
  if (!game) return null;
  const lead = indexes.companyById.get(game.leadCompanyId);
  const genres = game.genres.map((id) => genreNames.get(id)).filter((n): n is string => !!n);
  const openCompany = (id: number) => selectPlace({ level: 'company', key: id });

  return (
    <aside key={game.id} className="ow-panel ow-card" aria-label={`Game: ${game.name}`}>
      <div className="ow-panel-head">
        <div className="ow-card-top">
          <Cover key={game.id} cover={game.cover} name={game.name} />
          <div className="ow-card-title">
            <h2 className="ow-title">{game.name}</h2>
            <p className="ow-mono">{game.year ?? 'Year unknown'}</p>
            {detail?.players ? (
              <p className="ow-muted ow-small">
                <span className="ow-mono">≈ {formatPlayers(detail.players)}</span> players
                {detail.playersBasis ? ` · ${PLAYERS_BASIS_TEXT[detail.playersBasis]}` : ''}
              </p>
            ) : null}
            {(genres.length > 0 || game.indie) && (
              <ul className="ow-tags" aria-label="Genres">
                {genres.map((g) => (
                  <li key={g} className="ow-tag">
                    {g}
                  </li>
                ))}
                {game.indie && <li className="ow-tag ow-tag-indie">Indie</li>}
              </ul>
            )}
          </div>
        </div>
        <ShareButton
          url={gameLink(game.id, window.location, !import.meta.env.DEV && (indexes.gamePosition.get(game.id) ?? Infinity) < SHARE_PAGE_LIMIT)}
          title={game.name}
          card={gameCardSpec(game, lead, detail, indexes.companyById)}
          fileName={`overworld-${game.slug}`}
          label="Share game"
          kind="game"
        />
        <CloseButton label="Close game" onClick={() => void selectGame(null)} />
      </div>

      <div className="ow-panel-body">
        <section className="ow-lead">
          <h3 className="ow-subtitle">Lead studio</h3>
          {lead ? (
            <>
              <p>
                <LinkButton onClick={() => openCompany(lead.id)}>{lead.name}</LinkButton>
                <span className="ow-muted"> · {placeLabel(lead)}</span>
              </p>
              <p className="ow-muted ow-small">{precisionText(lead.precision)}</p>
            </>
          ) : (
            <p className="ow-muted">Unknown studio</p>
          )}
          {detail && <p className="ow-muted ow-small">{LEAD_BASIS_TEXT[detail.leadBasis]}</p>}
        </section>

        {!detail && !detailError && (
          <p className="ow-muted" role="status">
            Loading details…
          </p>
        )}
        {detailError && (
          <div role="alert" className="ow-error">
            <p>Could not load details: {detailError}</p>
            <button type="button" className="ow-more-btn" onClick={() => void selectGame(game.id)}>
              Try again
            </button>
          </div>
        )}

        {detail && (
          <>
            {grouped.length === 0 && <p className="ow-muted">No company roles recorded.</p>}
            {grouped.map(({ type, roles }) => {
              const roleMeta = ROLE_META[type];
              const dimmed = !enabledRoles.has(type);
              return (
                <section key={type} className="ow-role-group" data-role={type} data-dimmed={dimmed}>
                  <h3 className="ow-subtitle ow-role-head">
                    <Swatch color={roleMeta.color} off={dimmed} />
                    <span>{roleMeta.label}</span>
                    <span className="ow-mono ow-muted">{roles.length}</span>
                    {dimmed && <span className="ow-muted ow-small">filtered out</span>}
                  </h3>
                  <ul className="ow-list">
                    {roles.map((r, i) => {
                      const c = indexes.companyById.get(r.companyId);
                      const extra = [r.platform, r.year].filter((x) => x !== null && x !== '').join(' · ');
                      return (
                        <li key={`${r.companyId}-${i}`} className="ow-row">
                          <div className="ow-row-main">
                            {c ? (
                              <LinkButton onClick={() => openCompany(c.id)}>{c.name}</LinkButton>
                            ) : (
                              <span>Unknown company</span>
                            )}
                          </div>
                          <div className="ow-muted ow-small">
                            {c ? placeLabel(c) : 'location unknown'}
                            {c?.precision === 'country' && <span> · country only</span>}
                            {extra && <span className="ow-mono"> · {extra}</span>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
            {detail.sources.length > 0 && (
              <p className="ow-sources ow-muted ow-small">
                Sources:{' '}
                {detail.sources.map((s, i) => (
                  <span key={`${s.source}-${s.id}`}>
                    {i > 0 && ', '}
                    <SourceLink source={s} />
                  </span>
                ))}
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
