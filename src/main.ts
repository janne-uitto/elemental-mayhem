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
    <button class="btn map hidden" id="btn-map" aria-label="Show whole field" title="Whole field (M)">🗺</button>
    <div class="hint hidden" id="hint"></div>
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

const mapBtn = $<HTMLButtonElement>('btn-map');
const hint = $('hint');
bindControls(
  () => game,
  {
    stage,
    view: renderer,
    left: hud.left,
    right: hud.right,
    fire: hud.fire,
    onGesture: () => dismissHint(),
  },
  restart,
);
mapBtn.addEventListener('click', () => {
  renderer.toggleOverview();
  dismissHint();
});

/** Show the 🗺 button only when the field doesn't fit; one-time browse hint. */
const HINT_KEY = 'mayhem.browseHintSeen';
let hintTimer = 0;
function updateBrowseUi(): void {
  const browse = renderer.canBrowse();
  mapBtn.classList.toggle('hidden', !browse);
  if (browse && !localStorage.getItem(HINT_KEY) && hint.classList.contains('hidden') && !hintTimer) {
    const touch = matchMedia('(pointer: coarse)').matches;
    hint.textContent = touch
      ? 'Two fingers to look around · 🗺 whole field'
      : 'Wheel to zoom · right-drag to pan · 🗺 whole field';
    hint.classList.remove('hidden');
    hintTimer = window.setTimeout(dismissHint, 6000);
  }
}
function dismissHint(): void {
  if (hint.classList.contains('hidden')) return;
  hint.classList.add('hidden');
  localStorage.setItem(HINT_KEY, '1');
}
$('restart').addEventListener('click', restart);

/**
 * Fit the canvas into the stage. Wide stages show the whole map (letterboxed).
 * Narrow / portrait stages zoom in so at least MIN_VIEW_W world units are
 * visible across; the camera follows the action and the player can browse
 * the whole field (two-finger pan/pinch, wheel, right-drag, 🗺 overview).
 */
const MIN_VIEW_W = 520;
function fit(): void {
  const r = stage.getBoundingClientRect();
  const fitScale = Math.min(r.width / WORLD_W, r.height / WORLD_H);
  const zoomScale = Math.min(r.width / MIN_VIEW_W, r.height / WORLD_H);
  const scale = Math.max(fitScale, zoomScale);
  // Full stage height: on tall screens the extra room shows sky above the field.
  const w = Math.min(r.width, WORLD_W * scale);
  renderer.resize(Math.floor(w), Math.floor(r.height), scale);
  updateBrowseUi();
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
  mapBtn.classList.toggle('active', renderer.mode === 'overview');
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
