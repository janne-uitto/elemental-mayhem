/**
 * Input → game actions. Touch-first (Pointer Events cover mouse, touch, pen).
 *
 *  - Tap / drag anywhere on the battlefield: aim. Direction from your
 *    character = angle, distance = power (AIM_FULL_POWER_DIST = 100 %).
 *  - Hold ◀ / ▶ buttons: walk (limited distance per turn).
 *  - FIRE button: shoot the current aim.
 *  - Two-finger drag: pan, pinch: zoom (only when the field doesn't fit).
 *    A second finger cancels the aim the first finger just made.
 *  - Mouse: wheel zoom, right- or middle-drag pan.
 *  - Keyboard: ←/→ or A/D walk, ↑/↓ angle, W/S power, Space/Enter fire,
 *    M whole-field overview, R restart.
 */
import { activeChar, fire, isHumanTurn, restoreAim, setAim, setMove, type GameState } from '../core/game';
import { aimFromPoint, bodyCentre } from '../core/physics';

/** What the input layer needs from the view (implemented by Renderer). */
export interface ViewControl {
  screenToWorld(clientX: number, clientY: number): { x: number; y: number };
  userPan(dx: number, dy: number): void;
  userZoom(factor: number, clientX: number, clientY: number): void;
  toggleOverview(): void;
  canBrowse(): boolean;
}

export interface ControlElements {
  stage: HTMLElement;
  view: ViewControl;
  left: HTMLButtonElement;
  right: HTMLButtonElement;
  fire: HTMLButtonElement;
  /** Called when the player first pans/zooms (e.g. to dismiss a hint). */
  onGesture?: () => void;
}

export function bindControls(getGame: () => GameState, el: ControlElements, onRestart: () => void): void {
  // ---- stage pointers: 1 finger / left mouse = aim; 2 fingers = pan + pinch;
  //      right/middle mouse drag = pan; wheel = zoom.
  const pointers = new Map<number, { x: number; y: number }>();
  let mode: 'none' | 'aim' | 'gesture' | 'mousepan' = 'none';
  /** Aim before the current touch started – restored if it turns into a 2-finger gesture. */
  let aimBefore: { angle: number; power: number; set: boolean } | null = null;
  let last = { cx: 0, cy: 0, dist: 0 };

  const aimAt = (clientX: number, clientY: number) => {
    const g = getGame();
    if (!isHumanTurn(g)) return;
    const c = activeChar(g);
    const { angle, power } = aimFromPoint(bodyCentre(c.x, c.y), el.view.screenToWorld(clientX, clientY));
    setAim(g, angle, power);
  };
  const twoFinger = () => {
    const [p, q] = [...pointers.values()];
    return { cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2, dist: Math.hypot(p.x - q.x, p.y - q.y) };
  };

  el.stage.addEventListener('pointerdown', (ev) => {
    if ((ev.target as HTMLElement).closest('button')) return;
    ev.preventDefault();
    el.stage.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (ev.pointerType === 'mouse' && (ev.button === 1 || ev.button === 2)) {
      mode = 'mousepan';
      last = { cx: ev.clientX, cy: ev.clientY, dist: 0 };
      el.onGesture?.();
      return;
    }
    if (pointers.size === 1) {
      const g = getGame();
      const c = activeChar(g);
      aimBefore = { ...g.aims[c.id], set: g.aimSet };
      mode = 'aim';
      aimAt(ev.clientX, ev.clientY);
    } else if (pointers.size === 2) {
      // Second finger: this is a look-around gesture, undo the accidental aim.
      if (mode === 'aim' && aimBefore) restoreAim(getGame(), aimBefore);
      mode = 'gesture';
      last = twoFinger();
      el.onGesture?.();
    }
  });
  el.stage.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (mode === 'aim') aimAt(ev.clientX, ev.clientY);
    else if (mode === 'mousepan') {
      el.view.userPan(ev.clientX - last.cx, ev.clientY - last.cy);
      last = { cx: ev.clientX, cy: ev.clientY, dist: 0 };
    } else if (mode === 'gesture' && pointers.size >= 2) {
      const now = twoFinger();
      el.view.userPan(now.cx - last.cx, now.cy - last.cy);
      if (last.dist > 10 && now.dist > 10) el.view.userZoom(now.dist / last.dist, now.cx, now.cy);
      last = now;
    }
  });
  const release = (ev: PointerEvent) => {
    pointers.delete(ev.pointerId);
    // A gesture stays a gesture until every finger is lifted (no surprise aim).
    if (pointers.size === 0) mode = 'none';
    else if (mode === 'gesture' && pointers.size === 1) last = { cx: 0, cy: 0, dist: 0 };
  };
  el.stage.addEventListener('pointerup', release);
  el.stage.addEventListener('pointercancel', release);
  el.stage.addEventListener('contextmenu', (e) => e.preventDefault());
  el.stage.addEventListener(
    'wheel',
    (ev) => {
      if (!el.view.canBrowse()) return;
      ev.preventDefault();
      el.view.userZoom(Math.exp(-ev.deltaY * 0.0015), ev.clientX, ev.clientY);
      el.onGesture?.();
    },
    { passive: false },
  );

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
    if (key === 'm') return el.view.toggleOverview();
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
