import { describe, expect, it } from 'vitest';
import { AIM_FULL_POWER_DIST, GRAVITY, MAX_LAUNCH_SPEED, STEP } from '../src/core/constants';
import { aimFromPoint, launchVelocity, simulateShot, stepProjectile } from '../src/core/physics';
import { Terrain } from '../src/core/terrain';

describe('physics', () => {
  it('launch velocity follows angle and power', () => {
    const v = launchVelocity(0, 1);
    expect(v.x).toBeCloseTo(MAX_LAUNCH_SPEED);
    expect(v.y).toBeCloseTo(0);
    const up = launchVelocity(-Math.PI / 2, 0.5);
    expect(up.y).toBeCloseTo(-MAX_LAUNCH_SPEED / 2);
  });

  it('tap distance maps to power and is clamped', () => {
    const a = aimFromPoint({ x: 0, y: 0 }, { x: AIM_FULL_POWER_DIST / 2, y: 0 });
    expect(a.power).toBeCloseTo(0.5);
    expect(a.angle).toBeCloseTo(0);
    expect(aimFromPoint({ x: 0, y: 0 }, { x: 0, y: -9999 }).power).toBe(1);
    expect(aimFromPoint({ x: 0, y: 0 }, { x: 0, y: 0 }).power).toBe(0.05);
  });

  it('gravity integrates (semi-implicit Euler)', () => {
    const p = { x: 0, y: 0, vx: 0, vy: 0, age: 0, ownerId: '' };
    for (let i = 0; i < 120; i++) stepProjectile(p, 0);
    expect(p.vy).toBeCloseTo(GRAVITY, 3);
    // y ≈ ½gt² (slightly more with semi-implicit Euler)
    expect(p.y).toBeGreaterThan(GRAVITY / 2);
    expect(p.y).toBeLessThan(GRAVITY / 2 + GRAVITY * STEP);
  });

  it('wind pushes the projectile sideways', () => {
    const calm = { x: 0, y: 0, vx: 0, vy: 0, age: 0, ownerId: '' };
    const windy = { ...calm };
    for (let i = 0; i < 60; i++) {
      stepProjectile(calm, 0);
      stepProjectile(windy, 40);
    }
    expect(calm.x).toBe(0);
    expect(windy.x).toBeGreaterThan(0);
  });

  it('a lobbed shot lands on flat ground near the analytic range', () => {
    const t = new Terrain(2000, 400);
    for (let y = 300; y < 400; y++) for (let x = 0; x < 2000; x++) t.set(x, y, true);
    const angle = -Math.PI / 4;
    const power = 0.6;
    const { impact } = simulateShot(t, { x: 100, y: 299 }, launchVelocity(angle, power), 0);
    expect(impact.kind).toBe('terrain');
    const v = MAX_LAUNCH_SPEED * power;
    const range = (v * v) / GRAVITY; // sin(2·45°) = 1
    expect(Math.abs(impact.x - 100 - range)).toBeLessThan(8);
  });

  it('detects a direct character hit', () => {
    const t = new Terrain(500, 300);
    const { impact } = simulateShot(t, { x: 0, y: 100 }, { x: 600, y: 0 }, 0, {
      targets: [{ id: 'foe', x: 100, y: 100 }],
      maxTime: 2,
    });
    expect(impact.kind).toBe('character');
    expect(impact.targetId).toBe('foe');
  });
});
