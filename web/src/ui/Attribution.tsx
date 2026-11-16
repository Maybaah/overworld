import { useStore } from '../data/store';

// Only the sample-data warning stays on screen; data credits live in the README and in each game's sources line.
export function Attribution() {
  const meta = useStore((s) => s.meta);
  if (!meta?.fixture) return null;
  return (
    <footer className="ow-panel ow-attribution">
      <p className="ow-fixture-note">Sample data — not real games</p>
    </footer>
  );
}
