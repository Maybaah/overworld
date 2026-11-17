import { create } from 'zustand';
import { ROLE_TYPES } from '@shared';
import type { DataMeta, GameDetail, RoleType } from '@shared';
import { buildIndexes, type Indexes } from './indexes';
import { loadCore, loadGameDetail } from './loader';
import { buildTimeline, type PlaceKey, type PlaceLevel, type Timeline } from './timeline';

export interface SelectedPlace {
  level: PlaceLevel;
  key: PlaceKey;
}

export type AppMode = 'explore' | 'guess' | 'myglobe' | 'insights';

export interface GlobeClick {
  lat: number;
  lng: number;
  seq: number;
}

export interface ExtraArc {
  id: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  width?: number;
  label?: string;
}

export interface ExtraMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  kind: 'ring' | 'pin';
  label?: string;
}

export interface CameraRequest {
  lat: number;
  lng: number;
  altitude: number;
  seq: number;
}

export interface AppState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  meta: DataMeta | null;
  indexes: Indexes | null;
  timeline: Timeline | null;
  fullTimeline: Timeline | null;
  mode: AppMode;
  globeClick: GlobeClick | null;
  extraArcs: ExtraArc[];
  extraMarkers: ExtraMarker[];
  pointsVisible: boolean;
  countryShade: Record<string, number> | null;
  gameFilter: Set<number> | null;
  cameraRequest: CameraRequest | null;
  year: number;
  playing: boolean;
  globeReady: boolean; // the first mosaic and its covers are on the globe
  shownYear: number | null; // the year the globe shows now; trails year while it rebuilds
  enabledRoles: Set<RoleType>;
  selectedGameId: number | null;
  selectedGameDetail: GameDetail | null;
  detailError: string | null;
  selectedPlace: SelectedPlace | null;
  init: () => Promise<void>;
  setYear: (year: number) => void;
  setPlaying: (playing: boolean) => void;
  setGlobeReady: () => void;
  setShownYear: (year: number | null) => void;
  toggleRole: (role: RoleType) => void;
  selectGame: (id: number | null) => Promise<void>;
  selectPlace: (place: SelectedPlace | null) => void;
  setMode: (mode: AppMode) => void;
  reportGlobeClick: (lat: number, lng: number) => void;
  setExtras: (arcs: ExtraArc[], markers: ExtraMarker[]) => void;
  setPointsVisible: (visible: boolean) => void;
  setCountryShade: (shade: Record<string, number> | null) => void;
  setGameFilter: (ids: Set<number> | null) => void;
  flyTo: (lat: number, lng: number, altitude: number) => void;
}

const MIN_YEAR = 1970;

function timelineFor(indexes: Indexes, filter: Set<number> | null): Timeline {
  const games = filter ? indexes.games.filter((g) => filter.has(g.id)) : indexes.games;
  return buildTimeline({ ...indexes, games }, MIN_YEAR, new Date().getFullYear());
}

export const useStore = create<AppState>((set, get) => ({
  status: 'loading',
  error: null,
  meta: null,
  indexes: null,
  timeline: null,
  fullTimeline: null,
  mode: 'explore',
  globeClick: null,
  extraArcs: [],
  extraMarkers: [],
  pointsVisible: true,
  countryShade: null,
  gameFilter: null,
  cameraRequest: null,
  year: new Date().getFullYear(),
  playing: false,
  globeReady: false,
  shownYear: null,
  enabledRoles: new Set<RoleType>(ROLE_TYPES),
  selectedGameId: null,
  selectedGameDetail: null,
  detailError: null,
  selectedPlace: null,

  async init() {
    set({ status: 'loading', error: null });
    try {
      const { meta, companies, games } = await loadCore();
      const indexes = buildIndexes(companies, games);
      const timeline = timelineFor(indexes, null);
      set({ status: 'ready', meta, indexes, timeline, fullTimeline: timeline, year: timeline.maxYear });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  setYear(year) {
    set({ year });
  },

  setPlaying(playing) {
    set({ playing });
  },

  setGlobeReady() {
    set({ globeReady: true });
  },

  setShownYear(shownYear) {
    set({ shownYear });
  },

  toggleRole(role) {
    const next = new Set(get().enabledRoles);
    if (next.has(role)) next.delete(role);
    else next.add(role);
    set({ enabledRoles: next });
  },

  async selectGame(id) {
    set({ selectedGameId: id, selectedGameDetail: null, detailError: null });
    if (id === null) return;
    try {
      const detail = await loadGameDetail(id);
      if (get().selectedGameId === id) set({ selectedGameDetail: detail });
    } catch (err) {
      if (get().selectedGameId === id) {
        set({ detailError: err instanceof Error ? err.message : String(err) });
      }
    }
  },

  selectPlace(place) {
    set({ selectedPlace: place });
  },

  setMode(mode) {
    if (get().mode === mode) return;
    set({
      mode,
      playing: false,
      selectedGameId: null,
      selectedGameDetail: null,
      detailError: null,
      selectedPlace: null,
      globeClick: null,
      extraArcs: [],
      extraMarkers: [],
      countryShade: null,
      gameFilter: null,
      timeline: get().fullTimeline,
      pointsVisible: mode !== 'guess',
    });
  },

  reportGlobeClick(lat, lng) {
    set({ globeClick: { lat, lng, seq: (get().globeClick?.seq ?? 0) + 1 } });
  },

  setExtras(arcs, markers) {
    set({ extraArcs: arcs, extraMarkers: markers });
  },

  setPointsVisible(visible) {
    set({ pointsVisible: visible });
  },

  setCountryShade(shade) {
    set({ countryShade: shade });
  },

  setGameFilter(ids) {
    const { indexes, fullTimeline } = get();
    if (!indexes) return;
    set({ gameFilter: ids, timeline: ids ? timelineFor(indexes, ids) : fullTimeline });
  },

  flyTo(lat, lng, altitude) {
    set({ cameraRequest: { lat, lng, altitude, seq: (get().cameraRequest?.seq ?? 0) + 1 } });
  },
}));
