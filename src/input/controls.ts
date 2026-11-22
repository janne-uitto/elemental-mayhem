/**
 * Input → game actions. Touch-first (Pointer Events cover mouse, touch, pen).
 *
 *  - Tap / drag anywhere on the battlefield: aim. Direction from your
 *    character = angle, distance = power (AIM_FULL_POWER_DIST = 100 %).
 *  - Hold ◀ / ▶ buttons: walk (limited distance per turn).
 *  - FIRE button: shoot the current aim.
 *  - Keyboard: ←/→ or A/D walk, ↑/↓ angle, W/S power, Space/Enter fire, R restart.
 */
import { activeChar, fire, isHumanTurn, setAim, setMove, type GameState } from '../core/game';
import { aimFromPoint, bodyCentre } from '../core/physics';

export interface ControlElements {
  stage: HTMLElement;
  /** Client (CSS px) → world units, from the renderer (knows zoom + camera). */
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  left: HTMLButtonElement;
  right: HTMLButtonElement;
  fire: HTMLButtonElement;
}

export function bindControls(getGame: () => GameState, el: ControlElements, onRestart: () => void): void {
  // ---- aiming on the stage (whole area, so letterbox space is also a touch target)
  let aiming = false;
  const aimAt = (ev: PointerEvent) => {
    const g = getGame();
    if (!isHumanTurn(g)) return;
    const c = activeChar(g);
    const { angle, power } = aimFromPoint(bodyCentre(c.x, c.y), el.toWorld(ev.clientX, ev.clientY));
    setAim(g, angle, power);
  };
  el.stage.addEventListener('pointerdown', (ev) => {
    if ((ev.target as HTMLElement).closest('button')) return;
    aiming = true;
    el.stage.setPointerCapture(ev.pointerId);
    aimAt(ev);
    ev.preventDefault();
  });
  el.stage.addEventListener('pointermove', (ev) => {
    if (aiming) aimAt(ev);
  });
  const stopAim = () => (aiming = false);
  el.stage.addEventListener('pointerup', stopAim);
  el.stage.addEventListener('pointercancel', stopAim);

  // ---- hold-to-walk buttons
  const hold = (btn: HTMLButtonElement, dir: -1 | 1) => {
    const start = (ev: PointerEvent) => {
      ev.preventDefault();
      btn.setPointerCapture(ev.pointerId);
      btn.classList.add('held');
      setMove(getGame(), dir);
    };
    const stop = () => {
      btn.classList.remove('held');
      const g = getGame();
      if (g.moveDir === dir) setMove(g, 0);
    };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('lostpointercapture', stop);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  hold(el.left, -1);
  hold(el.right, 1);

  el.fire.addEventListener('click', () => fire(getGame()));

  // ---- keyboard (desktop bonus)
  const keysDown = new Set<string>();
  window.addEventListener('keydown', (ev) => {
    const g = getGame();
    const key = ev.key.toLowerCase();
    if (key === 'r' && g.phase === 'over') return onRestart();
    if (!isHumanTurn(g)) return;
    keysDown.add(key);
    const c = activeChar(g);
    const aim = g.aims[c.id];
    switch (key) {
      case 'arrowleft':
      case 'a':
        setMove(g, -1);
        break;
      case 'arrowright':
      case 'd':
        setMove(g, 1);
        break;
      case 'arrowup':
        // Rotate toward straight up from whichever side you're aiming.
        setAim(g, aim.angle + (Math.cos(aim.angle) >= 0 ? -1 : 1) * 0.03, aim.power);
        break;
      case 'arrowdown':
        setAim(g, aim.angle + (Math.cos(aim.angle) >= 0 ? 1 : -1) * 0.03, aim.power);
        break;
      case 'w':
        setAim(g, aim.angle, Math.min(1, aim.power + 0.02));
        break;
      case 's':
        setAim(g, aim.angle, Math.max(0.05, aim.power - 0.02));
        break;
      case ' ':
      case 'enter':
        fire(g);
        break;
      default:
        return;
    }
    ev.preventDefault();
  });
  window.addEventListener('keyup', (ev) => {
    const key = ev.key.toLowerCase();
    keysDown.delete(key);
    const g = getGame();
    const leftHeld = keysDown.has('arrowleft') || keysDown.has('a');
    const rightHeld = keysDown.has('arrowright') || keysDown.has('d');
    if (!leftHeld && !rightHeld && (key.startsWith('arrow') || key === 'a' || key === 'd')) setMove(g, 0);
  });
  window.addEventListener('blur', () => {
    keysDown.clear();
    setMove(getGame(), 0);
  });
}
