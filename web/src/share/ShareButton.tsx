import { useEffect, useId, useRef, useState } from 'react';
import { track } from '../telemetry/telemetry';
import { cardToBlob, type CardSpec } from './card';
import './share.css';

interface Props {
  url: string;
  title: string;
  card: CardSpec;
  fileName?: string;
  label?: string;
  kind: 'game' | 'myglobe' | 'guess';
}

function slug(text: string): string {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s === '' ? 'overworld' : s.slice(0, 60);
}

export function ShareButton({ url, title, card, fileName, label = 'Share', kind }: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const popId = useId();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      track('share', { action: 'copy_link', kind });
      setMessage('Link copied');
    } catch {
      setMessage('Could not copy the link');
    }
    setOpen(false);
  };

  const download = async () => {
    setBusy(true);
    try {
      const blob = await cardToBlob(card);
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${fileName ?? slug(title)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      track('share', { action: 'download', kind });
      setMessage('Image downloaded');
    } catch {
      setMessage('Could not create the image');
    }
    setBusy(false);
    setOpen(false);
  };

  const share = async () => {
    setBusy(true);
    let files: File[] | null = null;
    try {
      const blob = await cardToBlob(card);
      const file = new File([blob], `${fileName ?? slug(title)}.png`, { type: 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) files = [file];
    } catch {
      files = null;
    }
    try {
      await navigator.share(files ? { title, url, files } : { title, url });
      track('share', { action: 'native', kind });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setMessage('Could not share');
    }
    setBusy(false);
    setOpen(false);
  };

  return (
    <span className="ow-share" ref={root}>
      <button
        type="button"
        className="ow-more-btn ow-share-btn"
        aria-expanded={open}
        aria-controls={popId}
        aria-haspopup="true"
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        Share
      </button>
      {open && (
        <span id={popId} className="ow-share-pop" role="group" aria-label="Share options">
          <button type="button" className="ow-share-item" onClick={() => void copy()}>
            Copy link
          </button>
          <button type="button" className="ow-share-item" disabled={busy} onClick={() => void download()}>
            Download image
          </button>
          {canShare && (
            <button type="button" className="ow-share-item" disabled={busy} onClick={() => void share()}>
              Share…
            </button>
          )}
        </span>
      )}
      <span className="ow-share-live" aria-live="polite">
        {message}
      </span>
    </span>
  );
}
