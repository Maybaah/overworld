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

export interface AppState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  meta: DataMeta | null;
  indexes: Indexes | null;
  timeline: Timeline | null;
  year: number;
  playing: boolean;
  enabledRoles: Set<RoleType>;
  selectedGameId: number | null;
  selectedGameDetail: GameDetail | null;
  detailError: string | null;
  selectedPlace: SelectedPlace | null;
  init: () => Promise<void>;
  setYear: (year: number) => void;
  setPlaying: (playing: boolean) => void;
  toggleRole: (role: RoleType) => void;
  selectGame: (id: number | null) => Promise<void>;
  selectPlace: (place: SelectedPlace | null) => void;
}

export const useStore = create<AppState>((set, get) => ({
  status: 'loading',
  error: null,
  meta: null,
  indexes: null,
  timeline: null,
  year: 2026,
  playing: false,
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
      const timeline = buildTimeline(indexes);
      set({ status: 'ready', meta, indexes, timeline, year: timeline.maxYear });
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
}));
