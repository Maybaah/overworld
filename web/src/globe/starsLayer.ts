import * as THREE from 'three';
import { GLOBE_RADIUS } from './outline';

export interface StarField {
  positions: Float32Array;
  sizes: Float32Array;
  colors: Float32Array;
  phases: Float32Array;
}

export interface StarFieldOptions {
  count: number;
  inner: number;
  outer: number;
  band: number;
  seed: number;
}

export const STAR_OPTIONS: StarFieldOptions = {
  count: 14000,
  inner: GLOBE_RADIUS * 4.4,
  outer: GLOBE_RADIUS * 22,
  band: 0.4,
  seed: 7,
};

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeStarField(o: StarFieldOptions = STAR_OPTIONS): StarField {
  const rand = random(o.seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.1, 0.3, 0.6));
  const positions = new Float32Array(o.count * 3);
  const sizes = new Float32Array(o.count);
  const colors = new Float32Array(o.count * 3);
  const phases = new Float32Array(o.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < o.count; i++) {
    if (rand() < o.band) {
      const a = rand() * Math.PI * 2;
      v.set(Math.cos(a), Math.sin(a), gauss() * 0.12).normalize().applyQuaternion(tilt);
    } else {
      const z = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      v.set(r * Math.cos(a), r * Math.sin(a), z);
    }
    const radius = o.inner + (o.outer - o.inner) * rand() ** 0.55;
    v.multiplyScalar(radius).toArray(positions, i * 3);
    const bright = rand() ** 5;
    sizes[i] = 1.4 + 4.5 * bright;
    const warm = rand();
    const c = warm < 0.7 ? [0.78, 0.86, 1] : warm < 0.92 ? [1, 1, 1] : [1, 0.86, 0.68];
    const gain = 0.55 + 0.45 * bright;
    colors[i * 3] = c[0]! * gain;
    colors[i * 3 + 1] = c[1]! * gain;
    colors[i * 3 + 2] = c[2]! * gain;
    phases[i] = rand() * Math.PI * 2;
  }
  return { positions, sizes, colors, phases };
}

const VERTEX = `attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
uniform float uPixelRatio;
uniform float uTime;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float size = aSize * uPixelRatio * (1500.0 / max(1.0, -mv.z));
  vAlpha = clamp(size / uPixelRatio, 0.4, 1.0) * (0.8 + 0.2 * sin(uTime * (0.7 + fract(aPhase) * 2.0) + aPhase));
  gl_PointSize = clamp(size, uPixelRatio, 5.0 * uPixelRatio);
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = `varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor, vAlpha * core * core);
}`;

export class StarsLayer {
  private readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;

  constructor(
    private readonly scene: THREE.Object3D,
    pixelRatio: number,
    private readonly animate: boolean,
  ) {
    const field = makeStarField();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(field.positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(field.sizes, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(field.colors, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(field.phases, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uPixelRatio: { value: pixelRatio }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -1;
    scene.add(this.points);
  }

  frame(seconds: number): void {
    if (this.animate) this.material.uniforms.uTime!.value = seconds;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
