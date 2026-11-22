# AGENTS.md

Canonical guide for AI coding agents. `CLAUDE.md` and
`.github/copilot-instructions.md` only point here. Game design, controls and
roadmap are in [README.md](./README.md).

## Overview

**Elemental Mayhem** – 2D side-view, turn-based artillery (Worms-like) with an
elemental theme. Pure client-side, no backend, no persistence yet. Mobile-first
(touch), also desktop.

Live: https://elemental-mayhem.vercel.app – Vercel project `elemental-mayhem`
(team `janne4`), auto-deploys every push to `main`.

## Commands

```bash
npm i
npm run dev     # dev server
npm test        # vitest run
npm run build   # tsc --noEmit && vite build → dist/
```

Tests and build must pass before pushing.

## Architecture rules

- **`src/core/` is pure logic**: no DOM, no `window`, no `Math.random()`
  (use the seeded `g.rng`). Everything gameplay-relevant goes here and gets a
  Vitest test in `tests/`.
- **Fixed timestep**: `update(g, dt)` accumulates real time and runs `tick(g)`
  at `STEP = 1/120 s`. The AI and the trajectory preview use the same
  `simulateShot` + `STEP`, so predictions match the real flight exactly.
- **Rendering is read-only**: `src/render/` draws state and drains
  `g.events` (explosion/damage/splash/fire/turn) for one-shot effects. Never
  change gameplay from the renderer. Cosmetic randomness there is fine.
- **Input → actions only**: `src/input/controls.ts` calls `setAim`, `setMove`,
  `fire`. Action functions validate the phase themselves.
- **All tunables live in `src/core/constants.ts`** (world size, gravity, launch
  speed, wind, move budget, crater/blast radius, damage, knockback, fall damage).

## Coordinates & conventions

- World is `WORLD_W × WORLD_H` = 960 × 540 units; 1 unit = 1 terrain pixel.
  y grows **downward**. Angles are screen-space radians: `-π/2` is straight up,
  `0` is right. Power is 0..1 (× `MAX_LAUNCH_SPEED`).
- A character's `(x, y)` is its **feet** (bottom-centre). `bodyCentre()` gives
  the hit/aim centre (`y - CHAR_H/2`).
- Terrain is a `Uint8Array` mask (`1` = solid). `carve()` marks a dirty rect;
  `TerrainLayer.sync()` repaints only that rect. Out-of-bounds is air.
- Water line `WATER_Y`: a fighter whose feet go below it drowns; a projectile
  below it splashes (no crater).
- Camera: wide screens show the whole map; narrow screens zoom so ≥ 520 units
  are visible and pan to the active fighter / projectile. Convert screen →
  world only via `renderer.screenToWorld()`.

## Turn state machine (`src/core/game.ts`)

`aim` (human walks/aims; FIRE needs an aim) → `flying` → `settling` (wait
≥ 0.7 s and until everyone has landed) → next turn (`aim` or `ai`) or `over`.
`ai`: 0.6 s pause → `planShot()` → aim animation → `fire()`.
AI inaccuracy = `max(0.3, 1.1 − 0.2 × aiShots)`.

## Debugging / testing hooks

`window.__mayhem` exposes `{ game, restart, renderer }` for console play and
headless (Playwright) checks, e.g. read `game.phase`, `game.chars[i].hp`, or
count `game.terrain.mask` pixels to confirm a crater.

## Adding things (recipes)

- **New weapon:** add stats to `constants.ts` (or a `weapons.ts` table), give
  `Projectile` a `weapon` field, branch in `stepFlying`/`explode`, draw it in
  `renderer.drawProjectile`, add a picker in the HUD, test in `tests/`.
- **More fighters:** `chars` and `controllers` already support N fighters;
  `endTurn` picks the next living one. Add spawn positions in `newGame`.
- **New map:** add a generator in `terrain.ts` (keep it seed-deterministic)
  and a test that spawn columns have ground and edges reach the water.

## Repo conventions

- Push directly to `main` while the prototype iterates (owner's call); no
  force-push.
- Keep the README "Current state" and "Known limitations" sections up to date
  when you change behaviour.
