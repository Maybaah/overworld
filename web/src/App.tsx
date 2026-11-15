import { useEffect } from 'react';
import { useStore } from './data/store';
import { GlobeView } from './globe/GlobeView';

const shell = {
  minHeight: '100vh',
  background: '#07090d',
  color: '#e6e9ef',
  fontFamily: 'system-ui, sans-serif',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
} as const;

const badge = {
  position: 'fixed',
  right: 12,
  bottom: 12,
  zIndex: 5,
  border: '1px solid #e6e9ef',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 12,
  color: '#e6e9ef',
  background: 'rgba(7, 9, 13, 0.8)',
  fontFamily: 'system-ui, sans-serif',
  pointerEvents: 'none',
} as const;

export function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const meta = useStore((s) => s.meta);
  const init = useStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (status !== 'ready' || !meta) {
    return (
      <div style={shell}>
        {status === 'loading' && <span>Loading...</span>}
        {status === 'error' && <span role="alert">Failed to load data: {error}</span>}
      </div>
    );
  }

  return (
    <>
      <GlobeView />
      {/* overlay: mount the UI overlay component here */}
      {meta.fixture && <span style={badge}>Sample data</span>}
    </>
  );
}
