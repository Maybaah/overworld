import type { Topology } from 'topojson-specification';
import worldAtlas from 'world-atlas/countries-110m.json';
import { countryShapesOf } from './atlas';

export interface CountryShape {
  id?: string | number;
  geometry: { type: string; coordinates: number[] };
}

const NUMERIC_TABLE =
  '004AF008AL010AQ012DZ016AS020AD024AO028AG031AZ032AR036AU040AT044BS048BH050BD051AM052BB056BE060BM064BT' +
  '068BO070BA072BW076BR084BZ086IO090SB092VG096BN100BG104MM108BI112BY116KH120CM124CA132CV136KY140CF144LK' +
  '148TD152CL156CN158TW170CO174KM178CG180CD184CK188CR191HR192CU196CY203CZ204BJ208DK212DM214DO218EC222SV' +
  '226GQ231ET232ER233EE234FO238FK239GS242FJ246FI248AX250FR258PF260TF262DJ266GA268GE270GM275PS276DE288GH' +
  '296KI300GR304GL308GD316GU320GT324GN328GY332HT334HM336VA340HN344HK348HU352IS356IN360ID364IR368IQ372IE' +
  '376IL380IT384CI388JM392JP398KZ400JO404KE408KP410KR414KW417KG418LA422LB426LS428LV430LR434LY438LI440LT' +
  '442LU446MO450MG454MW458MY462MV466ML470MT478MR480MU484MX492MC496MN498MD499ME500MS504MA508MZ512OM516NA' +
  '520NR524NP528NL531CW533AW534SX540NC548VU554NZ558NI562NE566NG570NU574NF578NO580MP583FM584MH585PW586PK' +
  '591PA598PG600PY604PE608PH612PN616PL620PT624GW626TL630PR634QA642RO643RU646RW652BL654SH659KN660AI662LC' +
  '663MF666PM670VC674SM678ST682SA686SN688RS690SC694SL702SG703SK704VN705SI706SO710ZA716ZW724ES728SS729SD' +
  '732EH740SR748SZ752SE756CH760SY762TJ764TH768TG776TO780TT784AE788TN792TR795TM796TC800UG804UA807MK818EG' +
  '826GB831GG832JE833IM834TZ840US850VI854BF858UY860UZ862VE876WF882WS887YE894ZM';

const ALPHA2_BY_NUMERIC = new Map<number, string>();
for (let i = 0; i + 5 <= NUMERIC_TABLE.length; i += 5) {
  ALPHA2_BY_NUMERIC.set(Number(NUMERIC_TABLE.slice(i, i + 3)), NUMERIC_TABLE.slice(i + 3, i + 5));
}

export function alpha2OfNumeric(id: string | number | undefined): string | null {
  if (id === undefined || id === null) return null;
  return ALPHA2_BY_NUMERIC.get(Number(id)) ?? null;
}

export function loadCountryShapes(): CountryShape[] {
  return countryShapesOf(worldAtlas as unknown as Topology);
}

export async function loadDetailedCountryShapes(): Promise<CountryShape[]> {
  const mod = await import('world-atlas/countries-50m.json');
  return countryShapesOf(mod.default as unknown as Topology);
}

export const SHADE_BUCKETS = 16;

export function shadeBucket(value: number | undefined): number {
  if (value === undefined || !(value > 0)) return 0;
  return Math.min(SHADE_BUCKETS - 1, Math.max(1, Math.round(Math.min(1, value) * (SHADE_BUCKETS - 1))));
}

function hexToTriple(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shadeColor(bucket: number, base: string, top: string): string {
  const t = Math.min(1, Math.max(0, bucket / (SHADE_BUCKETS - 1)));
  const a = hexToTriple(base);
  const b = hexToTriple(top);
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
