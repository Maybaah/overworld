import { ROLE_TYPES } from '@shared';
import type { Company, GameCompanyRole, RoleType } from '@shared';
import { ROLE_META } from '../data/roles';

export const SAME_PLACE_KM = 5;
export const MAX_LABELS = 20;
export const LEAD_COLOR = '#F0E442';
const EARTH_RADIUS_KM = 6371;
const HEIGHT_STEP = 0.035;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ArcSpec {
  companyId: number;
  role: RoleType;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  altitude: number;
  stroke: number;
  approx: boolean;
}

export interface MarkerSpec {
  companyId: number;
  name: string;
  lat: number;
  lng: number;
  color: string;
  lead: boolean;
}

export interface LabelSpec {
  companyId: number;
  name: string;
  lat: number;
  lng: number;
  color: string;
}

export interface RoleArcs {
  arcs: ArcSpec[];
  markers: MarkerSpec[];
  labels: LabelSpec[];
}

export interface ArcInput {
  leadCompanyId: number;
  roles: readonly GameCompanyRole[];
  enabledRoles: ReadonlySet<RoleType>;
  companyById: ReadonlyMap<number, Company>;
  displayPosition?: (company: Company) => LatLng | null;
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function located(c: Company | undefined): c is Company {
  return !!c && c.precision !== 'none' && c.lat !== null && c.lng !== null;
}

export function baseAltitude(km: number): number {
  const frac = Math.min(1, km / (Math.PI * EARTH_RADIUS_KM));
  return 0.04 + 0.45 * frac;
}

export function buildRoleArcs(input: ArcInput): RoleArcs {
  const { leadCompanyId, roles, enabledRoles, companyById } = input;
  const out: RoleArcs = { arcs: [], markers: [], labels: [] };
  const lead = companyById.get(leadCompanyId);
  if (!located(lead)) return out;
  const place = (c: Company): LatLng => input.displayPosition?.(c) ?? { lat: c.lat!, lng: c.lng! };
  const leadPos = place(lead);

  out.markers.push({ companyId: lead.id, name: lead.name, lat: leadPos.lat, lng: leadPos.lng, color: LEAD_COLOR, lead: true });

  const rolesByCompany = new Map<number, Set<RoleType>>();
  for (const r of roles) {
    if (!enabledRoles.has(r.role) || r.companyId === leadCompanyId) continue;
    let set = rolesByCompany.get(r.companyId);
    if (!set) rolesByCompany.set(r.companyId, (set = new Set()));
    set.add(r.role);
  }

  const involved: { company: Company; roles: RoleType[] }[] = [];
  for (const [companyId, set] of rolesByCompany) {
    const company = companyById.get(companyId);
    if (!located(company)) continue;
    const ordered = ROLE_TYPES.filter((r) => set.has(r));
    involved.push({ company, roles: ordered });
  }

  for (const { company, roles: companyRoles } of involved) {
    const pos = place(company);
    const km = distanceKm(lead.lat!, lead.lng!, company.lat!, company.lng!);
    const approx = company.precision === 'country';
    out.markers.push({
      companyId: company.id,
      name: company.name,
      lat: pos.lat,
      lng: pos.lng,
      color: ROLE_META[companyRoles[0]!].color,
      lead: false,
    });
    if (km < SAME_PLACE_KM) continue;
    const base = baseAltitude(km);
    companyRoles.forEach((role, k) => {
      out.arcs.push({
        companyId: company.id,
        role,
        startLat: leadPos.lat,
        startLng: leadPos.lng,
        endLat: pos.lat,
        endLng: pos.lng,
        color: withAlpha(ROLE_META[role].color, approx ? 0.55 : 0.95),
        altitude: base + k * HEIGHT_STEP,
        stroke: approx ? 0.2 : 0.45,
        approx,
      });
    });
  }

  const ranked = [...involved].sort(
    (a, b) => b.roles.length - a.roles.length || a.company.name.localeCompare(b.company.name),
  );
  out.labels.push({ companyId: lead.id, name: lead.name, lat: leadPos.lat, lng: leadPos.lng, color: LEAD_COLOR });
  for (const { company, roles: companyRoles } of ranked) {
    if (out.labels.length >= MAX_LABELS) break;
    const pos = place(company);
    out.labels.push({
      companyId: company.id,
      name: company.name,
      lat: pos.lat,
      lng: pos.lng,
      color: ROLE_META[companyRoles[0]!].color,
    });
  }

  return out;
}
