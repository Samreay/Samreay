import type { Binding } from './layout';

// A small periodic height field, lit from the upper left. Keeping the tile in
// millimetres gives the printed grain the same scale at every resolution.
let tile: HTMLCanvasElement | undefined;
function leatherTile() {
  const cells = 9, size = 128;
  let seed = 761;
  function jitter() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return 0.13 + 0.74 * seed / 2 ** 32;
  }
  const sites = Array.from({ length: cells * cells }, () => [jitter(), jitter()]);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Bend the cell boundaries at two scales to give the grain fine wrinkles.
      const phaseX = 2 * Math.PI * x / size, phaseY = 2 * Math.PI * y / size;
      const u = x * cells / size + 0.13 * Math.sin(2 * phaseY + phaseX) + 0.045 * Math.sin(11 * phaseY);
      const v = y * cells / size + 0.16 * Math.sin(3 * phaseX - phaseY) + 0.05 * Math.sin(8 * phaseX);
      let first = Infinity, second = Infinity;
      for (let cy = Math.floor(v) - 1; cy <= Math.floor(v) + 1; cy++) {
        for (let cx = Math.floor(u) - 1; cx <= Math.floor(u) + 1; cx++) {
          const site = sites[((cy + cells) % cells) * cells + (cx + cells) % cells];
          const d = (cx + site[0] - u) ** 2 + (cy + site[1] - v) ** 2;
          if (d < first) { second = first; first = d; }
          else if (d < second) second = d;
        }
      }
      // Rounded plateaus separated by soft creases.
      heights[y * size + x] = 1 - Math.exp(-5 * (Math.sqrt(second) - Math.sqrt(first)));
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const slope = heights[i] - heights[((y + size - 1) % size) * size + (x + size - 1) % size];
      const value = Math.min(255, Math.max(160, 215 + 58 * slope + 24 * heights[i] + 7 * jitter()));
      pixels.data.set([value, value, value, 255], i * 4);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

export function textureLeather(ctx: CanvasRenderingContext2D, width: number, height: number) {
  tile ??= leatherTile();
  const pattern = ctx.createPattern(tile, 'repeat')!;
  pattern.setTransform(new DOMMatrix().scale(4.5 / tile.width));
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function drawFillets(ctx: CanvasRenderingContext2D, face: number, spine: number, height: number, binding: Exclude<Binding, 'none'>) {
  const width = spine * 0.80;
  const depth = Math.min(1, height / 25, spine / 5);
  const edgeInset = height * 0.055;
  const innerRule = 0.4 * depth, hairline = 0.11 * depth, relief = 0.075 * depth;
  const path = new Path2D();
  const line = (y: number, thickness: number) => path.rect(-width / 2, y, width, thickness);
  if (binding === 'tapered') {
    path.moveTo(-width / 2, 0);
    path.quadraticCurveTo(0, -0.25 * depth, width / 2, 0);
    path.quadraticCurveTo(0, 0.25 * depth, -width / 2, 0);
    path.closePath();
  } else if (binding === 'diamond') {
    const radius = 0.25 * depth, gap = radius + 0.13 * depth;
    path.rect(-width / 2, -0.055 * depth, width / 2 - gap, 0.11 * depth);
    path.rect(gap, -0.055 * depth, width / 2 - gap, 0.11 * depth);
    path.moveTo(-radius, 0); path.lineTo(0, -radius);
    path.lineTo(radius, 0); path.lineTo(0, radius); path.closePath();
  } else {
    line(0, (binding === 'weighted' ? 0.24 : 0.13) * depth);
    if (binding !== 'fillet') line(innerRule, hairline);
  }
  for (const direction of [1, -1]) {
    ctx.save();
    const edge = direction === 1 ? 0 : height;
    ctx.translate(face + spine / 2, edge + direction * edgeInset);
    ctx.scale(1, direction);
    ctx.fillStyle = 'rgba(238,221,199,0.17)';
    ctx.translate(0, direction * relief);
    ctx.fill(path);
    ctx.translate(0, -direction * relief);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill(path);
    ctx.restore();
  }
  // Reserve the innermost edge of the widest design, including its relief.
  // This keeps the title size consistent when comparing the five fillets.
  return edgeInset + innerRule + hairline + relief;
}
