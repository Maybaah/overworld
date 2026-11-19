import { useStore } from '../data/store';

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
    </footer>
  );
}
