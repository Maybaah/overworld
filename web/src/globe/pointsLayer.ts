import * as THREE from 'three';
import type { Indexes } from '../data/indexes';
import type { Timeline } from '../data/timeline';
import { COLORS, hexToRgb } from './colors';
import type { CompanyLayout } from './layout';
import { LEVELS, levelForAltitude, type Level } from './levels';
import { makeProjected, nearestPoint, projectPoints, type ProjectedPoints } from './picking';
import { applyYear, NO_YEAR, type LevelBuffers } from './sizes';

export const POINT_ALTITUDE = 0.008;
export const FADE_MS = 250;

export interface CoordsSource {
  getCoords(lat: number, lng: number, altitude?: number): { x: number; y: number; z: number };
}

export interface PickedPoint {
  level: Level;
  index: number;
  name: string;
  count: number;
}

interface LevelState {
  level: Level;
  n: number;
  positions: Float32Array;
  buffers: LevelBuffers;
  ring: Float32Array;
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  projected: ProjectedPoints;
  opacity: number;
  visibleCount: number;
}

const VERTEX = `
attribute float aSize;
attribute float aLead;
attribute float aRing;
uniform float uPixelRatio;
varying float vLead;
varying float vRing;
void main() {
  vLead = aLead;
  vRing = aRing;
  if (aSize <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio;
}
`;

const FRAGMENT = `
uniform vec3 uLead;
uniform vec3 uIdle;
uniform float uOpacity;
varying float vLead;
varying float vRing;
void main() {
  float d = length(gl_PointCoord * 2.0 - 1.0);
  if (d > 1.0) discard;
  vec3 col = mix(uIdle, uLead, vLead);
  float a;
  if (vRing > 0.5) {
    a = smoothstep(0.55, 0.7, d) * (1.0 - smoothstep(0.88, 1.0, d)) * 0.7;
    col *= 0.75;
  } else {
    a = 1.0 - smoothstep(0.62, 1.0, d);
  }
  gl_FragColor = vec4(col, a * uOpacity);
}
`;

export interface PointsLayerOptions {
  globe: CoordsSource;
  scene: THREE.Object3D;
  indexes: Indexes;
  timeline: Timeline;
  layout: CompanyLayout;
  pixelRatio: number;
  countryName(code: string): string;
}

export class PointsLayer {
  private readonly group = new THREE.Group();
  private readonly levels: Record<Level, LevelState>;
  private active: Level = 'country';
  private year: number;
  private readonly opts: PointsLayerOptions;

  constructor(opts: PointsLayerOptions) {
    this.opts = opts;
    this.year = opts.timeline.maxYear;
    const { indexes, layout, globe } = opts;
    const lats: Record<Level, ArrayLike<number>> = {
      country: indexes.countries.map((c) => c.lat),
      city: indexes.cities.map((c) => c.lat),
      company: layout.lat,
    };
    const lngs: Record<Level, ArrayLike<number>> = {
      country: indexes.countries.map((c) => c.lng),
      city: indexes.cities.map((c) => c.lng),
      company: layout.lng,
    };
    this.levels = {} as Record<Level, LevelState>;
    for (const level of LEVELS) {
      const n = lats[level].length;
      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const p = globe.getCoords(lats[level][i]!, lngs[level][i]!, POINT_ALTITUDE);
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
      }
      const buffers: LevelBuffers = { level, size: new Float32Array(n), lead: new Float32Array(n) };
      const ring = new Float32Array(n);
      if (level === 'company') {
        buffers.firstYear = Int16Array.from(indexes.companies, (c) => c.firstYear ?? NO_YEAR);
        buffers.hidden = layout.hidden;
        ring.set(layout.approx);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('aSize', new THREE.BufferAttribute(buffers.size, 1).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('aLead', new THREE.BufferAttribute(buffers.lead, 1).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('aRing', new THREE.BufferAttribute(ring, 1));
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        uniforms: {
          uPixelRatio: { value: opts.pixelRatio },
          uLead: { value: new THREE.Vector3(...hexToRgb(COLORS.lead)) },
          uIdle: { value: new THREE.Vector3(...hexToRgb(COLORS.idle)) },
          uOpacity: { value: 0 },
        },
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = 5;
      points.visible = false;
      this.group.add(points);
      this.levels[level] = {
        level,
        n,
        positions,
        buffers,
        ring,
        points,
        geometry,
        material,
        projected: makeProjected(n),
        opacity: 0,
        visibleCount: 0,
      };
    }
    this.setYear(this.year);
    opts.scene.add(this.group);
  }

  setYear(year: number): void {
    this.year = year;
    for (const level of LEVELS) {
      const st = this.levels[level];
      st.visibleCount = applyYear(st.buffers, this.opts.timeline.levelAt(level, year), year);
      (st.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
      (st.geometry.getAttribute('aLead') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  setAltitude(altitude: number): void {
    this.active = levelForAltitude(altitude);
  }

  level(): Level {
    return this.active;
  }

  pointCount(): number {
    return this.levels[this.active].visibleCount;
  }

  frame(dtMs: number): void {
    const step = Math.min(1, dtMs / FADE_MS);
    for (const level of LEVELS) {
      const st = this.levels[level];
      const target = level === this.active ? 1 : 0;
      if (st.opacity < target) st.opacity = Math.min(target, st.opacity + step);
      else if (st.opacity > target) st.opacity = Math.max(target, st.opacity - step);
      st.material.uniforms.uOpacity!.value = st.opacity;
      st.points.visible = st.opacity > 0.01;
    }
  }

  pick(x: number, y: number, camera: THREE.Camera, width: number, height: number): PickedPoint | null {
    const st = this.levels[this.active];
    const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    projectPoints(st.positions, vp.elements, camera.position, width, height, st.projected);
    const i = nearestPoint(x, y, st.projected, st.buffers.size);
    if (i < 0) return null;
    const { indexes, timeline } = this.opts;
    const count = timeline.levelAt(st.level, this.year)[i] ?? 0;
    let name = '';
    if (st.level === 'country') name = this.opts.countryName(indexes.countries[i]!.code);
    else if (st.level === 'city') name = indexes.cities[i]!.name;
    else name = indexes.companies[i]!.name;
    return { level: st.level, index: i, name, count };
  }

  keyAt(level: Level, index: number): string | number {
    const { indexes } = this.opts;
    if (level === 'country') return indexes.countries[index]!.code;
    if (level === 'city') return indexes.cities[index]!.key;
    return indexes.companies[index]!.id;
  }

  dispose(): void {
    this.opts.scene.remove(this.group);
    for (const level of LEVELS) {
      this.levels[level].geometry.dispose();
      this.levels[level].material.dispose();
    }
  }
}
