import { describe, expect, it } from 'vitest';
import { aimToPad, MIN_PAD_POWER, padToAim } from '../src/core/aimpad';

describe('aim pad', () => {
  it('knob straight up at the rim = straight up, full power', () => {
    const a = padToAim(0, -40, 40);
    expect(a.angle).toBeCloseTo(-Math.PI / 2);
    expect(a.power).toBeCloseTo(1);
  });

  it('half-way up-right = 45° up-right, 50 % power', () => {
    const r = 40;
    const d = r / 2 / Math.SQRT2;
    const a = padToAim(d, -d, r);
    expect(a.angle).toBeCloseTo(-Math.PI / 4);
    expect(a.power).toBeCloseTo(0.5);
  });

  it('clamps power past the rim and near the centre', () => {
    expect(padToAim(-500, 0, 40).power).toBe(1);
    expect(padToAim(-500, 0, 40).angle).toBeCloseTo(Math.PI);
    expect(padToAim(0, 0, 40).power).toBe(MIN_PAD_POWER);
    expect(padToAim(0.5, 0, 40).power).toBe(MIN_PAD_POWER);
  });

  it('aimToPad is the inverse of padToAim', () => {
    const a = padToAim(12, -25, 40);
    const p = aimToPad(a.angle, a.power, 40);
    expect(p.x).toBeCloseTo(12);
    expect(p.y).toBeCloseTo(-25);
  });
});
