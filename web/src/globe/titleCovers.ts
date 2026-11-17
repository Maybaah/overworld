// Games with no cover show a title card made at build time (web/scripts/cover-sprites.ts).
export const TITLE_PREFIX = 'title-';

export function titleKey(gameId: number): string {
  return `${TITLE_PREFIX}${gameId}`;
}
