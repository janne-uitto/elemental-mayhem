import { describe, expect, it } from 'vitest';
import { WORLD_H, WORLD_W } from '../src/core/constants';
import {
  clampCamera,
  createCamera,
  fieldFits,
  panBy,
  screenToWorld,
  viewH,
  viewW,
  worldToScreen,
  zoomAt,
} from '../src/core/camera';

// Portrait phone: 390×720 viewport, follow zoom 0.75 (≈520 units across).
const phone = () => createCamera(390, 720, 0.75);

describe('camera', () => {
  it('fits on a wide screen (nothing to browse)', () => {
    const s = 1229 / WORLD_W;
    const cam = createCamera(1229, 691, s);
    expect(fieldFits(cam)).toBe(true);
    expect(cam.x).toBeCloseTo(0);
  });

  it('portrait phone can browse and zoom out to the whole field', () => {
    const cam = phone();
    expect(fieldFits(cam)).toBe(false);
    expect(cam.minScale).toBeCloseTo(390 / WORLD_W);
    zoomAt(cam, 0.01, 195, 360); // way past fit → clamped
    expect(cam.scale).toBeCloseTo(cam.minScale);
    expect(viewW(cam)).toBeCloseTo(WORLD_W);
    expect(cam.x).toBeCloseTo(0);
    // Taller than the field: field sits at the bottom of the view.
    expect(cam.y + viewH(cam)).toBeCloseTo(WORLD_H);
  });

  it('never pans past the field edges', () => {
    const cam = phone();
    panBy(cam, 10000, 0);
    expect(cam.x).toBe(0);
    panBy(cam, -10000, 0);
    expect(cam.x + viewW(cam)).toBeCloseTo(WORLD_W);
    cam.x = -50;
    clampCamera(cam);
    expect(cam.x).toBe(0);
  });

  it('zoom keeps the anchor point under the finger (when not clamped)', () => {
    const cam = phone();
    cam.x = 200;
    clampCamera(cam);
    zoomAt(cam, 0.6, 195, 360);
    const before = screenToWorld(cam, 100, 300);
    zoomAt(cam, 0.7, 100, 300);
    const after = screenToWorld(cam, 100, 300);
    expect(after.x).toBeCloseTo(before.x);
    expect(cam.scale).toBeCloseTo(0.7);
  });

  it('screenToWorld and worldToScreen are inverses', () => {
    const cam = phone();
    panBy(cam, -123, 0);
    const w = screenToWorld(cam, 77, 412);
    const s = worldToScreen(cam, w.x, w.y);
    expect(s.x).toBeCloseTo(77);
    expect(s.y).toBeCloseTo(412);
  });
});
