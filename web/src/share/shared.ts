import { shareParamsToResult, type ShareResult } from '../guess/share';
import { shareParamsToSummary, type ShareSummary } from '../myglobe/share';

export function readSharedResult(search: string): ShareResult | null {
  const p = new URLSearchParams(search);
  if (p.get('mode') !== 'guess' || p.get('r') === null) return null;
  try {
    return shareParamsToResult(p);
  } catch {
    return null;
  }
}

export function readSharedSummary(search: string): ShareSummary | null {
  const p = new URLSearchParams(search);
  if (p.get('mode') !== 'myglobe') return null;
  const s = p.get('s');
  if (s === null || s.length > 200) return null;
  try {
    return shareParamsToSummary(new URLSearchParams(s));
  } catch {
    return null;
  }
}
