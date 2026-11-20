import type { MosaicFocus, MosaicGame, MosaicMesh } from './build';

export interface WorkerGame extends MosaicGame {
  year: number | null;
}

export interface BuildRequest {
  type: 'build';
  seq: number;
  year: number;
  maxYear: number;
  filter: number[] | null;
  focus: MosaicFocus | null;
}

export type MosaicRequest =
  | { type: 'init'; games: WorkerGame[]; layoutsUrl: string }
  | BuildRequest
  | { type: 'pick'; seq: number; lat: number; lng: number };

export type MosaicResponse =
  | { type: 'mesh'; seq: number; year: number; mesh: MosaicMesh; ms: number; last: boolean }
  | { type: 'pick'; seq: number; gameId: number | null };
