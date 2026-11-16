import * as THREE from 'three';
import { hexToRgb } from './colors';
import type { CoordsSource } from './pointsLayer';

export interface MarkerItem {
  lat: number;
  lng: number;
  color: string;
  kind: 'ring' | 'lead' | 'pin';
}

const MARKER_ALTITUDE = 0.012;
const RING_PX = 16;
const LEAD_PX = 30;
const PIN_PX = 14;

const VERTEX = `
attribute float aSize;
attribute float aKind;
attribute vec3 aColor;
uniform float uPixelRatio;
varying float vKind;
varying vec3 vColor;
void main() {
  vKind = aKind;
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio;
}
`;

const FRAGMENT = `
varying float vKind;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord * 2.0 - 1.0);
  if (d > 1.0) discard;
  float a;
  if (vKind > 1.5) {
    float edge = smoothstep(0.55, 0.7, d);
    a = 1.0 - smoothstep(0.9, 1.0, d);
    gl_FragColor = vec4(mix(vColor, vec3(0.03, 0.04, 0.06), edge), a);
    return;
  }
  if (vKind > 0.5) {
    float outer = smoothstep(0.62, 0.74, d) * (1.0 - smoothstep(0.9, 1.0, d));
    float inner = 1.0 - smoothstep(0.2, 0.3, d);
    a = max(outer, inner);
  } else {
    a = smoothstep(0.55, 0.7, d) * (1.0 - smoothstep(0.88, 1.0, d));
  }
  gl_FragColor = vec4(vColor, a);
}
`;

export class MarkersLayer {
  private readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private geometry = new THREE.BufferGeometry();

  constructor(
    private readonly globe: CoordsSource,
    private readonly scene: THREE.Object3D,
    pixelRatio: number,
  ) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      uniforms: { uPixelRatio: { value: pixelRatio } },
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.visible = false;
    scene.add(this.points);
  }

  set(markers: readonly MarkerItem[]): void {
    this.geometry.dispose();
    const n = markers.length;
    const position = new Float32Array(n * 3);
    const color = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const kind = new Float32Array(n);
    markers.forEach((m, i) => {
      const p = this.globe.getCoords(m.lat, m.lng, MARKER_ALTITUDE);
      position.set([p.x, p.y, p.z], i * 3);
      color.set(hexToRgb(m.color), i * 3);
      size[i] = m.kind === 'lead' ? LEAD_PX : m.kind === 'pin' ? PIN_PX : RING_PX;
      kind[i] = m.kind === 'lead' ? 1 : m.kind === 'pin' ? 2 : 0;
    });
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.geometry.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    this.points.geometry = this.geometry;
    this.points.visible = n > 0;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
