import { describe, expect, it } from 'vitest';
import type { GameCompanyRole, RoleType } from '@shared';
import { ROLE_TYPES } from '@shared';
import { company } from '../data/testData';
import { ROLE_META } from '../data/roles';
import { buildRoleArcs, distanceKm, MAX_LABELS } from './arcs';

const src = { source: 'igdb', id: '1' } as const;

function role(companyId: number, r: RoleType): GameCompanyRole {
  return { companyId, role: r, platform: null, year: null, source: src };
}

const lead = company(1, { name: 'Lead', lat: 35.68, lng: 139.69 });
const paris = company(2, { name: 'Paris', city: 'Paris', country: 'FR', lat: 48.85, lng: 2.35 });
const all = new Set<RoleType>(ROLE_TYPES);

function run(companies: ReturnType<typeof company>[], roles: GameCompanyRole[], enabled: ReadonlySet<RoleType> = all) {
  return buildRoleArcs({
    leadCompanyId: 1,
    roles,
    enabledRoles: enabled,
    companyById: new Map(companies.map((c) => [c.id, c])),
  });
}

describe('distanceKm', () => {
  it('is about 9700 km between Tokyo and Paris', () => {
    expect(distanceKm(35.68, 139.69, 48.85, 2.35)).toBeGreaterThan(9500);
    expect(distanceKm(35.68, 139.69, 48.85, 2.35)).toBeLessThan(9900);
  });
});

describe('buildRoleArcs', () => {
  it('draws one arc per company and role, coloured by role', () => {
    const r = run([lead, paris], [role(2, 'publisher'), role(2, 'port')]);
    expect(r.arcs).toHaveLength(2);
    expect(r.arcs.map((a) => a.role).sort()).toEqual(['port', 'publisher']);
    const pub = r.arcs.find((a) => a.role === 'publisher')!;
    expect(pub.color).toContain('29,184,142');
    expect(pub.startLat).toBe(35.68);
    expect(pub.endLat).toBe(48.85);
  });

  it('draws a single arc for a duplicated (company, role)', () => {
    const r = run([lead, paris], [role(2, 'publisher'), role(2, 'publisher')]);
    expect(r.arcs).toHaveLength(1);
  });

  it('puts several roles of one company on parallel arcs at different heights', () => {
    const r = run([lead, paris], [role(2, 'publisher'), role(2, 'localization'), role(2, 'qa')]);
    const heights = r.arcs.map((a) => a.altitude);
    expect(new Set(heights).size).toBe(3);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.15);
  });

  it('skips companies with precision none and unknown companies', () => {
    const none = company(3, { precision: 'none', lat: null, lng: null, country: null, city: null });
    const r = run([lead, paris, none], [role(3, 'qa'), role(99, 'qa'), role(2, 'qa')]);
    expect(r.arcs.map((a) => a.companyId)).toEqual([2]);
    expect(r.markers.map((m) => m.companyId).sort()).toEqual([1, 2]);
    expect(r.labels.map((l) => l.companyId)).not.toContain(3);
  });

  it('draws no arc to a company at the lead position but keeps its marker', () => {
    const near = company(3, { name: 'Next door', lat: 35.69, lng: 139.7 });
    const r = run([lead, near], [role(3, 'qa')]);
    expect(r.arcs).toHaveLength(0);
    expect(r.markers.find((m) => m.companyId === 3)).toBeTruthy();
  });

  it('makes country-precision arcs thinner and more transparent', () => {
    const vague = company(3, { name: 'Vague', precision: 'country', city: null, country: 'FR', lat: 46, lng: 2 });
    const r = run([lead, paris, vague], [role(2, 'qa'), role(3, 'qa')]);
    const exact = r.arcs.find((a) => a.companyId === 2)!;
    const approx = r.arcs.find((a) => a.companyId === 3)!;
    expect(approx.approx).toBe(true);
    expect(approx.stroke).toBeLessThan(exact.stroke);
    const alpha = (c: string) => Number(c.slice(c.lastIndexOf(',') + 1, -1));
    expect(alpha(approx.color)).toBeLessThan(alpha(exact.color));
  });

  it('respects enabled roles and updates when they change', () => {
    const roles = [role(2, 'publisher'), role(2, 'qa')];
    expect(run([lead, paris], roles, new Set(['qa'])).arcs.map((a) => a.role)).toEqual(['qa']);
    const none = run([lead, paris], roles, new Set<RoleType>());
    expect(none.arcs).toHaveLength(0);
    expect(none.markers.map((m) => m.companyId)).toEqual([1]);
  });

  it('marks the lead with a distinct marker and ring colour per involved company', () => {
    const r = run([lead, paris], [role(2, 'publisher')]);
    const leadMarker = r.markers.find((m) => m.lead)!;
    expect(leadMarker.companyId).toBe(1);
    const other = r.markers.find((m) => m.companyId === 2)!;
    expect(other.lead).toBe(false);
    expect(other.color).toBe(ROLE_META.publisher.color);
  });

  it('ignores the lead studio own roles', () => {
    const r = run([lead], [role(1, 'lead_developer')]);
    expect(r.arcs).toHaveLength(0);
    expect(r.markers).toHaveLength(1);
  });

  it('returns nothing when the lead studio has no location', () => {
    const bad = company(1, { precision: 'none', lat: null, lng: null });
    expect(run([bad, paris], [role(2, 'qa')])).toEqual({ arcs: [], markers: [], labels: [] });
  });

  it('caps labels at 20, lead first, then most roles', () => {
    const others = Array.from({ length: 30 }, (_, i) => company(10 + i, { name: `C${String(i).padStart(2, '0')}`, lat: 48 + i * 0.5, lng: 2 }));
    const roles = others.map((c) => role(c.id, 'qa'));
    roles.push(role(39, 'publisher'), role(39, 'port'));
    const r = run([lead, ...others], roles);
    expect(r.labels).toHaveLength(MAX_LABELS);
    expect(r.labels[0]!.companyId).toBe(1);
    expect(r.labels[1]!.companyId).toBe(39);
  });
});
