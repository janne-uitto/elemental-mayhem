/**
 * Draws a GameState onto the main canvas. The world is a fixed
 * WORLD_W × WORLD_H space scaled uniformly. On wide screens the whole map
 * fits; on narrow (portrait phone) screens the view is zoomed in and a camera
 * pans horizontally to follow the action (active fighter / fireball).
 * Reads state only – never mutates gameplay (it drains g.events).
 */
import { CHAR_H, MAX_HP, WATER_Y, WORLD_H, WORLD_W } from '../core/constants';
import { muzzle, type Character, type Element } from '../core/character';
import { activeChar, isHumanTurn, type GameState } from '../core/game';
import { bodyCentre, launchVelocity, simulateShot } from '../core/physics';
import { Effects } from './effects';
import { TerrainLayer } from './terrainLayer';

const ELEMENT_COLORS: Record<Element, { body: string; dark: string; glow: string; text: string }> = {
  fire: { body: '#ff7a2f', dark: '#c2410c', glow: '#ffd27a', text: '#ffb27a' },
  water: { body: '#3aa0ff', dark: '#1d4ed8', glow: '#bde3ff', text: '#9fd2ff' },
  air: { body: '#d9f2f0', dark: '#7fb8b3', glow: '#ffffff', text: '#e6fffb' },
  earth: { body: '#a16207', dark: '#713f12', glow: '#fde68a', text: '#f0c070' },
};

