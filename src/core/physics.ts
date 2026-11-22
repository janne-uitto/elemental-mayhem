import {
  AIM_FULL_POWER_DIST,
  CHAR_H,
  GRAVITY,
  HIT_RADIUS,
  MAX_LAUNCH_SPEED,
  STEP,
  WATER_Y,
  WORLD_W,
} from './constants';
import type { Terrain } from './terrain';

export interface Vec {
  x: number;
  y: number;
}

/** A circle a projectile can hit (character body centre). */
export interface Target {
  id: string;
  x: number;
  y: number;
}

/** Projectile state. Angles use screen space: y grows downward, so "up" is negative sin. */
export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds since launch. */
  age: number;
  ownerId: string;
}

export type ImpactKind = 'terrain' | 'character' | 'water' | 'out';

export interface Impact {
  kind: ImpactKind;
  x: number;
  y: number;
  /** id of the character hit directly (kind === 'character'). */
  targetId?: string;
}

/** Initial velocity for an aim angle (radians) and power 0..1. */
export function launchVelocity(angle: number, power: number): Vec {
  const s = Math.max(0, Math.min(1, power)) * MAX_LAUNCH_SPEED;
  return { x: Math.cos(angle) * s, y: Math.sin(angle) * s };
}

/**
 * Convert a tap position (world coords) relative to the shooter's body
 * centre into an aim: direction = angle, distance = power.
 */
export function aimFromPoint(from: Vec, to: Vec): { angle: number; power: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  return {
    angle: Math.atan2(dy, dx),
    power: Math.max(0.05, Math.min(1, dist / AIM_FULL_POWER_DIST)),
  };
}

/** Advance a projectile one fixed STEP (semi-implicit Euler). Wind is a horizontal acceleration. */
export function stepProjectile(p: Projectile, wind: number, dt = STEP): void {
  p.vx += wind * dt;
  p.vy += GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.age += dt;
}

/**
 * Check a projectile against the world after a step. Returns an impact or null.
 * `ignoreId` with `grace` lets the shooter fire without hitting itself.
 */
export function checkImpact(
  p: Projectile,
  terrain: Terrain,
  targets: readonly Target[],
  grace: number,
): Impact | null {
  for (const t of targets) {
    if (t.id === p.ownerId && p.age < grace) continue;
    if (Math.hypot(p.x - t.x, p.y - t.y) <= HIT_RADIUS) {
      return { kind: 'character', x: p.x, y: p.y, targetId: t.id };
    }
  }
  if (terrain.isSolid(p.x, p.y)) return { kind: 'terrain', x: p.x, y: p.y };
  if (p.y >= WATER_Y + 2) return { kind: 'water', x: p.x, y: p.y };
  // Far off the sides: lost. (Above the top is fine – it will come back down.)
  if (p.x < -200 || p.x > WORLD_W + 200) return { kind: 'out', x: p.x, y: p.y };
  return null;
}

/**
 * Simulate a full shot without mutating anything. Used by the trajectory
 * preview and by the AI. Returns the impact and (optionally) sampled path points.
 */
export function simulateShot(
  terrain: Terrain,
  start: Vec,
  vel: Vec,
  wind: number,
  opts: {
    targets?: readonly Target[];
    ownerId?: string;
    grace?: number;
    maxTime?: number;
    samplePath?: boolean;
    sampleEvery?: number;
  } = {},
): { impact: Impact; path: Vec[] } {
  const p: Projectile = { x: start.x, y: start.y, vx: vel.x, vy: vel.y, age: 0, ownerId: opts.ownerId ?? '' };
  const targets = opts.targets ?? [];
  const maxTime = opts.maxTime ?? 8;
  const every = opts.sampleEvery ?? 4;
  const path: Vec[] = [];
  let i = 0;
  while (p.age < maxTime) {
    stepProjectile(p, wind);
    if (opts.samplePath && i++ % every === 0) path.push({ x: p.x, y: p.y });
    const hit = checkImpact(p, terrain, targets, opts.grace ?? 0);
    if (hit) return { impact: hit, path };
  }
  return { impact: { kind: 'out', x: p.x, y: p.y }, path };
}

/** Body centre of a character whose feet are at (x, y). */
export function bodyCentre(x: number, y: number): Vec {
  return { x, y: y - CHAR_H / 2 };
}
