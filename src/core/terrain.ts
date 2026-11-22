import { WATER_Y, WORLD_H, WORLD_W } from './constants';
import { createRng, range } from './rng';

/**
 * Destructible terrain as a 1-byte-per-pixel solid mask.
 * 0 = air, 1 = solid. Pure data – the renderer turns it into pixels.
 */
export class Terrain {
  readonly width: number;
  readonly height: number;
  readonly mask: Uint8Array;
  /** Bounding box of pixels changed since the renderer last consumed it (null = none). */
  dirty: { x0: number; y0: number; x1: number; y1: number } | null = null;

  constructor(width: number, height: number, mask?: Uint8Array) {
    this.width = width;
    this.height = height;
    this.mask = mask ?? new Uint8Array(width * height);
  }

  /** Is (x, y) solid? Out-of-bounds is air (so things can fly off the sides / top). */
  isSolid(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return false;
    return this.mask[iy * this.width + ix] === 1;
  }

  set(x: number, y: number, solid: boolean): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.mask[y * this.width + x] = solid ? 1 : 0;
  }

  /** Y of the first solid pixel in column x scanning from the top, or `height` if none. */
  surfaceY(x: number): number {
    const ix = Math.floor(x);
    if (ix < 0 || ix >= this.width) return this.height;
    for (let y = 0; y < this.height; y++) if (this.mask[y * this.width + ix]) return y;
    return this.height;
  }

  /** Remove a disc of terrain. Returns how many pixels were removed. */
  carve(cx: number, cy: number, r: number): number {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r));
    const r2 = r * r;
    let removed = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) {
          const i = y * this.width + x;
          if (this.mask[i]) {
            this.mask[i] = 0;
            removed++;
          }
        }
      }
    }
    if (x0 <= x1 && y0 <= y1) this.markDirty(x0, y0, x1, y1);
    return removed;
  }

  markDirty(x0: number, y0: number, x1: number, y1: number): void {
    if (!this.dirty) this.dirty = { x0, y0, x1, y1 };
    else {
      this.dirty.x0 = Math.min(this.dirty.x0, x0);
      this.dirty.y0 = Math.min(this.dirty.y0, y0);
      this.dirty.x1 = Math.max(this.dirty.x1, x1);
      this.dirty.y1 = Math.max(this.dirty.y1, y1);
    }
  }

  clone(): Terrain {
    return new Terrain(this.width, this.height, this.mask.slice());
  }
}

/**
 * Generate the single prototype map: rolling hills with a central ridge,
 * edges that slope into the water, and a couple of floating rock islands.
 * Same seed → same map.
 */
export function generateTerrain(seed = 1, width = WORLD_W, height = WORLD_H): Terrain {
  const rng = createRng(seed);
  const t = new Terrain(width, height);
  const p1 = range(rng, 0, Math.PI * 2);
  const p2 = range(rng, 0, Math.PI * 2);
  const p3 = range(rng, 0, Math.PI * 2);
  for (let x = 0; x < width; x++) {
    const u = x / width;
    let h =
      height * 0.6 +
      Math.sin(u * Math.PI * 2 * 1.3 + p1) * 28 +
      Math.sin(u * Math.PI * 2 * 3.1 + p2) * 14 +
      Math.sin(u * Math.PI * 2 * 7.3 + p3) * 5;
    // Central ridge so shots have to arc over something.
    const dm = (u - 0.5) / 0.12;
    h -= 95 * Math.exp(-dm * dm);
    // Edges dive under the water so you can fall off the island.
    const edge = Math.min(u, 1 - u);
    if (edge < 0.06) h += ((0.06 - edge) / 0.06) * (WATER_Y - h + 40);
    const top = Math.max(0, Math.floor(h));
    for (let y = top; y < height; y++) t.set(x, y, true);
  }
  // Floating islands (destructible platforms).
  addBlob(t, width * 0.3, height * 0.3, 42, 9);
  addBlob(t, width * 0.71, height * 0.27, 38, 8);
  t.dirty = { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  return t;
}

/** Fill a flattened ellipse (rx, ry). */
function addBlob(t: Terrain, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) t.set(x, y, true);
    }
  }
}
