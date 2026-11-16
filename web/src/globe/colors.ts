export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const COLORS = {
  background: '#07090d',
  globe: '#0b1018',
  countryFill: '#3a4352',
  countryStroke: '#5d6a7c',
  atmosphere: '#3a6ea5',
  lead: '#F0E442',
  idle: '#9aa3b2',
  dot: '#eef1f5',
  dotRim: '#0a0e14',
} as const;
