import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SilkBackground } from './SilkBackground';

describe('SilkBackground', () => {
  it('renders a hidden canvas behind the globe and survives a browser without WebGL', () => {
    const { container, unmount } = render(<SilkBackground animated />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(canvas.style.zIndex).toBe('-1');
    unmount();
  });
});
