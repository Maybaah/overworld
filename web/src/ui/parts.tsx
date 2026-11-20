import { useState, type ReactNode } from 'react';
import type { SourceRef } from '@shared';
import { SOURCE_LABEL } from './format';

export function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="ow-icon-btn" aria-label={label} onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </svg>
    </button>
  );
}

export function Swatch({ color, off = false }: { color: string; off?: boolean }) {
  return (
    <span
      className={off ? 'ow-swatch ow-swatch-off' : 'ow-swatch'}
      style={off ? { borderColor: color } : { background: color, borderColor: color }}
      aria-hidden="true"
    />
  );
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="ow-link-btn" onClick={onClick}>
      {children}
    </button>
  );
}

export const PAGE_SIZE = 50;

export function LimitedList<T>({
  items,
  render,
  label,
}: {
  items: readonly T[];
  render: (item: T, index: number) => ReactNode;
  label: string;
}) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const visible = items.slice(0, shown);
  return (
    <>
      <ul className="ow-list" aria-label={label}>
        {visible.map((item, i) => render(item, i))}
      </ul>
      {items.length > shown && (
        <button type="button" className="ow-more-btn" onClick={() => setShown(shown + PAGE_SIZE)}>
          Show more
          <span className="ow-mono ow-muted"> ({items.length - shown} left)</span>
        </button>
      )}
    </>
  );
}

export function SourceLink({ source, label }: { source: SourceRef; label?: string }) {
  const text = label ?? SOURCE_LABEL[source.source];
  if (!source.url || !/^https?:\/\//i.test(source.url)) return <span className="ow-muted ow-source">{text}</span>;
  return (
    <a className="ow-source" href={source.url} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  );
}
