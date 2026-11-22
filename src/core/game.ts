/**
 * Game state + turn state machine. Pure logic, no DOM: the UI calls
 * `update(g, dt)` every frame and the input layer calls the action
 * functions (setAim, setMove, fire). Rendering reads the state and
 * drains `g.events` for one-shot effects.
 *
 * Phases:
 *   aim      – active human may walk (limited budget) and aim; Fire ends it
 *   ai       – AI "thinks", animates its aim, then fires
 *   flying   – projectile in the air
 *   settling – explosion happened; wait for bodies to land, then next turn / game over
 *   over     – someone won (or draw)
 */
import { planShot } from './ai';
import {
  BLAST_RADIUS,
  CRATER_RADIUS,
  KNOCKBACK,
  MAX_DAMAGE,
  MAX_WIND,
  MOVE_BUDGET,
  SELF_HIT_GRACE,
  STEP,
  WALK_SPEED,
} from './constants';
import { applyDamage, createCharacter, muzzle, updateBody, walk, type Character } from './character';
import {
  bodyCentre,
  checkImpact,
  launchVelocity,
  stepProjectile,
  type Projectile,
} from './physics';
import { createRng, range, type Rng } from './rng';
import { generateTerrain, type Terrain } from './terrain';

export type Phase = 'aim' | 'ai' | 'flying' | 'settling' | 'over';
export type Controller = 'human' | 'ai';

export type GameEvent =
  | { type: 'explosion'; x: number; y: number; r: number }
  | { type: 'damage'; id: string; amount: number; x: number; y: number }
  | { type: 'splash'; x: number; y: number }
  | { type: 'fire'; id: string }
  | { type: 'turn'; id: string };

export interface Aim {
  angle: number;
  power: number;
}

export interface GameState {
  seed: number;
  rng: Rng;
  terrain: Terrain;
  chars: Character[];
  controllers: Record<string, Controller>;
  /** Index into chars of whose turn it is. */
  active: number;
  turn: number;
  phase: Phase;
  /** Seconds spent in the current phase. */
  phaseTime: number;
  wind: number;
  /** Current aim per character id (persists between turns for the human). */
  aims: Record<string, Aim>;
  /** Has the human set an aim this turn? (Fire is disabled until then.) */
  aimSet: boolean;
  /** -1/0/1 walk intent from input, applied each step during the aim phase. */
  moveDir: -1 | 0 | 1;
  projectile: Projectile | null;
  /** AI plan for the current AI turn (computed once). */
  aiPlan: Aim | null;
  /** How many shots the AI has taken (it gets more accurate over time). */
  aiShots: number;
  winner: string | null | 'draw';
  /** One-shot events for the renderer/audio; drained by the consumer. */
  events: GameEvent[];
  /** Fixed-step accumulator. */
  acc: number;
}

export const PLAYER_ID = 'player';
export const ENEMY_ID = 'enemy';

export function newGame(seed = Math.floor(Math.random() * 1e9)): GameState {
  const terrain = generateTerrain(seed);
  const rng = createRng(seed ^ 0x9e3779b9);
  const player = createCharacter(PLAYER_ID, 'Ember', 'fire', 150, terrain);
  const enemy = createCharacter(ENEMY_ID, 'Tide', 'water', terrain.width - 150, terrain);
  enemy.facing = -1;
  const g: GameState = {
    seed,
    rng,
    terrain,
    chars: [player, enemy],
    controllers: { [PLAYER_ID]: 'human', [ENEMY_ID]: 'ai' },
    active: 0,
    turn: 1,
    phase: 'aim',
    phaseTime: 0,
    wind: 0,
    aims: {
      [PLAYER_ID]: { angle: -Math.PI / 4, power: 0.6 },
      [ENEMY_ID]: { angle: (-3 * Math.PI) / 4, power: 0.6 },
    },
    aimSet: false,
    moveDir: 0,
    projectile: null,
    aiPlan: null,
    aiShots: 0,
    winner: null,
    events: [],
    acc: 0,
  };
  g.wind = rollWind(g.rng);
  g.events.push({ type: 'turn', id: PLAYER_ID });
  return g;
}

export function rollWind(rng: Rng): number {
  return Math.round(range(rng, -MAX_WIND, MAX_WIND));
}

export function activeChar(g: GameState): Character {
  return g.chars[g.active];
}

export function isHumanTurn(g: GameState): boolean {
  return g.phase === 'aim' && g.controllers[activeChar(g).id] === 'human';
}


// ---------------------------------------------------------------- actions

export function setAim(g: GameState, angle: number, power: number): void {
  if (!isHumanTurn(g)) return;
  const c = activeChar(g);
  g.aims[c.id] = { angle, power };
  g.aimSet = true;
  c.facing = Math.cos(angle) >= 0 ? 1 : -1;
}

export function setMove(g: GameState, dir: -1 | 0 | 1): void {
  g.moveDir = isHumanTurn(g) ? dir : 0;
}

/** Fire the active character's current aim. Returns false if not allowed. */
export function fire(g: GameState): boolean {
  if (g.phase !== 'aim' && g.phase !== 'ai') return false;
  if (g.phase === 'aim' && !g.aimSet) return false;
  const c = activeChar(g);
  if (!c.alive) return false;
  const aim = g.aims[c.id];
  const m = muzzle(c, aim.angle);
  const v = launchVelocity(aim.angle, aim.power);
  g.projectile = { x: m.x, y: m.y, vx: v.x, vy: v.y, age: 0, ownerId: c.id };
  g.moveDir = 0;
  enter(g, 'flying');
  g.events.push({ type: 'fire', id: c.id });
  return true;
}

// ---------------------------------------------------------------- simulation

