export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const COLORS = {
  background: '#07090d',
  globe: '#0b1018',
  countryFill: '#111a26',
  countryStroke: '#2b3a4f',
  atmosphere: '#3a6ea5',
  lead: '#F0E442',
  idle: '#A0A7B4',
} as const;
