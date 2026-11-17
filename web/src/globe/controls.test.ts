import { describe, expect, it } from 'vitest';
import { advance, MAX_ALTITUDE, MIN_ALTITUDE, screenToGeo, type Motion, type Step } from './controls';
import * as THREE from 'three';

const still = (): Step => ({ panX: 0, panY: 0, zoom: 0, dragging: false });
const motion = (): Motion => ({ spinLat: 0, spinLng: 0, zoomTarget: null });

describe('advance', () => {
  it('moves the surface with the pointer: dragging right turns the view west', () => {
    const next = advance({ lat: 0, lng: 0, altitude: 1 }, { ...still(), panX: 100, dragging: true }, motion(), 1 / 60, 50, 800)!;
    expect(next.lng).toBeLessThan(0);
    expect(next.lat).toBeCloseTo(0);
  });

  it('never zooms closer than the floor or farther than the ceiling', () => {
    const m = motion();
    let pov = { lat: 0, lng: 0, altitude: 1 };
    pov = advance(pov, { ...still(), zoom: -50 }, m, 1 / 60, 50, 800)!;
    for (let i = 0; i < 300; i++) pov = advance(pov, still(), m, 1 / 60, 50, 800) ?? pov;
    expect(pov.altitude).toBeCloseTo(MIN_ALTITUDE, 5);
    pov = advance(pov, { ...still(), zoom: 50 }, m, 1 / 60, 50, 800)!;
    for (let i = 0; i < 300; i++) pov = advance(pov, still(), m, 1 / 60, 50, 800) ?? pov;
    expect(pov.altitude).toBeCloseTo(MAX_ALTITUDE, 5);
  });

  it('keeps spinning after release and slows to a stop', () => {
    const m = motion();
    let pov = { lat: 0, lng: 0, altitude: 1 };
    for (let i = 0; i < 10; i++) pov = advance(pov, { ...still(), panX: -20, dragging: true }, m, 1 / 60, 50, 800)!;
    const released = pov.lng;
    pov = advance(pov, still(), m, 1 / 60, 50, 800)!;
    expect(pov.lng).toBeGreaterThan(released);
    let n = 0;
    while (advance(pov, still(), m, 1 / 60, 50, 800) && n < 1000) n++;
    expect(n).toBeLessThan(1000);
  });

  it('stops short of the poles', () => {
    const next = advance({ lat: 84, lng: 0, altitude: 1 }, { ...still(), panY: 10000, dragging: true }, motion(), 1 / 60, 50, 800)!;
    expect(next.lat).toBeLessThanOrEqual(85);
  });
});

describe('screenToGeo', () => {
  it('finds the point under the centre of the screen', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 1000);
    camera.position.set(0, 0, 300);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const hit = screenToGeo(camera, 400, 400, 800, 800, 100)!;
    expect(hit.lat).toBeCloseTo(0, 5);
    expect(hit.lng).toBeCloseTo(0, 5);
    expect(screenToGeo(camera, 0, 0, 800, 800, 100)).toBeNull();
  });
});
