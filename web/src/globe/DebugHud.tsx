import { useEffect, useState } from 'react';

export interface Readout {
  fps: number;
  level: string;
  points: number;
}

const style = {
  position: 'fixed',
  left: '50%',
  transform: 'translateX(-50%)',
  top: 8,
  zIndex: 50,
  padding: '4px 8px',
  background: 'rgba(7, 9, 13, 0.8)',
  border: '1px solid #2b3a4f',
  borderRadius: 4,
  color: '#e6e9ef',
  font: '12px ui-monospace, Consolas, monospace',
  pointerEvents: 'none',
  whiteSpace: 'pre',
} as const;

export function DebugHud({ read }: { read: () => Readout }) {
  const [r, setR] = useState<Readout>(() => read());
  useEffect(() => {
    const id = window.setInterval(() => setR(read()), 500);
    return () => window.clearInterval(id);
  }, [read]);
  return (
    <div style={style} data-testid="debug-hud">
      {`fps ${r.fps}  level ${r.level}  points ${r.points}`}
    </div>
  );
}
