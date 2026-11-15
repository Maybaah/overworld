import countries from 'world-countries';

const byNumeric = new Map<number, string>();
const byAlpha2 = new Map<string, { name: string; region: string; subregion: string; lat: number; lng: number | null }>();

for (const c of countries) {
  if (c.ccn3) byNumeric.set(Number(c.ccn3), c.cca2);
  const [lat, lng] = c.latlng ?? [];
  byAlpha2.set(c.cca2, {
    name: c.name.common,
    region: c.region,
    subregion: c.subregion,
    lat: lat ?? Number.NaN,
    lng: lng ?? null,
  });
}

export function numericToAlpha2(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  return byNumeric.get(n) ?? null;
}

export function countryCentre(alpha2: string | null | undefined): { lat: number; lng: number } | null {
  if (!alpha2) return null;
  const c = byAlpha2.get(alpha2.toUpperCase());
  if (!c || c.lng === null || !Number.isFinite(c.lat)) return null;
  return { lat: c.lat, lng: c.lng };
}

export function countryName(alpha2: string | null | undefined): string | null {
  if (!alpha2) return null;
  return byAlpha2.get(alpha2.toUpperCase())?.name ?? null;
}

export function countryRegion(alpha2: string | null | undefined): { region: string; subregion: string } | null {
  if (!alpha2) return null;
  const c = byAlpha2.get(alpha2.toUpperCase());
  return c ? { region: c.region, subregion: c.subregion } : null;
}
