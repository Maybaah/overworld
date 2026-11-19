import { useStore, type AppState, type SelectedPlace } from '../data/store';
import { countryName } from '../ui/format';
import { browserEnv, configure, deviceClass, entryOf, flush, referrerHost, scrubMessage, track, utmOf } from './telemetry';

const MAX_ERRORS = 5;

export function placeLabel(place: SelectedPlace, state: Pick<AppState, 'indexes'>): string | undefined {
  if (place.level === 'country') return countryName(String(place.key));
  if (place.level === 'company') return state.indexes?.companyById.get(Number(place.key))?.name;
  const city = state.indexes?.cities.find((c) => c.key === place.key);
  return city ? `${city.name}, ${countryName(city.country)}` : undefined;
}

export function watchStore(): () => void {
  return useStore.subscribe((s, prev) => {
    if (s.selectedGameId !== null && s.selectedGameId !== prev.selectedGameId) {
      track('game_open', { game: s.selectedGameId, title: s.indexes?.gameById.get(s.selectedGameId)?.name });
    }
    if (s.selectedPlace && s.selectedPlace !== prev.selectedPlace) {
      track('place_open', { level: s.selectedPlace.level, label: placeLabel(s.selectedPlace, s) });
    }
    if (s.mode !== prev.mode) track('mode', { mode: s.mode });
    if (s.playing && !prev.playing) track('year_play', { year: s.year });
    if (s.globeReady && !prev.globeReady) track('ready', { ms: Math.round(performance.now()) });
  });
}

function appVersion(): string | undefined {
  const v = document.querySelector('meta[name="app-version"]')?.getAttribute('content') ?? '';
  return /^[A-Za-z0-9._-]{1,24}$/.test(v) ? v : undefined;
}

export function startTelemetry(): void {
  try {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const ctx: Record<string, string> = {
      device: deviceClass(innerWidth, innerHeight, coarse),
      entry: entryOf(location.search),
      ...utmOf(location.search),
    };
    const ref = referrerHost(document.referrer, location.hostname);
    if (ref) ctx.ref = ref;
    const v = appVersion();
    if (v) ctx.v = v;
    if (!configure(browserEnv(), ctx)) return;

    watchStore();
    let errors = 0;
    const report = (where: 'window' | 'promise', msg: unknown) => {
      if (errors++ < MAX_ERRORS) track('error', { where, msg: scrubMessage(msg) });
    };
    addEventListener('error', (e) => report('window', e.message));
    addEventListener('unhandledrejection', (e) => report('promise', e.reason instanceof Error ? e.reason.message : e.reason));
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush(true);
    });
    addEventListener('pagehide', () => flush(true));
  } catch {
    return;
  }
}
