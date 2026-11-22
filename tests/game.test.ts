import { describe, expect, it } from 'vitest';
import { planShot } from '../src/core/ai';
import { createCharacter, walk } from '../src/core/character';
import { Terrain } from '../src/core/terrain';
import { CRATER_RADIUS, MAX_DAMAGE, MOVE_BUDGET, STEP, WALK_SPEED } from '../src/core/constants';
import { ENEMY_ID, explode, fire, newGame, PLAYER_ID, setAim, tick, type GameState } from '../src/core/game';
import { createRng } from '../src/core/rng';

function run(g: GameState, seconds: number) {
  for (let i = 0; i < seconds / STEP; i++) tick(g);
}

describe('game flow', () => {
  it('starts on the player turn with both fighters grounded at full HP', () => {
    const g = newGame(123);
    expect(g.phase).toBe('aim');
    expect(g.chars.map((c) => c.hp)).toEqual([100, 100]);
    run(g, 0.5);
    expect(g.chars.every((c) => c.grounded && c.alive)).toBe(true);
  });

  it('cannot fire before aiming; firing passes the turn to the AI after impact', () => {
    const g = newGame(123);
    expect(fire(g)).toBe(false);
    setAim(g, -Math.PI / 3, 0.7);
    expect(fire(g)).toBe(true);
    expect(g.phase).toBe('flying');
    run(g, 10);
    // AI got its turn (and may already have fired back).
    expect(g.turn).toBeGreaterThanOrEqual(2);
    expect(g.chars[g.active].id === ENEMY_ID || g.turn >= 3).toBe(true);
  });

  it('walking is limited per turn', () => {
    // Flat test floor so the result doesn't depend on map shape.
    const t = new Terrain(400, 200);
    for (let y = 150; y < 200; y++) for (let x = 0; x < 400; x++) t.set(x, y, true);
    const p = createCharacter('p', 'P', 'fire', 50, t);
    const x0 = p.x;
    for (let i = 0; i < 400; i++) walk(p, t, 1, WALK_SPEED, STEP);
    expect(p.moveLeft).toBe(0);
    expect(p.x - x0).toBeCloseTo(MOVE_BUDGET);
  });

  it('walking climbs small steps but is blocked by walls', () => {
    const t = new Terrain(400, 200);
    for (let y = 150; y < 200; y++) for (let x = 0; x < 400; x++) t.set(x, y, true);
    for (let y = 145; y < 150; y++) for (let x = 80; x < 400; x++) t.set(x, y, true); // 5px step
    for (let y = 100; y < 145; y++) for (let x = 120; x < 400; x++) t.set(x, y, true); // wall
    const p = createCharacter('p', 'P', 'fire', 60, t);
    for (let i = 0; i < 400; i++) walk(p, t, 1, WALK_SPEED, STEP);
    expect(p.y).toBe(144); // stood on the step
    expect(p.x).toBeLessThan(120);
    expect(p.x).toBeGreaterThan(100);
  });

  it('explosion carves a crater and deals falloff damage', () => {
    const g = newGame(9);
    const e = g.chars[1];
    const before = g.terrain.mask.reduce((a, b) => a + b, 0);
    explode(g, e.x, e.y - 10); // direct hit at body centre
    const after = g.terrain.mask.reduce((a, b) => a + b, 0);
    expect(before - after).toBeGreaterThan(Math.PI * CRATER_RADIUS * CRATER_RADIUS * 0.2);
    expect(e.hp).toBe(100 - MAX_DAMAGE);
    expect(g.chars[0].hp).toBe(100); // far away
  });

  it('game ends when a fighter reaches 0 HP', () => {
    const g = newGame(9);
    g.chars[1].hp = 1;
    setAim(g, -Math.PI / 3, 0.7);
    fire(g);
    explode(g, g.chars[1].x, g.chars[1].y - 10);
    g.projectile = null;
    run(g, 3);
    expect(g.phase).toBe('over');
    expect(g.winner).toBe(PLAYER_ID);
  });
});

describe('AI', () => {
  it('finds a shot that lands close to the target (perfect aim)', () => {
    const g = newGame(77);
    run(g, 0.3);
    const plan = planShot(g.terrain, g.chars[1], g.chars[0], 0, createRng(1), 0);
    expect(plan.bestError).toBeLessThan(25);
    expect(plan.power).toBeGreaterThan(0.15);
    expect(plan.power).toBeLessThanOrEqual(1);
  });
});