export class Renderer {
  readonly effects = new Effects();
  private ctx: CanvasRenderingContext2D;
  private terrainLayer: TerrainLayer | null = null;
  private terrainRef: unknown = null;
  private time = 0;
  /** CSS pixels per world unit (set by resize). */
  scale = 1;
  /** Visible world size (units) and camera top-left (units). */
  viewW = WORLD_W;
  viewH = WORLD_H;
  camX = 0;
  camY = 0;
  private camTargetX = 0;
  private clouds = Array.from({ length: 6 }, (_, i) => ({
    x: (i * WORLD_W) / 6 + Math.random() * 80,
    y: 30 + Math.random() * 120,
    w: 60 + Math.random() * 70,
  }));
  private trail: { x: number; y: number }[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /**
   * Size the canvas for a CSS size and world scale (css px per unit).
   * The visible world area is cssW/scale × cssH/scale.
   */
  resize(cssW: number, cssH: number, scale: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.scale = scale;
    this.viewW = cssW / scale;
    this.viewH = cssH / scale;
    this.camX = this.clampCamX(this.camX);
    this.camY = Math.max(0, WORLD_H - this.viewH);
  }

  /** Convert client (CSS) coordinates to world units, honouring the camera. */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / this.scale + this.camX, y: (clientY - r.top) / this.scale + this.camY };
  }

  private clampCamX(x: number): number {
    return Math.max(0, Math.min(WORLD_W - this.viewW, x));
  }

  /** Pan the camera toward what matters right now (no-op when the whole map fits). */
  private updateCamera(g: GameState, dt: number): void {
    if (this.viewW >= WORLD_W - 1) {
      this.camX = 0;
      return;
    }
    const c = activeChar(g);
    let fx = this.camTargetX;
    if (g.projectile) fx = g.projectile.x;
    else if (g.phase === 'aim' || g.phase === 'ai') {
      // Keep the active fighter on its own side, looking toward the opponent.
      // (Independent of the aim so the view doesn't shift under a dragging finger.)
      const foe = g.chars.find((o) => o !== c && o.alive);
      const towardRight = foe ? foe.x >= c.x : true;
      fx = c.x + (towardRight ? 1 : -1) * this.viewW * 0.28;
    }
    this.camTargetX = fx;
    const target = this.clampCamX(fx - this.viewW / 2);
    this.camX += (target - this.camX) * Math.min(1, dt * (g.projectile ? 8 : 4));
  }

  /** Turn queued game events into particles/text, then draw everything. */
  frame(g: GameState, dt: number): void {
    this.time += dt;
    if (this.terrainRef !== g.terrain) {
      this.terrainLayer = new TerrainLayer(g.terrain);
      this.terrainRef = g.terrain;
      this.effects.particles = [];
      this.effects.texts = [];
    }
    this.consumeEvents(g);
    this.effects.update(dt);
    for (const c of this.clouds) {
      c.x += (g.wind * 0.4 + 4) * dt;
      if (c.x > WORLD_W + 100) c.x = -c.w - 50;
      if (c.x < -c.w - 100) c.x = WORLD_W + 50;
    }
    this.terrainLayer!.sync();
    this.updateCamera(g, dt);

    const ctx = this.ctx;
    const k = this.canvas.width / this.viewW;
    const sx = (Math.random() - 0.5) * this.effects.shake;
    const sy = (Math.random() - 0.5) * this.effects.shake;
    ctx.setTransform(k, 0, 0, k, (sx - this.camX) * k, (sy - this.camY) * k);
    ctx.imageSmoothingEnabled = false;

    this.drawSky(ctx);
    ctx.drawImage(this.terrainLayer!.canvas, 0, 0);
    this.drawAim(g, ctx);
    for (const c of g.chars) this.drawChar(g, c, ctx);
    this.drawProjectile(g, ctx);
    this.drawWater(ctx);
    this.effects.draw(ctx);
    this.drawOffscreenMarkers(g, ctx);
  }

  /** Edge arrows for fighters outside the zoomed-in view. */
  private drawOffscreenMarkers(g: GameState, ctx: CanvasRenderingContext2D): void {
    for (const c of g.chars) {
      if (!c.alive) continue;
      const left = c.x < this.camX + 4;
      const right = c.x > this.camX + this.viewW - 4;
      if (!left && !right) continue;
      const col = ELEMENT_COLORS[c.element];
      const ex = left ? this.camX + 6 : this.camX + this.viewW - 6;
      const ey = Math.max(this.camY + 30, Math.min(this.camY + this.viewH - 20, c.y - 10));
      const d = left ? -1 : 1;
      ctx.fillStyle = col.body;
      ctx.beginPath();
      ctx.moveTo(ex + d * 4, ey);
      ctx.lineTo(ex - d * 6, ey - 8);
      ctx.lineTo(ex - d * 6, ey + 8);
      ctx.fill();
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = left ? 'left' : 'right';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#120d1c';
      const label = `${c.name} ${c.hp}`;
      ctx.strokeText(label, ex - d * 8, ey - 12);
      ctx.fillStyle = col.text;
      ctx.fillText(label, ex - d * 8, ey - 12);
    }
  }

  private consumeEvents(g: GameState): void {
    for (const e of g.events) {
      if (e.type === 'explosion') {
        this.effects.burst(e.x, e.y, 46, ['#ffd27a', '#ff7a2f', '#ff3d00', '#7c4a2a', '#5b3b22'], 260, 380, 4);
        this.effects.burst(e.x, e.y, 14, ['#3a3040', '#55485c'], 70, -20, 8);
        this.effects.shake = 9;
        this.trail = [];
      } else if (e.type === 'damage') {
        this.effects.float(e.x, e.y, `-${e.amount}`, '#ffdf6b');
      } else if (e.type === 'splash') {
        this.effects.burst(e.x, WATER_Y, 24, ['#bde3ff', '#3aa0ff', '#ffffff'], 180, 420, 3);
        this.trail = [];
      } else if (e.type === 'fire') {
        this.trail = [];
      }
    }
    g.events.length = 0;
  }

  private drawSky(ctx: CanvasRenderingContext2D): void {
    const grd = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    grd.addColorStop(0, '#1b1440');
    grd.addColorStop(0.55, '#5b3a77');
    grd.addColorStop(1, '#f08a5d');
    ctx.fillStyle = grd;
    ctx.fillRect(-40, -400, WORLD_W + 80, WORLD_H + 440);
    // Distant mountains (parallax-free silhouette).
    ctx.fillStyle = '#3a2856';
    ctx.beginPath();
    ctx.moveTo(0, WORLD_H);
    for (let x = 0; x <= WORLD_W; x += 8) {
      ctx.lineTo(x, 300 + Math.sin(x * 0.011) * 40 + Math.sin(x * 0.031 + 1) * 18);
    }
    ctx.lineTo(WORLD_W, WORLD_H);
    ctx.fill();
    // Clouds drift with the wind.
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (const c of this.clouds) {
      ctx.fillRect(Math.round(c.x), Math.round(c.y), Math.round(c.w), 10);
      ctx.fillRect(Math.round(c.x + c.w * 0.2), Math.round(c.y - 8), Math.round(c.w * 0.5), 8);
    }
  }

  private drawWater(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(40,110,200,0.85)';
    ctx.beginPath();
    ctx.moveTo(0, WORLD_H + 20);
    for (let x = 0; x <= WORLD_W; x += 6) {
      ctx.lineTo(x, WATER_Y + Math.sin(x * 0.05 + this.time * 2) * 3);
    }
    ctx.lineTo(WORLD_W, WORLD_H + 20);
    ctx.fill();
    ctx.fillStyle = 'rgba(189,227,255,0.6)';
    for (let x = 0; x <= WORLD_W; x += 6) {
      ctx.fillRect(x, WATER_Y - 1 + Math.sin(x * 0.05 + this.time * 2) * 3, 4, 2);
    }
  }

  private drawChar(g: GameState, c: Character, ctx: CanvasRenderingContext2D): void {
    if (c.drowned) return;
    const col = ELEMENT_COLORS[c.element];
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    if (!c.alive) {
      // Gravestone.
      ctx.fillStyle = '#9a9aa8';
      ctx.fillRect(x - 6, y - 14, 12, 14);
      ctx.fillStyle = '#6b6b78';
      ctx.fillRect(x - 1, y - 12, 2, 8);
      ctx.fillRect(x - 4, y - 10, 8, 2);
      return;
    }
    const isActive = activeChar(g) === c && g.phase !== 'over';
    const bob = isActive ? Math.round(Math.sin(this.time * 6) * 1) : 0;
    // Glow
    ctx.fillStyle = col.glow;
    ctx.globalAlpha = 0.18 + (isActive ? 0.12 : 0);
    ctx.fillRect(x - 10, y - CHAR_H - 4 + bob, 20, CHAR_H + 4);
    ctx.globalAlpha = 1;
    // Body: chunky pixel blob, element-specific crown (flame / droplet).
    ctx.fillStyle = col.dark;
    ctx.fillRect(x - 7, y - 14 + bob, 14, 14);
    ctx.fillStyle = col.body;
    ctx.fillRect(x - 6, y - 15 + bob, 12, 13);
    if (c.element === 'fire') {
      const f = Math.round(Math.sin(this.time * 12) * 1.5);
      ctx.fillStyle = col.glow;
      ctx.fillRect(x - 4, y - 19 + bob + f, 3, 5);
      ctx.fillRect(x + 1, y - 21 + bob - f, 3, 7);
      ctx.fillStyle = col.body;
      ctx.fillRect(x - 2, y - 18 + bob, 3, 4);
    } else {
      ctx.fillStyle = col.body;
      ctx.fillRect(x - 3, y - 18 + bob, 6, 3);
      ctx.fillRect(x - 1, y - 21 + bob, 2, 3);
    }
    // Eyes look where the character faces.
    ctx.fillStyle = '#fff';
    const ex = c.facing === 1 ? 0 : -4;
    ctx.fillRect(x + ex - 1, y - 12 + bob, 3, 4);
    ctx.fillRect(x + ex + 3, y - 12 + bob, 3, 4);
    ctx.fillStyle = '#120d1c';
    const px = c.facing === 1 ? 1 : 0;
    ctx.fillRect(x + ex + px - 1 + 1, y - 11 + bob, 1, 2);
    ctx.fillRect(x + ex + px + 3 + 1, y - 11 + bob, 1, 2);

    // HP bar + name
    const w = 34;
    const hx = x - w / 2;
    const hy = y - CHAR_H - 16;
    ctx.fillStyle = 'rgba(18,13,28,0.85)';
    ctx.fillRect(hx - 1, hy - 1, w + 2, 6);
    ctx.fillStyle = c.hp > 50 ? '#4ade80' : c.hp > 25 ? '#facc15' : '#f87171';
    ctx.fillRect(hx, hy, Math.round((w * c.hp) / MAX_HP), 4);
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#120d1c';
    ctx.strokeText(`${c.name} ${c.hp}`, x, hy - 3);
    ctx.fillStyle = col.text;
    ctx.fillText(`${c.name} ${c.hp}`, x, hy - 3);
    // Active turn marker.
    if (isActive) {
      const ay = hy - 22 + Math.sin(this.time * 5) * 3;
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.moveTo(x - 5, ay);
      ctx.lineTo(x + 5, ay);
      ctx.lineTo(x, ay + 6);
      ctx.fill();
    }
  }

  /** Aim line + dotted partial trajectory preview (includes wind). */
  private drawAim(g: GameState, ctx: CanvasRenderingContext2D): void {
    const c = activeChar(g);
    const show = (isHumanTurn(g) && g.aimSet) || (g.phase === 'ai' && g.phaseTime > 0.6);
    if (!show || !c.alive) return;
    const aim = g.aims[c.id];
    const centre = bodyCentre(c.x, c.y);
    const len = 18 + aim.power * 46;
    // Power wedge
    ctx.strokeStyle = 'rgba(255,233,168,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centre.x + Math.cos(aim.angle) * 12, centre.y + Math.sin(aim.angle) * 12);
    ctx.lineTo(centre.x + Math.cos(aim.angle) * len, centre.y + Math.sin(aim.angle) * len);
    ctx.stroke();
    // Crosshair at the end
    const cx = centre.x + Math.cos(aim.angle) * len;
    const cy = centre.y + Math.sin(aim.angle) * len;
    ctx.strokeStyle = '#ff7a2f';
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(cx) - 4, Math.round(cy) - 4, 8, 8);
    if (g.phase !== 'aim') return;
    // Preview only the first ~40 % of flight so aiming still needs judgement.
    const { path } = simulateShot(g.terrain, muzzle(c, aim.angle), launchVelocity(aim.angle, aim.power), g.wind, {
      samplePath: true,
      sampleEvery: 5,
      maxTime: 0.35 + aim.power * 0.45,
    });
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    path.forEach((p, i) => {
      const s = i % 2 === 0 ? 3 : 2;
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, s, s);
    });
  }

  private drawProjectile(g: GameState, ctx: CanvasRenderingContext2D): void {
    const p = g.projectile;
    if (!p) return;
    this.trail.push({ x: p.x, y: p.y });
    if (this.trail.length > 18) this.trail.shift();
    this.trail.forEach((t, i) => {
      const a = i / this.trail.length;
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = i % 2 ? '#ff3d00' : '#ffb000';
      const s = 2 + a * 4;
      ctx.fillRect(t.x - s / 2, t.y - s / 2, s, s);
    });
    ctx.globalAlpha = 1;
    if (Math.random() < 0.5) this.effects.burst(p.x, p.y, 1, ['#ffd27a', '#ff7a2f'], 30, -40, 3);
    ctx.fillStyle = '#ff7a2f';
    ctx.fillRect(Math.round(p.x) - 5, Math.round(p.y) - 5, 10, 10);
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 3, 6, 6);
    // Off-screen indicator when the fireball is above the top edge.
    if (p.y < 0) {
      ctx.fillStyle = '#ffd27a';
      ctx.beginPath();
      ctx.moveTo(p.x - 6, 10);
      ctx.lineTo(p.x + 6, 10);
      ctx.lineTo(p.x, 2);
      ctx.fill();
    }
  }
}
