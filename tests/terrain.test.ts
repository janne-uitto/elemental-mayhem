import { describe, expect, it } from 'vitest';
import { WATER_Y } from '../src/core/constants';
import { generateTerrain, Terrain } from '../src/core/terrain';

describe('terrain', () => {
  it('is deterministic per seed', () => {
    expect(generateTerrain(42).mask).toEqual(generateTerrain(42).mask);
    expect(generateTerrain(42).mask).not.toEqual(generateTerrain(43).mask);
  });

  it('has ground at the spawn columns and edges that sink below the water', () => {
    const t = generateTerrain(7);
    expect(t.surfaceY(150)).toBeLessThan(WATER_Y - 60);
    expect(t.surfaceY(t.width - 150)).toBeLessThan(WATER_Y - 60);
    expect(t.surfaceY(0)).toBeGreaterThan(WATER_Y);
    expect(t.surfaceY(t.width - 1)).toBeGreaterThan(WATER_Y);
  });

  it('carve removes a disc and marks the dirty rect', () => {
    const t = new Terrain(100, 100);
    t.mask.fill(1);
    const removed = t.carve(50, 50, 10);
    expect(removed).toBeGreaterThan(300); // ≈ π·10² = 314
    expect(removed).toBeLessThan(330);
    expect(t.isSolid(50, 50)).toBe(false);
    expect(t.isSolid(50, 62)).toBe(true);
    expect(t.dirty).toEqual({ x0: 40, y0: 40, x1: 60, y1: 60 });
    // Carving air again removes nothing.
    expect(t.carve(50, 50, 10)).toBe(0);
  });

  it('treats out-of-bounds as air', () => {
    const t = new Terrain(10, 10);
    t.mask.fill(1);
    expect(t.isSolid(-1, 5)).toBe(false);
    expect(t.isSolid(5, 10)).toBe(false);
  });
});
