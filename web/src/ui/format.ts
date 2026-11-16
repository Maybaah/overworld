import type { Company, LeadBasis, SourceName } from '@shared';

let regionNames: Intl.DisplayNames | null | undefined;

export function countryName(code: string | null): string {
  if (code === null) return 'Unknown country';
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

export const LEAD_BASIS_TEXT: Record<LeadBasis, string> = {
  curated: 'Set by hand from a cited source.',
  igdb_single_developer: 'IGDB lists a single developer for this game.',
  igdb_developer_confirmed_by_wikidata: 'IGDB names this developer and Wikidata confirms it.',
  igdb_developer_heuristic:
    'IGDB lists several developers; the others mostly do ports or sit outside the game’s country of origin.',
  igdb_first_developer: 'IGDB lists several developers; this is the first one named. Low confidence.',
  wikidata_developer: 'Taken from the developer recorded on Wikidata.',
  mobygames_developer: 'Taken from the developer recorded on MobyGames.',
};

export const SOURCE_LABEL: Record<SourceName, string> = {
  igdb: 'IGDB',
  wikidata: 'Wikidata',
  mobygames: 'MobyGames',
  curated: 'Curated',
};

export function placeLabel(company: Pick<Company, 'city' | 'country'>): string {
  if (company.country === null) return 'location unknown';
  const country = countryName(company.country);
  return company.city ? `${company.city}, ${country}` : country;
}

export function precisionText(precision: Company['precision']): string {
  if (precision === 'city') return 'Location is city-level.';
  if (precision === 'country') return 'Location is country-level only.';
  return 'Location is unknown.';
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}
