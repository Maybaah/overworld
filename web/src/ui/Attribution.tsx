import { useStore } from '../data/store';

export function Attribution() {
  const meta = useStore((s) => s.meta);
  if (!meta) return null;
  const sources = meta.attribution.filter((a) => !(meta.fixture && a.source === 'curated'));
  return (
    <footer className="ow-panel ow-attribution">
      {meta.fixture && <p className="ow-fixture-note">Sample data — not real games</p>}
      <p className="ow-muted">
        {sources.length > 0 && (
          <>
            Data:{' '}
            {sources.map((a, i) => (
              <span key={a.source}>
                {i > 0 && ' · '}
                <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.licence}>
                  {a.name}
                </a>
              </span>
            ))}
            {' · '}
          </>
        )}
        Cover art via{' '}
        <a href="https://www.igdb.com" target="_blank" rel="noopener noreferrer">
          IGDB
        </a>
      </p>
    </footer>
  );
}
