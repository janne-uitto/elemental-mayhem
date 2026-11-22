import type { Terrain } from '../core/terrain';

/**
 * Turns the terrain mask into pixels on an offscreen canvas. Only the
 * terrain's dirty rectangle is repainted after a crater, so destruction is cheap.
 */
export class TerrainLayer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;

  constructor(private terrain: Terrain) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = terrain.width;
    this.canvas.height = terrain.height;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(terrain.width, terrain.height);
  }

  /** Repaint the dirty region (if any). Call once per frame before drawing. */
  sync(): void {
    const d = this.terrain.dirty;
    if (!d) return;
    this.terrain.dirty = null;
    const t = this.terrain;
    // Grass/edge colouring depends on pixels above, so widen the region downward.
    const x0 = Math.max(0, d.x0 - 1);
    const x1 = Math.min(t.width - 1, d.x1 + 1);
    const y0 = Math.max(0, d.y0 - 1);
    const y1 = Math.min(t.height - 1, d.y1 + 6);
    const data = this.img.data;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * t.width + x) * 4;
        if (!t.mask[y * t.width + x]) {
          data[i + 3] = 0;
          continue;
        }
        const [r, g, b] = colourAt(t, x, y);
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    this.ctx.putImageData(this.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }
}

/** Cheap deterministic per-pixel noise (0..1). */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Earth palette: mossy top, scorched crater rims, layered soil/rock below. */
function colourAt(t: Terrain, x: number, y: number): [number, number, number] {
  // Depth below the nearest air pixel straight above (max 6 checked).
  let air = 0;
  for (let k = 1; k <= 6; k++) {
    if (!t.isSolid(x, y - k)) {
      air = k;
      break;
    }
  }
  const n = hash(x >> 1, y >> 1);
  if (air > 0 && air <= 3) {
    // Surface: moss on the original ground, but any exposed surface gets it – reads well.
    const shade = 0.85 + n * 0.3;
    return [Math.round(84 * shade), Math.round(160 * shade), Math.round(70 * shade)];
  }
  if (air > 3) return [96 + n * 20, 72 + n * 14, 44 + n * 10];
  // Deep soil with horizontal strata + rock specks.
  const band = Math.sin(y * 0.09 + Math.sin(x * 0.02) * 2) * 0.5 + 0.5;
  if (n > 0.93) return [120, 116, 110];
  const base = 0.75 + band * 0.2 + n * 0.12;
  return [Math.round(122 * base), Math.round(86 * base), Math.round(54 * base)];
}
