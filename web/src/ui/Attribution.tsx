import { useStore } from '../data/store';

export const AUTHOR = { name: 'Artem Kovtoniuk', url: 'https://github.com/Maybaah' };

export function Attribution() {
  const meta = useStore((s) => s.meta);
  if (!meta) return null;
  return (
    <footer className={meta.fixture ? 'ow-panel ow-attribution' : 'ow-panel ow-attribution ow-attribution-link'}>
      {meta.fixture ? (
        <p className="ow-fixture-note">Sample data — not real games</p>
      ) : (
        <a className="ow-browse" href={`${import.meta.env.BASE_URL}countries/`}>
          Countries and studios
        </a>
      )}
      <span className="ow-credit">
        Created by{' '}
        <a href={AUTHOR.url} target="_blank" rel="noopener noreferrer">
          {AUTHOR.name}
        </a>
      </span>
    </footer>
  );
}
