export const TITLE_PREFIX = 'title-';

export function titleKey(gameId: number): string {
  return `${TITLE_PREFIX}${gameId}`;
}
