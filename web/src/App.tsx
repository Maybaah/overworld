import { useEffect } from 'react';
import { useStore } from './data/store';

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
  border: '1px solid #e6e9ef',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 12,
} as const;

export function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const meta = useStore((s) => s.meta);
  const init = useStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div style={shell}>
      {status === 'loading' && <span>Loading...</span>}
      {status === 'error' && <span role="alert">Failed to load data: {error}</span>}
      {status === 'ready' && meta && (
        <>
          <span>
            {meta.counts.games.toLocaleString('en-US')} games · {meta.counts.companies.toLocaleString('en-US')} companies
          </span>
          {meta.fixture && <span style={badge}>Sample data</span>}
        </>
      )}
    </div>
  );
}
