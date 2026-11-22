# Elemental Mayhem

Turn-based elemental artillery battles in the browser – think *Worms*, but the
combatants are elemental spirits (Fire, Air, Earth, Water) slinging elemental
attacks across destructible terrain.

**Play:** https://elemental-mayhem.vercel.app (Vercel, auto-deploys from `main`) · **Repo:** https://github.com/janne-uitto/elemental-mayhem

> Status: **first playable prototype (v0.1)** – one map, one weapon, you vs. an AI.

## How to play

You are **Ember** 🔥 (left). Your opponent is **Tide** 💧 (right).

| Action | Touch / mouse | Keyboard |
|---|---|---|
| Walk (limited per turn – green bar) | hold **◀ / ▶** | ← / → or A / D |
| Aim | tap or drag on the battlefield – direction from Ember = angle, distance = power | ↑ / ↓ angle, W / S power |
| Shoot | **FIRE** | Space / Enter |
| Look around (when the field doesn't fit) | two-finger drag = pan, pinch = zoom | mouse wheel = zoom, right/middle-drag = pan |
| Whole-field overview on/off | **🗺** button (top-right) | M |
| Restart after a battle | **Play again** | R |

- A dotted line previews the first part of the trajectory (wind included).
- **Wind** (top centre) changes every turn and pushes the fireball sideways.
- The **fireball** blasts a crater, deals splash damage (max 42 on a direct hit,
  falling off with distance) and knocks fighters back. Big falls hurt.
- Falling into the **water** is an instant KO.
- Reduce the opponent to 0 HP to win.
- On a portrait phone the view is zoomed in and follows the action. Browse
  the field with two fingers or tap 🗺 for the whole field. Once you pan,
  auto-follow pauses until you fire or the turn changes. One finger always aims
  (adding a second finger cancels that aim). Arrows at the screen edge point
  to fighters out of view.

## Run locally

Requires Node 18+.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest unit tests (terrain, physics, game flow, AI)
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
```

## Tech stack

Vite 5 · TypeScript (strict) · plain Canvas 2D · Vitest. No runtime
dependencies, no backend. Deployed as a static site on Vercel
(framework preset: Vite, output `dist/`). A PWA manifest is included so the
game can later be wrapped for Android (TWA / Capacitor).

## Project structure

```
src/
  core/            Pure game logic – no DOM, deterministic, unit-tested
    constants.ts     All tunables (world size, gravity, damage, move budget…)
    rng.ts           Seedable PRNG (mulberry32)
    terrain.ts       Destructible pixel-mask terrain + map generator
    physics.ts       Projectile integration, impact detection, aim helpers
    character.ts     Fighters: walking, step-climbing, falling, fall damage, drowning
    ai.ts            AI shot planner (grid search + tunable inaccuracy)
    game.ts          Game state + turn state machine, explosions, win check
    camera.ts        Camera math: zoom range, clamping, pan, zoom-at, screen↔world
  render/          Canvas drawing (reads state, never changes gameplay)
    renderer.ts      Sky, terrain, fighters, aim preview, projectile, camera
    terrainLayer.ts  Mask → pixels, repaints only the dirty rect after a crater
    effects.ts       Particles, floating damage numbers, screen shake
  input/controls.ts  Pointer + keyboard → game actions
  ui/hud.ts          DOM HUD: HP bars, turn text, wind, move meter, game-over overlay
  main.ts            Glue: DOM shell, resize/fit, RAF loop
tests/             Vitest specs for src/core
public/            Favicon, PWA manifest, icons
```

## Game design notes

**Pillars:** quick, readable turns; terrain that visibly changes; elemental
identity in every weapon and fighter; one-thumb playable on a phone.

**Core loop (prototype):** move a little → aim → fire → watch the crater →
opponent replies → repeat until someone is out.

**Elements (planned):** each fighter belongs to an element and gets that
element's weapon set. Intended flavour:

| Element | Weapon ideas | Terrain interaction |
|---|---|---|
| Fire | Fireball (✅ prototype), napalm rain, flame jet | burns/carves craters, lingering fire |
| Water | Water bomb, tidal wave, ice shard | pushes, freezes surfaces (slippery), raises water level |
| Air | Gust (knockback, no damage), tornado, lightning | moves projectiles/fighters, changes wind |
| Earth | Boulder (heavy, short range), quake, build wall | **adds** terrain, bridges, cover |

An elemental strength cycle (e.g. Water > Fire > Air > Earth > Water, as in
Elemental Mastery) could give ×1.5 / ×0.67 damage.

**Turn rules (prototype):** one shot per turn; walking budget 110 units/turn;
no turn timer; wind re-rolled each turn (±45).

## Current state (v0.1)

Implemented:
- One generated island map (rolling hills, central ridge, two floating
  platforms, water on both sides) with pixel-precise destructible terrain.
- One fighter per side; walking with slope/step climbing, gravity, knockback,
  fall damage, drowning.
- Tap/drag aiming with angle + power readout and a partial trajectory preview;
  separate FIRE button.
- Projectile physics (gravity + wind), fireball with crater, splash damage,
  knockback, particles and screen shake.
- Turn system: player → AI. The AI grid-searches a shot and adds error that
  shrinks each turn, so it starts sloppy and zeroes in.
- Win/lose/draw overlay and restart.
- Responsive layout: phone portrait (zoomed, follow camera), phone landscape
  and desktop (whole map), no page scroll.
- Field browsing when it doesn't fit: two-finger pan / pinch zoom, wheel +
  right-drag on desktop, 🗺 whole-field overview toggle, one-time hint.

Known limitations:
- Single map (random seed per battle, same generator); no map select.
- One weapon; no weapon selection UI yet.
- AI never walks; it only aims.
- No sound, no turn timer.
- Zoom only goes between "whole field" and the normal follow zoom (no
  zooming in closer); on wide screens the field always fits, so browsing is off.
- Floating debris isn't simulated – terrain stays where it is after a blast.
- Partial preview always shown (no difficulty settings).

## Roadmap

1. **Feel pass:** sounds, hit-stop, better explosions, turn timer.
2. **Weapons:** weapon picker; one weapon per element (fireball, water bomb,
   gust, boulder); earth weapon that *adds* terrain.
3. **Teams:** 2–4 fighters per side, choose your element, AI that walks and
   picks weapons.
4. **Maps:** several hand-tuned themes per element (volcano, lagoon, sky
   islands, canyon), map select.
5. **Modes:** hot-seat 2-player, then progression/campaign, daily challenge.
6. **Packaging:** PWA offline cache, Android wrapper.

## Working on this repo with AI agents

See [AGENTS.md](./AGENTS.md).
