/**
 * Entry point: builds the DOM shell, wires input, runs the RAF loop.
 * Game logic lives in src/core (pure, tested); this file is glue only.
 */
import './style.css';
import { WORLD_H, WORLD_W } from './core/constants';
import { newGame, update, type GameState } from './core/game';
import { bindControls } from './input/controls';
import { Renderer } from './render/renderer';
import { updateHud, type HudElements } from './ui/hud';

const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="hud">
    <div class="fighter fire">
      <span class="name">🔥 Ember</span>
      <div class="bar"><div class="fill" id="hp-player"></div></div>
      <span class="hp" id="hp-player-text">100</span>
    </div>
    <div class="center">
      <div class="turn" id="turn"></div>
      <div class="wind">wind <span class="wind-arrow" id="wind-arrow"></span> <span id="wind"></span></div>
    </div>
    <div class="fighter water">
      <span class="hp" id="hp-enemy-text">100</span>
      <div class="bar"><div class="fill" id="hp-enemy"></div></div>
      <span class="name">Tide 💧</span>
    </div>
  </header>
  <main class="stage" id="stage">
    <canvas id="canvas" aria-label="Battlefield"></canvas>
    <div class="overlay hidden" id="overlay">
      <div class="panel">
        <h2 id="overlay-title"></h2>
        <p id="overlay-text"></p>
        <button class="btn primary" id="restart">Play again</button>
      </div>
    </div>
  </main>
  <footer class="controls">
    <button class="btn move" id="btn-left" aria-label="Move left">◀</button>
    <button class="btn move" id="btn-right" aria-label="Move right">▶</button>
    <div class="info">
      <div class="meter" title="Movement left this turn"><div class="fill" id="move"></div></div>
      <div class="aim" id="aim"></div>
    </div>
    <button class="btn fire" id="btn-fire">FIRE</button>
  </footer>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('canvas');
const stage = $('stage');
const renderer = new Renderer(canvas);

let game: GameState = newGame();
const restart = () => {
  game = newGame();
};

const hud: HudElements = {
  hpPlayer: $('hp-player'),
  hpEnemy: $('hp-enemy'),
  hpPlayerText: $('hp-player-text'),
  hpEnemyText: $('hp-enemy-text'),
  turn: $('turn'),
  wind: $('wind'),
  windArrow: $('wind-arrow'),
  move: $('move'),
  aim: $('aim'),
  left: $<HTMLButtonElement>('btn-left'),
  right: $<HTMLButtonElement>('btn-right'),
  fire: $<HTMLButtonElement>('btn-fire'),
  overlay: $('overlay'),
  overlayTitle: $('overlay-title'),
  overlayText: $('overlay-text'),
};

bindControls(() => game, { stage, toWorld: (x, y) => renderer.screenToWorld(x, y), left: hud.left, right: hud.right, fire: hud.fire }, restart);
$('restart').addEventListener('click', restart);

/**
 * Fit the canvas into the stage. Wide stages show the whole map (letterboxed).
 * Narrow / portrait stages zoom in so at least MIN_VIEW_W world units are
 * visible across, and the renderer's camera pans to follow the action.
 */
const MIN_VIEW_W = 520;
function fit(): void {
  const r = stage.getBoundingClientRect();
  const fitScale = Math.min(r.width / WORLD_W, r.height / WORLD_H);
  const zoomScale = Math.min(r.width / MIN_VIEW_W, r.height / WORLD_H);
  const scale = Math.max(fitScale, zoomScale);
  const w = Math.min(r.width, WORLD_W * scale);
  const h = Math.min(r.height, WORLD_H * scale);
  renderer.resize(Math.floor(w), Math.floor(h), scale);
}
new ResizeObserver(fit).observe(stage);
window.addEventListener('orientationchange', () => setTimeout(fit, 200));
fit();

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  update(game, dt);
  renderer.frame(game, dt);
  updateHud(game, hud);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Debug/test hook (used by headless checks and handy in the console).
(window as unknown as { __mayhem: unknown }).__mayhem = {
  get game() {
    return game;
  },
  restart,
  renderer,
};
