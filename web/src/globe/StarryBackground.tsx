import { useEffect, useRef } from 'react';

const FRAME_MS = 1000 / 30;
const BASE_ALTITUDE = 2.1;
const DRIFT_PER_DEGREE = 0.0036;

export interface SkyView {
  lat: number;
  lng: number;
  altitude: number;
}

export function skyStep(prev: SkyView, next: SkyView): [number, number] {
  const dLng = ((((next.lng - prev.lng) % 360) + 540) % 360) - 180;
  const k = DRIFT_PER_DEGREE * Math.sqrt(BASE_ALTITUDE / Math.max(0.02, next.altitude));
  return [dLng * k, (next.lat - prev.lat) * k];
}

export function skyZoom(altitude: number): number {
  return Math.min(1.1, Math.max(0.5, (altitude / BASE_ALTITUDE) ** 0.2));
}

const VERTEX = `attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAGMENT = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uOffset;
uniform float uZoom;
uniform float uPx;

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

vec3 stars(vec2 uv, float cells, float density, float gain, float glow, float crowd) {
  vec2 g = uv * cells;
  vec2 id = floor(g);
  if (hash(id) > density * crowd) return vec3(0.0);
  vec2 spot = (vec2(hash(id + 3.1), hash(id + 5.7)) - 0.5) * 0.6;
  float cellPx = uRes.y / (cells * uZoom);
  float d = length(fract(g) - 0.5 - spot) * cellPx;
  float size = mix(0.45, 1.25, hash(id + 7.7)) * uPx;
  float bright = gain * mix(0.15, 1.0, pow(hash(id + 9.3), 4.0));
  float twinkle = 0.8 + 0.2 * sin(uTime * (0.6 + 2.0 * hash(id + 1.9)) + 6.283 * hash(id + 4.4));
  float light = exp(-(d * d) / (size * size)) + glow * exp(-d / (3.0 * uPx));
  vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.9, 0.76), hash(id + 2.6));
  return tint * light * bright * twinkle;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * uZoom;
  vec3 c = vec3(0.035, 0.035, 0.043);
  vec2 haze = uv * 1.3 + uOffset * 0.3;
  float n = fbm(haze * 1.6);
  float band = exp(-pow(dot(haze, vec2(0.55, 0.83)) + 0.35 * (n - 0.5), 2.0) * 5.0);
  float milky = band * smoothstep(0.25, 0.8, n);
  c += vec3(0.06, 0.055, 0.11) * milky;
  float crowd = 0.35 + 1.1 * smoothstep(0.3, 0.75, fbm(haze * 0.9 + 7.0)) + 1.6 * milky;
  c += stars(uv + uOffset * 0.5, 120.0, 0.22, 0.4, 0.0, crowd);
  c += stars(uv + uOffset * 0.8 + 17.0, 50.0, 0.2, 0.75, 0.05, crowd);
  c += stars(uv + uOffset * 1.2 + 41.0, 14.0, 0.14, 1.4, 0.3, 1.0);
  gl_FragColor = vec4(c, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

export function StarryBackground({ animated, view }: { animated: boolean; view: () => SkyView | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas?.getContext('webgl', { antialias: false, depth: false, alpha: false, powerPreference: 'low-power' }) ?? null;
    } catch {
      gl = null;
    }
    if (!canvas || !gl) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(program, 'uRes');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uOffset = gl.getUniformLocation(program, 'uOffset');
    const uZoom = gl.getUniformLocation(program, 'uZoom');
    const uPx = gl.getUniformLocation(program, 'uPx');
    const offset: [number, number] = [0, 0];
    let seen: SkyView | null = null;

    const start = performance.now();
    let raf = 0;
    let last = -Infinity;
    const draw = (now: number) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const h = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, animated ? (now - start) / 1000 : 0);
      gl.uniform2f(uOffset, offset[0], offset[1]);
      gl.uniform1f(uZoom, seen ? skyZoom(seen.altitude) : 1);
      gl.uniform1f(uPx, ratio);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const follow = (): boolean => {
      const v = view();
      if (!v) return false;
      if (!seen) {
        seen = { ...v };
        return true;
      }
      if (v.lat === seen.lat && v.lng === seen.lng && v.altitude === seen.altitude) return false;
      const [dx, dy] = skyStep(seen, v);
      offset[0] += dx;
      offset[1] += dy;
      seen = { ...v };
      return true;
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const moved = follow();
      if (!moved && (!animated || now - last < FRAME_MS)) return;
      last = now;
      draw(now);
    };
    const onResize = () => draw(performance.now());
    raf = requestAnimationFrame(loop);
    draw(performance.now());
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [animated, view]);

  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: -1, width: '100%', height: '100%', display: 'block' }} />;
}
