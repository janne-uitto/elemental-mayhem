/**
 * Aim pad (virtual joystick) mapping – pure and unit-tested.
 *
 * The knob offset from the pad centre is in screen space (y grows downward,
 * same as the world), so dragging the knob up-right aims up-right:
 *   angle = atan2(dy, dx)            (same convention as the game: -π/2 = up)
 *   power = |offset| / radius        clamped to [MIN_PAD_POWER, 1]
 */
export const MIN_PAD_POWER = 0.05;

export function padToAim(dx: number, dy: number, radius: number): { angle: number; power: number } {
  const dist = Math.hypot(dx, dy);
  return {
    angle: dist > 0 ? Math.atan2(dy, dx) : -Math.PI / 2,
    power: Math.max(MIN_PAD_POWER, Math.min(1, radius > 0 ? dist / radius : 0)),
  };
}

/** Inverse: where the knob should sit for an aim (offset from the centre, px). */
export function aimToPad(angle: number, power: number, radius: number): { x: number; y: number } {
  const r = Math.max(0, Math.min(1, power)) * radius;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}
