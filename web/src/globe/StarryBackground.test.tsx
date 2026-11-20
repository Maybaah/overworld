import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { skyStep, skyZoom, StarryBackground } from './StarryBackground';

describe('StarryBackground', () => {
  it('renders a hidden canvas behind the globe and survives a browser without WebGL', () => {
    const { container, unmount } = render(<StarryBackground animated view={() => null} />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(canvas.style.zIndex).toBe('-1');
    unmount();
  });

  it('drifts the same way as the globe, across the date line, faster when zoomed in', () => {
    const [east] = skyStep({ lat: 0, lng: 10, altitude: 2.1 }, { lat: 0, lng: 20, altitude: 2.1 });
    expect(east).toBeGreaterThan(0);
    const [wrap] = skyStep({ lat: 0, lng: 175, altitude: 2.1 }, { lat: 0, lng: -175, altitude: 2.1 });
    expect(wrap).toBeCloseTo(east, 6);
    const [near] = skyStep({ lat: 0, lng: 10, altitude: 0.2 }, { lat: 0, lng: 20, altitude: 0.2 });
    expect(near).toBeGreaterThan(east);
    const [, north] = skyStep({ lat: 0, lng: 0, altitude: 2.1 }, { lat: 5, lng: 0, altitude: 2.1 });
    expect(north).toBeGreaterThan(0);
    expect(skyZoom(0.1)).toBeLessThan(skyZoom(2.1));
  });
});
