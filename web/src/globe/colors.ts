export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const COLORS = {
  background: '#09090b',
  globe: '#111114',
  countryFill: '#3f3f46',
  countryStroke: '#5b5b63',
  atmosphere: '#71717a',
  lead: '#F0E442',
  idle: '#9aa3b2',
  dot: '#eef1f5',
  dotRim: '#0a0e14',
} as const;
