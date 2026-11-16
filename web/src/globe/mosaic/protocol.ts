import type { MosaicGame, MosaicMesh } from './build';

export interface WorkerGame extends MosaicGame {
  year: number | null;
}

export type MosaicRequest =
  | { type: 'init'; games: WorkerGame[] }
  | { type: 'build'; seq: number; year: number; maxYear: number; filter: number[] | null }
  | { type: 'pick'; seq: number; lat: number; lng: number };

export type MosaicResponse =
  | { type: 'mesh'; seq: number; mesh: MosaicMesh; ms: number }
  | { type: 'pick'; seq: number; gameId: number | null };
