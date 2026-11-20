import { useEffect, useRef } from 'react';

const SCALE = 0.5;
const FRAME_MS = 1000 / 30;
const BASE_ALTITUDE = 2.1;
const DRIFT_PER_DEGREE = 0.0036;

export interface SilkView {
  lat: number;
  lng: number;
  altitude: number;
}

export function silkStep(prev: SilkView, next: SilkView): [number, number] {
  const dLng = ((((next.lng - prev.lng) % 360) + 540) % 360) - 180;
  const k = DRIFT_PER_DEGREE * Math.sqrt(BASE_ALTITUDE / Math.max(0.02, next.altitude));
  return [dLng * k, (next.lat - prev.lat) * k];
}

export function silkZoom(altitude: number): number {
  return Math.min(1.1, Math.max(0.5, (altitude / BASE_ALTITUDE) ** 0.2));
}

const VERTEX = `attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAGMENT = `precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uOffset;
uniform float uZoom;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
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
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * 0.025;
  vec2 p = uv * 1.4 * uZoom + uOffset;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + 0.7 * t), fbm(p + 3.0 * q + vec2(8.3, 2.8) - 0.5 * t));
  float f = fbm(p + 3.0 * r);
  float ridge = pow(1.0 - abs(sin(f * 10.0 + r.x * 4.0)), 6.0);
  float sheen = smoothstep(0.35, 0.95, f);
  vec3 blue = vec3(0.08, 0.36, 1.0);
  vec3 violet = vec3(0.5, 0.18, 1.0);
  vec3 tint = mix(blue, violet, 0.5 + 0.5 * sin(uTime * 0.04 + q.x * 3.0));
  vec3 c = vec3(0.035, 0.035, 0.045) + tint * (ridge * 0.26 + sheen * 0.1);
  c *= 0.45 + 0.55 * smoothstep(0.1, 0.85, length(uv));
  gl_FragColor = vec4(c, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

export function SilkBackground({ animated, view }: { animated: boolean; view: () => SilkView | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext('webgl', { antialias: false, depth: false, alpha: false, powerPreference: 'low-power' });
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
    const offset: [number, number] = [0, 0];
    let seen: SilkView | null = null;

    const start = performance.now() - Math.random() * 600_000;
    let raf = 0;
    let last = -Infinity;
    const draw = (now: number) => {
      const w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
      const h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, ((animated ? now : 0) - start) / 1000);
      gl.uniform2f(uOffset, offset[0], offset[1]);
      gl.uniform1f(uZoom, seen ? silkZoom(seen.altitude) : 1);
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
      const [dx, dy] = silkStep(seen, v);
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

  return <canvas ref={ref} aria-hidden="true" className="ow-silk" style={{ position: 'absolute', inset: 0, zIndex: -1, width: '100%', height: '100%', display: 'block' }} />;
}
