import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { isClick, pointerToCanvas } from './pointer';
import { makeProjected, nearestPoint, projectPoints } from './picking';

describe('pointerToCanvas', () => {
  it('is the identity offset for an unscaled canvas', () => {
    const p = pointerToCanvas(150, 90, { left: 50, top: 40, width: 800, height: 600 });
    expect(p).toMatchObject({ x: 100, y: 50, w: 800, h: 600 });
    expect(p.nx).toBeCloseTo(0.125);
    expect(p.ny).toBeCloseTo(50 / 600);
  });

  it('works in visual pixels when the page is CSS-scaled', () => {
    const rect = { left: 0, top: 0, width: 960, height: 540 };
    const p = pointerToCanvas(480, 270, rect);
    expect(p.nx).toBeCloseTo(0.5);
    expect(p.ny).toBeCloseTo(0.5);
    expect(p.w).toBe(960);
  });

  it('picks the same point whatever the CSS scale or canvas pixel size', () => {
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 10000);
    camera.position.set(0, 0, 300);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
    const positions = new Float32Array([0, 0, 100, 4, 1, 99.9, -30, 10, 94]);
    const sizes = new Float32Array([10, 10, 10]);

    for (const scale of [1, 0.5, 2]) {
      const rect = { left: 10, top: 20, width: 1920 * scale, height: 1080 * scale };
      const target = positions.slice(6, 9);
      const proj = makeProjected(3);
      projectPoints(positions, vp, camera.position, rect.width, rect.height, proj);
      const clientX = rect.left + proj.x[2]!;
      const clientY = rect.top + proj.y[2]!;
      const p = pointerToCanvas(clientX, clientY, rect);
      projectPoints(positions, vp, camera.position, p.w, p.h, proj);
      expect(nearestPoint(p.x, p.y, proj, sizes)).toBe(2);
      expect(target.length).toBe(3);
    }
  });
});

describe('isClick', () => {
  it('treats small movement as a click and larger as a drag', () => {
    expect(isClick(10, 10, 12, 12)).toBe(true);
    expect(isClick(10, 10, 20, 10)).toBe(false);
  });
});
