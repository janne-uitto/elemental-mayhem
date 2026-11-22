import { BLAST_RADIUS, SELF_HIT_GRACE } from './constants';
import { muzzle, type Character } from './character';
import { bodyCentre, launchVelocity, simulateShot, type Target } from './physics';
import type { Rng } from './rng';
import type { Terrain } from './terrain';

export interface AiPlan {
  angle: number;
  power: number;
  /** Predicted miss distance of the *un-noised* best shot (debug/tests). */
  bestError: number;
}

/**
 * Pick a shot for `shooter` at `target`.
 *
 * 1. Brute-force grid search over angle × power using the same physics as
 *    the real game (including wind), scoring by impact distance to the target
 *    and heavily penalising shots that would land near the shooter.
 * 2. Add random error scaled by `inaccuracy` (1 = sloppy, 0 = perfect) so the
 *    AI is beatable. The game lowers inaccuracy each AI turn ("zeroing in").
 */
export function planShot(
  terrain: Terrain,
  shooter: Character,
  target: Character,
  wind: number,
  rng: Rng,
  inaccuracy: number,
): AiPlan {
  const tc = bodyCentre(target.x, target.y);
  const sc = bodyCentre(shooter.x, shooter.y);
  const targets: Target[] = [
    { id: target.id, ...tc },
    { id: shooter.id, ...sc },
  ];
  let best = { angle: -Math.PI / 2, power: 0.6, score: Infinity, err: Infinity };
  // Angles across the upper half-plane (screen y-down: -PI..0 is "up").
  for (let deg = -175; deg <= -5; deg += 2.5) {
    const angle = (deg * Math.PI) / 180;
    for (let power = 0.2; power <= 1.0001; power += 0.025) {
      const { impact } = simulateShot(terrain, muzzle(shooter, angle), launchVelocity(angle, power), wind, {
        targets,
        ownerId: shooter.id,
        grace: SELF_HIT_GRACE,
        maxTime: 6,
      });
      const err = Math.hypot(impact.x - tc.x, impact.y - tc.y);
      let score = err;
      if (impact.kind === 'water' || impact.kind === 'out') score += 150;
      if (Math.hypot(impact.x - sc.x, impact.y - sc.y) < BLAST_RADIUS + 8) score += 1000;
      if (score < best.score) best = { angle, power, score, err };
    }
  }
  const k = Math.max(0, inaccuracy);
  const angle = best.angle + (rng() * 2 - 1) * 0.12 * k;
  const power = Math.max(0.15, Math.min(1, best.power + (rng() * 2 - 1) * 0.09 * k));
  return { angle, power, bestError: best.err };
}
