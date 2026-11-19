import { sendNav } from '../globe/controls';
import { useStore } from '../data/store';

const ZOOM_STEP = 0.6;

export function NavButtons() {
  const zoomDetail = useStore((s) => s.zoomDetail);
  const setZoomDetail = useStore((s) => s.setZoomDetail);
  const detailLabel = zoomDetail ? 'More games when zoomed in: on' : 'More games when zoomed in: off';
  return (
    <div className="ow-nav ow-panel" role="group" aria-label="Globe view">
      <button type="button" className="ow-icon-btn" aria-label="Zoom in" title="Zoom in (+)" onClick={() => sendNav({ kind: 'zoom', amount: -ZOOM_STEP })}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <button type="button" className="ow-icon-btn" aria-label="Zoom out" title="Zoom out (−)" onClick={() => sendNav({ kind: 'zoom', amount: ZOOM_STEP })}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <button type="button" className="ow-icon-btn" aria-label="Whole globe" title="Whole globe" onClick={() => sendNav({ kind: 'home' })}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <ellipse cx="7" cy="7" rx="2.3" ry="5.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M1.8 7h10.4" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <button
        type="button"
        className="ow-icon-btn"
        aria-label="More games when zoomed in"
        aria-pressed={zoomDetail}
        title={detailLabel}
        onClick={() => setZoomDetail(!zoomDetail)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7 1.5v11M1.5 7h11M4.25 7v5.5M1.5 9.75H7" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </button>
    </div>
  );
}
