import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeProjected, nearestPoint, projectPoints } from './picking';

function setup() {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 10000);
  camera.position.set(0, 0, 300);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  return { camera, vp: vp.elements };
}

describe('projectPoints', () => {
  it('projects the facing point to the screen centre and hides the far side', () => {
    const { camera, vp } = setup();
    const positions = new Float32Array([0, 0, 100, 0, 0, -100]);
    const out = makeProjected(2);
    projectPoints(positions, vp, camera.position, 800, 800, out);
    expect(Array.from(out.visible)).toEqual([1, 0]);
    expect(out.x[0]).toBeCloseTo(400, 3);
    expect(out.y[0]).toBeCloseTo(400, 3);
  });

  it('hides points past the horizon', () => {
    const { camera, vp } = setup();
    const positions = new Float32Array([100, 0, 0.5]);
    const out = makeProjected(1);
    projectPoints(positions, vp, camera.position, 800, 800, out);
    expect(out.visible[0]).toBe(0);
  });

  it('puts points above the centre at smaller y', () => {
    const { camera, vp } = setup();
    const positions = new Float32Array([0, 50, 86]);
    const out = makeProjected(1);
    projectPoints(positions, vp, camera.position, 800, 800, out);
    expect(out.y[0]).toBeLessThan(400);
  });
});

describe('nearestPoint', () => {
  const projected = makeProjected(3);
  projected.x.set([100, 110, 300]);
  projected.y.set([100, 100, 300]);
  projected.visible.set([1, 1, 1]);

  it('returns the closest visible point within the radius', () => {
    expect(nearestPoint(108, 100, projected, new Float32Array([5, 5, 5]))).toBe(1);
    expect(nearestPoint(102, 101, projected, new Float32Array([5, 5, 5]))).toBe(0);
  });

  it('returns -1 when nothing is within 12 px', () => {
    expect(nearestPoint(200, 200, projected, new Float32Array([5, 5, 5]))).toBe(-1);
    expect(nearestPoint(100, 113, projected, new Float32Array([5, 0, 5]))).toBe(-1);
  });

  it('ignores invisible points and zero-size points', () => {
    const p = makeProjected(2);
    p.x.set([50, 52]);
    p.y.set([50, 50]);
    p.visible.set([1, 0]);
    expect(nearestPoint(52, 50, p, new Float32Array([5, 5]))).toBe(0);
    expect(nearestPoint(50, 50, p, new Float32Array([0, 5]))).toBe(-1);
  });

  it('lets large points be hit from further away than 12 px', () => {
    const p = makeProjected(1);
    p.x.set([0]);
    p.y.set([0]);
    p.visible.set([1]);
    expect(nearestPoint(20, 0, p, new Float32Array([40]))).toBe(0);
  });
});
