/**
 * DOM HUD: top bar (HP, turn, wind), bottom controls (move meter, aim pad knob, aim readout,
 * buttons) and the game-over overlay. Updated every frame from GameState;
 * only writes to the DOM when a value actually changes.
 */
import { aimToPad } from '../core/aimpad';
import { MAX_HP, MAX_WIND, MOVE_BUDGET } from '../core/constants';
import { activeChar, isHumanTurn, PLAYER_ID, type GameState } from '../core/game';

export interface HudElements {
  hpPlayer: HTMLElement;
  hpEnemy: HTMLElement;
  hpPlayerText: HTMLElement;
  hpEnemyText: HTMLElement;
  turn: HTMLElement;
  wind: HTMLElement;
  windArrow: HTMLElement;
  move: HTMLElement;
  aim: HTMLElement;
  pad: HTMLElement;
  knob: HTMLElement;
  padLine: HTMLElement;
  left: HTMLButtonElement;
  right: HTMLButtonElement;
  fire: HTMLButtonElement;
  overlay: HTMLElement;
  overlayTitle: HTMLElement;
  overlayText: HTMLElement;
}

const cache = new WeakMap<HTMLElement, Record<string, string>>();
/** Write a DOM property only when its value changed (avoids per-frame layout work). */
function set(el: HTMLElement, prop: 'text' | 'width' | 'class' | 'transform', value: string): void {
  const prev = cache.get(el) ?? {};
  if (prev[prop] === value) return;
  prev[prop] = value;
  cache.set(el, prev);
  if (prop === 'text') el.textContent = value;
  else if (prop === 'width') el.style.width = value;
  else if (prop === 'transform') el.style.transform = value;
  else el.className = value;
}

export function updateHud(g: GameState, h: HudElements): void {
  const [p, e] = g.chars;
  set(h.hpPlayer, 'width', `${(p.hp / MAX_HP) * 100}%`);
  set(h.hpEnemy, 'width', `${(e.hp / MAX_HP) * 100}%`);
  set(h.hpPlayerText, 'text', String(p.hp));
  set(h.hpEnemyText, 'text', String(e.hp));

  const human = isHumanTurn(g);
  const c = activeChar(g);
  let turnText = '';
  if (g.phase === 'over') turnText = 'Battle over';
  else if (c.id === PLAYER_ID) turnText = g.phase === 'aim' ? (g.aimSet ? 'Your turn – Fire!' : 'Your turn – aim') : 'Fireball away…';
  else turnText = g.phase === 'ai' ? 'Tide is aiming…' : 'Incoming!';
  set(h.turn, 'text', turnText);
  set(h.turn, 'class', `turn ${c.id === PLAYER_ID ? 'mine' : 'theirs'}`);

  const w = Math.round(g.wind);
  set(h.wind, 'text', w === 0 ? 'calm' : `${Math.abs(w)}`);
  set(h.windArrow, 'text', w === 0 ? '·' : w > 0 ? '→' : '←');
  set(h.windArrow, 'class', `wind-arrow s${Math.min(3, Math.ceil((Math.abs(w) / MAX_WIND) * 3))}`);

  const pc = g.chars[0];
  set(h.move, 'width', `${(pc.moveLeft / MOVE_BUDGET) * 100}%`);
  const aim = g.aims[PLAYER_ID];
  // Display angle as elevation 0–180° measured from the right-hand horizon.
  const deg = Math.round((-aim.angle * 180) / Math.PI);
  set(h.aim, 'text', g.aimSet || !human ? `${deg}° · ${Math.round(aim.power * 100)}%` : 'drag pad to aim');

  // Aim pad: knob shows the current aim (pad drag, mouse or keyboard alike).
  const radius = h.pad.clientWidth / 2;
  const k = g.aimSet ? aimToPad(aim.angle, aim.power, radius) : { x: 0, y: 0 };
  set(h.knob, 'transform', `translate(${k.x.toFixed(1)}px, ${k.y.toFixed(1)}px)`);
  set(h.padLine, 'width', `${Math.hypot(k.x, k.y).toFixed(1)}px`);
  set(h.padLine, 'transform', `rotate(${((Math.atan2(k.y, k.x) * 180) / Math.PI).toFixed(1)}deg)`);
  set(h.pad, 'class', `pad${human ? '' : ' disabled'}${g.aimSet ? ' set' : ''}`);

  h.left.disabled = !human || pc.moveLeft <= 0;
  h.right.disabled = !human || pc.moveLeft <= 0;
  h.fire.disabled = !human || !g.aimSet;

  const over = g.phase === 'over';
  set(h.overlay, 'class', over ? 'overlay' : 'overlay hidden');
  if (over) {
    const won = g.winner === PLAYER_ID;
    set(h.overlayTitle, 'text', g.winner === 'draw' ? 'Draw!' : won ? 'Victory!' : 'Defeat');
    set(
      h.overlayText,
      'text',
      g.winner === 'draw' ? 'Both spirits fell.' : won ? 'Tide has been extinguished.' : 'Ember was put out.',
    );
  }
}
