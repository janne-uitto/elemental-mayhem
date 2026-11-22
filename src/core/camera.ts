/**
 * 2D camera math (pure, unit-tested). The camera maps world units to the
 * canvas viewport (CSS px):  screen = (world - cam) * scale.
 *
 * - `minScale` shows the whole field ("fit"), `maxScale` is the normal
 *   follow zoom. When they are equal the field fits and browsing is off.
 * - Clamping keeps the view inside the field. If the view is wider than the
 *   field it is centred horizontally; if taller, the field sits at the bottom
 *   (extra sky on top), so the water line never floats mid-screen.
 */
import { WORLD_H, WORLD_W } from './constants';

export interface Camera {
  /** World coords of the viewport's top-left corner. */
  x: number;
  y: number;
  /** CSS px per world unit. */
  scale: number;
  /** Viewport size in CSS px. */
  viewportW: number;
  viewportH: number;
  minScale: number;
  maxScale: number;
}

export function createCamera(viewportW: number, viewportH: number, maxScale: number): Camera {
  const cam: Camera = { x: 0, y: 0, scale: maxScale, viewportW, viewportH, minScale: maxScale, maxScale };
  setViewport(cam, viewportW, viewportH, maxScale);
  return cam;
}

/** Scale at which the whole field fits the viewport. */
export function fitScale(viewportW: number, viewportH: number): number {
  return Math.min(viewportW / WORLD_W, viewportH / WORLD_H);
}

/** Update viewport size / follow zoom (on resize). Keeps the current zoom if still valid. */
export function setViewport(cam: Camera, viewportW: number, viewportH: number, maxScale: number): void {
  cam.viewportW = viewportW;
  cam.viewportH = viewportH;
  cam.maxScale = maxScale;
  const fit = Math.min(maxScale, fitScale(viewportW, viewportH));
  // Snap tiny rounding differences so a fitting field has min === max.
  cam.minScale = maxScale - fit <= maxScale * 0.02 ? maxScale : fit;
  cam.scale = clampScale(cam, cam.scale);
  clampCamera(cam);
}

/**
 * True when the whole field is (practically) visible at the follow zoom, so
 * there is nothing to browse. 2 % tolerance absorbs px rounding of the canvas.
 */
export function fieldFits(cam: Camera): boolean {
  return cam.maxScale - cam.minScale <= cam.maxScale * 0.02;
}

export function viewW(cam: Camera): number {
  return cam.viewportW / cam.scale;
}
export function viewH(cam: Camera): number {
  return cam.viewportH / cam.scale;
}

export function clampScale(cam: Camera, s: number): number {
  return Math.max(cam.minScale, Math.min(cam.maxScale, s));
}

/** Keep the view inside the field (see module doc for the oversize rules). */
export function clampCamera(cam: Camera): void {
  const w = viewW(cam);
  const h = viewH(cam);
  cam.x = w >= WORLD_W ? (WORLD_W - w) / 2 : Math.max(0, Math.min(WORLD_W - w, cam.x));
  cam.y = h >= WORLD_H ? WORLD_H - h : Math.max(0, Math.min(WORLD_H - h, cam.y));
}

/** Viewport point (CSS px, relative to the canvas top-left) → world units. */
export function screenToWorld(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: sx / cam.scale + cam.x, y: sy / cam.scale + cam.y };
}

export function worldToScreen(cam: Camera, wx: number, wy: number): { x: number; y: number } {
  return { x: (wx - cam.x) * cam.scale, y: (wy - cam.y) * cam.scale };
}

/** Pan by a screen-space drag delta (CSS px): content follows the finger. */
export function panBy(cam: Camera, dxPx: number, dyPx: number): void {
  cam.x -= dxPx / cam.scale;
  cam.y -= dyPx / cam.scale;
  clampCamera(cam);
}

/** Zoom to `scale` keeping the world point under screen (sx, sy) fixed (then clamp). */
export function zoomAt(cam: Camera, scale: number, sx: number, sy: number): void {
  const anchor = screenToWorld(cam, sx, sy);
  cam.scale = clampScale(cam, scale);
  cam.x = anchor.x - sx / cam.scale;
  cam.y = anchor.y - sy / cam.scale;
  clampCamera(cam);
}

/** Centre the view on a world x (follow-cam helper), clamped. */
export function centreOnX(cam: Camera, wx: number): void {
  cam.x = wx - viewW(cam) / 2;
  clampCamera(cam);
}
