import type { ReactNode } from 'react';
import type { Loaded } from './useLoaded';

export function Bar({ fraction, color }: { fraction: number; color: string }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <span className="ins-bar" aria-hidden="true">
      <span className="ins-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}

export function LoadGate<T>({
  state,
  retry,
  what,
  children,
}: {
  state: Loaded<T>;
  retry: () => void;
  what: string;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') {
    return (
      <p className="ow-muted" role="status">
        Loading {what}…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="ow-error" role="alert">
        <p>Could not load {what}.</p>
        <p className="ow-muted ow-small">{state.message}</p>
        <button type="button" className="ow-more-btn" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="ins-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="ins-seg-btn" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