/** Advance the game by real time dt (seconds); internally uses fixed STEPs. */
export function update(g: GameState, dt: number): void {
  g.acc += Math.min(dt, 0.1);
  while (g.acc >= STEP) {
    g.acc -= STEP;
    tick(g);
  }
}

/** One fixed simulation step. Exported for deterministic tests. */
export function tick(g: GameState): void {
  g.phaseTime += STEP;
  const c = activeChar(g);

  // Walking (human aim phase only).
  if (g.phase === 'aim' && g.moveDir !== 0) walk(c, g.terrain, g.moveDir, WALK_SPEED, STEP);

  // Gravity / knockback for everyone.
  for (const ch of g.chars) {
    const wasAlive = ch.alive;
    const fallDmg = updateBody(ch, g.terrain, STEP);
    if (fallDmg > 0) g.events.push({ type: 'damage', id: ch.id, amount: fallDmg, x: ch.x, y: ch.y - 24 });
    if (wasAlive && ch.drowned) g.events.push({ type: 'splash', x: ch.x, y: ch.y });
  }

  switch (g.phase) {
    case 'aim':
      // Walked off the island? Turn ends.
      if (!c.alive) enter(g, 'settling');
      break;
    case 'ai':
      runAi(g);
      break;
    case 'flying':
      stepFlying(g);
      break;
    case 'settling':
      if (g.phaseTime > 0.7 && g.chars.every((ch) => !ch.alive || ch.grounded)) endTurn(g);
      else if (g.phaseTime > 5) endTurn(g); // safety valve
      break;
    case 'over':
      break;
  }
}

function enter(g: GameState, phase: Phase): void {
  g.phase = phase;
  g.phaseTime = 0;
}

function stepFlying(g: GameState): void {
  const p = g.projectile;
  if (!p) return enter(g, 'settling');
  stepProjectile(p, g.wind);
  const targets = g.chars.filter((c) => c.alive).map((c) => ({ id: c.id, ...bodyCentre(c.x, c.y) }));
  const hit = checkImpact(p, g.terrain, targets, SELF_HIT_GRACE);
  if (!hit) return;
  g.projectile = null;
  if (hit.kind === 'terrain' || hit.kind === 'character') explode(g, hit.x, hit.y);
  else if (hit.kind === 'water') g.events.push({ type: 'splash', x: hit.x, y: hit.y });
  enter(g, 'settling');
}

/**
 * Fireball explosion: carve a crater, deal linear-falloff splash damage and
 * knock characters away from the blast centre (with an upward bias).
 */
export function explode(g: GameState, x: number, y: number): void {
  g.terrain.carve(x, y, CRATER_RADIUS);
  g.events.push({ type: 'explosion', x, y, r: CRATER_RADIUS });
  for (const c of g.chars) {
    if (!c.alive) continue;
    const centre = bodyCentre(c.x, c.y);
    const dx = centre.x - x;
    const dy = centre.y - y;
    const d = Math.hypot(dx, dy);
    if (d >= BLAST_RADIUS) continue;
    const f = 1 - d / BLAST_RADIUS;
    const dmg = Math.max(1, Math.round(MAX_DAMAGE * f));
    applyDamage(c, dmg);
    g.events.push({ type: 'damage', id: c.id, amount: dmg, x: c.x, y: c.y - 24 });
    const nx = d > 0.001 ? dx / d : 0;
    const ny = d > 0.001 ? dy / d : -1;
    c.vx += nx * KNOCKBACK * f;
    c.vy += Math.min(ny, -0.4) * KNOCKBACK * f;
    c.grounded = false;
    c.y -= 1; // unstick from the ground so the knockback applies
  }
}

function runAi(g: GameState): void {
  const me = activeChar(g);
  const foe = g.chars.find((c) => c.id !== me.id && c.alive);
  if (!foe || !me.alive) return enter(g, 'settling');
  // Short "thinking" pause so the player can see whose turn it is.
  if (g.phaseTime < 0.6) return;
  if (!g.aiPlan) {
    const inaccuracy = Math.max(0.3, 1.1 - g.aiShots * 0.2);
    g.aiPlan = planShot(g.terrain, me, foe, g.wind, g.rng, inaccuracy);
    me.facing = Math.cos(g.aiPlan.angle) >= 0 ? 1 : -1;
  }
  // Sweep the visible aim toward the plan over ~0.8 s, then fire.
  const t = Math.min(1, (g.phaseTime - 0.6) / 0.8);
  const from = g.aims[me.id];
  g.aims[me.id] = {
    angle: from.angle + (g.aiPlan.angle - from.angle) * Math.min(1, t * 0.25 + 0.05),
    power: from.power + (g.aiPlan.power - from.power) * Math.min(1, t * 0.25 + 0.05),
  };
  if (t >= 1) {
    g.aims[me.id] = { angle: g.aiPlan.angle, power: g.aiPlan.power };
    g.aiShots++;
    g.aiPlan = null;
    fire(g);
  }
}

function endTurn(g: GameState): void {
  const alive = g.chars.filter((c) => c.alive);
  if (alive.length <= 1) {
    g.winner = alive.length === 1 ? alive[0].id : 'draw';
    g.moveDir = 0;
    return enter(g, 'over');
  }
  // Next living character.
  let next = g.active;
  do next = (next + 1) % g.chars.length;
  while (!g.chars[next].alive);
  g.active = next;
  g.turn++;
  g.wind = rollWind(g.rng);
  g.aimSet = false;
  g.moveDir = 0;
  const c = g.chars[next];
  c.moveLeft = MOVE_BUDGET;
  g.events.push({ type: 'turn', id: c.id });
  enter(g, g.controllers[c.id] === 'ai' ? 'ai' : 'aim');
}
