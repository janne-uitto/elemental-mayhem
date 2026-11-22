import {
  CHAR_H,
  CHAR_HALF_W,
  FALL_DAMAGE_PER_SPEED,
  FALL_DAMAGE_SPEED,
  GRAVITY,
  MAX_HP,
  MAX_STEP_UP,
  MOVE_BUDGET,
  WATER_Y,
} from './constants';
import { bodyCentre, type Vec } from './physics';
import type { Terrain } from './terrain';

export type Element = 'fire' | 'water' | 'air' | 'earth';

/**
 * A combatant. (x, y) is the feet: bottom-centre of the body.
 * The body occupies x ± CHAR_HALF_W, y - CHAR_H .. y.
 */
export interface Character {
  id: string;
  name: string;
  element: Element;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  /** 1 = facing right, -1 = left (render only). */
  facing: 1 | -1;
  /** Walk distance left this turn. */
  moveLeft: number;
  grounded: boolean;
  alive: boolean;
  /** Set when the character drowned / fell off the map this frame. */
  drowned: boolean;
}

export function createCharacter(id: string, name: string, element: Element, x: number, terrain: Terrain): Character {
  const c: Character = {
    id,
    name,
    element,
    x,
    y: 0,
    vx: 0,
    vy: 0,
    hp: MAX_HP,
    facing: 1,
    moveLeft: MOVE_BUDGET,
    grounded: false,
    alive: true,
    drowned: false,
  };
  // Drop onto the surface.
  c.y = terrain.surfaceY(x) - 1;
  c.grounded = true;
  return c;
}

/** True when the body rectangle at feet (x, y) doesn't overlap terrain (sampled). */
export function bodyFree(t: Terrain, x: number, y: number): boolean {
  for (let dy = 0; dy < CHAR_H; dy += 3) {
    for (const dx of [-CHAR_HALF_W + 1, 0, CHAR_HALF_W - 1]) {
      if (t.isSolid(x + dx, y - dy)) return false;
    }
  }
  return true;
}

/** Is there ground directly under the feet? */
export function onGround(t: Terrain, x: number, y: number): boolean {
  for (const dx of [-CHAR_HALF_W + 1, 0, CHAR_HALF_W - 1]) {
    if (t.isSolid(x + dx, y + 1)) return true;
  }
  return false;
}

/**
 * Walk in `dir` for dt seconds at `speed`, spending the move budget.
 * Climbs steps up to MAX_STEP_UP, otherwise blocked. Walking off a ledge
 * leaves the character airborne (updateBody will make it fall).
 * Returns the distance actually moved.
 */
export function walk(c: Character, t: Terrain, dir: -1 | 1, speed: number, dt: number): number {
  c.facing = dir;
  if (!c.grounded || !c.alive) return 0;
  let want = Math.min(speed * dt, c.moveLeft);
  let moved = 0;
  // Move in 1-unit sub-steps so slopes are followed smoothly.
  while (want > 0) {
    const step = Math.min(1, want);
    const nx = c.x + dir * step;
    let ny = c.y;
    if (!bodyFree(t, nx, ny)) {
      let climbed = false;
      for (let up = 1; up <= MAX_STEP_UP; up++) {
        if (bodyFree(t, nx, ny - up)) {
          ny -= up;
          climbed = true;
          break;
        }
      }
      if (!climbed) break;
    }
    // Snap down small descents so walking downhill doesn't "hop".
    for (let d = 0; d < MAX_STEP_UP && !onGround(t, nx, ny) && bodyFree(t, nx, ny + 1); d++) ny++;
    c.x = nx;
    c.y = ny;
    moved += step;
    want -= step;
    if (!onGround(t, c.x, c.y)) {
      c.grounded = false;
      break;
    }
  }
  c.moveLeft = Math.max(0, c.moveLeft - moved);
  return moved;
}

/**
 * Integrate an airborne (or knocked-back) character for one step: gravity,
 * terrain collision, landing (with fall damage) and drowning.
 * Returns fall damage taken on landing (0 if none).
 */
export function updateBody(c: Character, t: Terrain, dt: number): number {
  if (!c.alive) return 0;
  if (c.grounded) {
    if (onGround(t, c.x, c.y)) return 0;
    c.grounded = false; // ground was blown away
  }
  c.vy += GRAVITY * dt;
  let damage = 0;
  // Horizontal
  const nx = c.x + c.vx * dt;
  if (bodyFree(t, nx, c.y)) c.x = nx;
  else if (bodyFree(t, nx, c.y - 3)) {
    c.x = nx;
    c.y -= 3;
  } else c.vx = 0;
  // Vertical, in small sub-steps to avoid tunnelling.
  let dy = c.vy * dt;
  const sgn = Math.sign(dy);
  while (dy !== 0) {
    const s = sgn * Math.min(1, Math.abs(dy));
    if (s > 0 && onGround(t, c.x, c.y)) {
      // Landed.
      if (c.vy > FALL_DAMAGE_SPEED) damage = Math.round((c.vy - FALL_DAMAGE_SPEED) * FALL_DAMAGE_PER_SPEED);
      c.vy = 0;
      c.vx = 0;
      c.grounded = true;
      break;
    }
    if (s < 0 && !bodyFree(t, c.x, c.y + s)) {
      c.vy = 0; // bonked head
      break;
    }
    c.y += s;
    dy -= s;
  }
  if (c.y > WATER_Y) {
    c.alive = false;
    c.drowned = true;
    c.hp = 0;
  }
  if (damage > 0) applyDamage(c, damage);
  return damage;
}

export function applyDamage(c: Character, amount: number): void {
  c.hp = Math.max(0, c.hp - amount);
  if (c.hp <= 0) c.alive = false;
}

/** Where a projectile spawns for a given aim: just outside the body, along the aim. */
export function muzzle(c: Character, angle: number): Vec {
  const centre = bodyCentre(c.x, c.y);
  return { x: centre.x + Math.cos(angle) * 12, y: centre.y + Math.sin(angle) * 12 };
}
