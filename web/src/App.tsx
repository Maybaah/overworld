import { useEffect } from 'react';
import { useStore } from './data/store';
import { GlobeView } from './globe/GlobeView';
import { Overlay } from './ui/Overlay';

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
      <Overlay />
    </>
  );
}
