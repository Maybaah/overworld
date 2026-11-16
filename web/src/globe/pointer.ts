export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CanvasPointer {
  x: number;
  y: number;
  w: number;
  h: number;
  nx: number;
  ny: number;
}

export function pointerToCanvas(clientX: number, clientY: number, rect: RectLike): CanvasPointer {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return { x, y, w: rect.width, h: rect.height, nx: x / rect.width, ny: y / rect.height };
}

export function isClick(downX: number, downY: number, upX: number, upY: number, slop = 5): boolean {
  return Math.hypot(upX - downX, upY - downY) <= slop;
}
