import { backgroundDefaults, type InkEffect } from './layout';

export type RGB = [number, number, number];

export function shade(rgb: RGB, factor: number): RGB {
  return rgb.map(c => Math.min(255, Math.round(c * factor))) as RGB;
}

export function backgroundColour(sample: RGB, base: RGB, saturation: number, darkness: number): RGB {
  // The existing dark binding is the middle anchor between the sampled colour and black.
  const anchor = backgroundDefaults.darkness;
  const shaded = darkness <= anchor
    ? base.map((c, i) => c + (sample[i] - c) * (1 - darkness / anchor))
    : base.map(c => c * (100 - darkness) / (100 - anchor));
  const [r, g, b] = shaded;
  const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const high = Math.max(r, g, b), low = Math.min(r, g, b);
  if (high === low) return shaded.map(Math.round) as RGB;
  // Stop at the RGB gamut boundary to keep the sampled hue as saturation increases.
  const chroma = Math.min(saturation / 100, (255 - grey) / (high - grey), grey / (grey - low));
  return shaded.map(c => Math.round(grey + (c - grey) * chroma)) as RGB;
}
function luminance(rgb: RGB) {
  const [r, g, b] = rgb.map(v => v <= 10 ? v / 3294.6 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function legibleInk(ink: RGB, base: RGB, shadeFactor: number, minContrast: number): RGB {
  const background = luminance(base) + 0.05;
  while ((luminance(shade(ink, shadeFactor)) + 0.05) / background < minContrast)
    ink = ink.map(v => Math.round(v + (255 - v) * 0.10)) as RGB;
  return ink;
}
type Bin = { weight: number; sum: RGB };
function add(bins: Map<number, Bin>, key: number, rgb: RGB, weight: number) {
  const bin = bins.get(key) ?? { weight: 0, sum: [0, 0, 0] };
  bin.weight += weight;
  for (let c = 0; c < 3; c++) bin.sum[c] += rgb[c] * weight;
  bins.set(key, bin);
}
function winner(bins: Map<number, Bin>, fallback: RGB): RGB {
  const best = [...bins.values()].sort((a, b) => b.weight - a.weight)[0];
  return best ? best.sum.map(v => Math.round(v / best.weight)) as RGB : fallback;
}
function hueGroup([r, g, b]: RGB) {
  const hi = Math.max(r, g, b), spread = hi - Math.min(r, g, b);
  if (spread < 24) return -1;
  const hue = hi === r ? (g - b) / spread : hi === g ? 2 + (b - r) / spread : 4 + (r - g) / spread;
  return (Math.round(hue * 4) + 24) % 24;
}

type Stroke = { rgb: RGB; strength: number; y: number };

// On poster-style covers a thick red or pink letter can be darker than a
// yellow illustration. Look for repeated solid strokes bounded by near-black
// on both sides, using colour and width rather than brightness to find them.
function blockLetterInk(data: Uint8ClampedArray, w: number, h: number): RGB | undefined {
  const colours = new Map<number, Bin>();
  const top = Math.floor(h * 0.05);
  const bottom = Math.floor(h * 0.60);
  const rowStep = 2;
  for (let y = top; y < bottom; y += rowStep) {
    const row = new Map<number, Bin>();
    let lastDark = -1;
    for (let x = 0; x < w; x++) {
      const offset = (y * w + x) * 4;
      if (Math.max(data[offset], data[offset + 1], data[offset + 2]) > 55) continue;
      const width = x - lastDark - 1;
      if (lastDark >= 0 && width >= 4 && width <= w / 4) {
        const at = (fraction: number) => (y * w + lastDark + 1 + Math.floor(width * fraction)) * 4;
        const mid = at(0.5);
        const rgb: RGB = [data[mid], data[mid + 1], data[mid + 2]];
        if (Math.max(...rgb) - Math.min(...rgb) > 110 && [at(0.25), at(0.75)].every(
          p => rgb.every((channel, i) => Math.abs(channel - data[p + i]) <= 20)
        )) {
          add(row, hueGroup(rgb), rgb, 1);
        }
      }
      lastDark = x;
    }
    for (const [key, bin] of row) {
      if (bin.weight < 3) continue;
      const mean = bin.sum.map(c => c / bin.weight) as RGB;
      add(colours, key, mean, 1);
    }
  }
  // Require a consistent fill across a substantial height of the title area.
  const best = [...colours.values()].sort((a, b) => b.weight - a.weight)[0];
  if (best && best.weight * rowStep >= (bottom - top) / 4) {
    return best.sum.map(c => Math.round(c / best.weight)) as RGB;
  }
}

function quantile(sorted: number[], fraction: number) {
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function classifyInk(strokes: Stroke[], hue: number, start: number, height: number): InkEffect {
  const rows = Array.from({ length: height }, (): number[] => []);
  for (const { rgb, y, strength } of strokes) {
    const group = hueGroup(rgb);
    const distance = Math.abs(group - hue);
    // Exclude unrelated illustration colours and weak antialiased edges.
    if (strength <= 45 || (group !== hue && (group < 0 || hue < 0 || Math.min(distance, 24 - distance) > 2))) continue;
    rows[y - start].push(rgb[0] * 0.21 + rgb[1] * 0.72 + rgb[2] * 0.07);
  }
  const levels = rows.flat().sort((a, b) => a - b);
  if (levels.length < 40) return 'flat';
  // The brighter part of each row represents stroke interiors. Compare the
  // two ends of the band to separate directional shading from scattered glints.
  const profile = rows.filter(row => row.length >= 5).map(row => quantile(row.sort((a, b) => a - b), 0.7));
  if (profile.length >= 10) {
    const end = Math.ceil(profile.length / 4);
    const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
    if (Math.abs(average(profile.slice(-end)) - average(profile.slice(0, end))) >= 30) return 'gradient';
  }
  // Flat fills have a plateau of similarly bright stroke interiors, even with
  // dark outlines. Foil carries both broad midtones and brighter reflections.
  const glint = quantile(levels, 0.95) - quantile(levels, 0.70);
  const spread = quantile(levels, 0.85) - quantile(levels, 0.25);
  return glint >= 12 && spread >= 30 ? 'metallic' : 'flat';
}

function sampleBackground(data: Uint8ClampedArray, light: Float32Array, w: number, h: number, ink?: RGB): RGB {
  const colours = new Map<number, Bin>();
  let samples = 0;
  // Sample smooth patches along the edge that meets the spine.
  for (let y = 3; y < h - 3; y++) {
    for (let x = 7; x < w * 0.23; x++) {
      const p = y * w + x;
      if (Math.abs(light[p - 3] - light[p + 3]) + Math.abs(light[p - w] - light[p + w]) >= 45) continue;
      const rgb: RGB = [data[4 * p], data[4 * p + 1], data[4 * p + 2]];
      // Allow for compression and antialiasing, while retaining backgrounds
      // that share the title's hue at a distinctly different brightness.
      if (ink && rgb.every((v, i) => Math.abs(v - ink[i]) <= 48)) continue;
      const key = (rgb[0] >> 5) * 64 + (rgb[1] >> 5) * 8 + (rgb[2] >> 5);
      add(colours, key, rgb, 1);
      samples++;
    }
  }
  let best: RGB = [0, 0, 0], bestScore = 0;
  for (const { sum, weight } of colours.values()) {
    const rgb = sum.map(c => Math.round(c / weight)) as RGB;
    // A majority of the remaining surface wins, including pure black.
    if (weight > samples / 2) return rgb;
    // In variegated artwork, keep the existing preference for a coloured midtone.
    const chroma = Math.max(...rgb) - Math.min(...rgb);
    const brightness = rgb[0] * 0.21 + rgb[1] * 0.72 + rgb[2] * 0.07;
    const score = weight * (1 + chroma / 22) * (brightness < 18 ? 0.12 : 1);
    if (score > bestScore) { best = rgb; bestScore = score; }
  }
  return best;
}

export function bindingColours(image: ImageBitmap) {
  const sample = document.createElement('canvas');
  const w = sample.width = 192, h = sample.height = 288;
  const ctx = sample.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const light = new Float32Array(w * h);
  for (let p = 0; p < light.length; p++)
    light[p] = data[p * 4] * 0.21 + data[p * 4 + 1] * 0.72 + data[p * 4 + 2] * 0.07;

  const strokes: Stroke[] = [];
  const lineScores = new Float64Array(h);
  for (let y = 3; y < h - 3; y++) {
    const across = new Float32Array(12);
    for (let x = 7; x < w - 7; x++) {
      const p = y * w + x;
      const rgb: RGB = [data[4 * p], data[4 * p + 1], data[4 * p + 2]];
      const chroma = Math.max(...rgb) - Math.min(...rgb);
      // A bright letter stem often has darker pixels on *both* sides within a few pixels.
      const left = Math.min(light[p - 2], light[p - 4], light[p - 7]);
      const right = Math.min(light[p + 2], light[p + 4], light[p + 7]);
      const strength = light[p] - Math.max(left, right);
      if (strength < 35 || light[p] < 92) continue;
      across[Math.floor(x * across.length / w)] += strength * (1 + chroma / 100);
      strokes.push({ rgb, strength, y });
    }
    // Cap each column's vote so that one bright object can't dominate a line of type.
    lineScores[y] = across.reduce((sum, v) => sum + Math.min(v, 650), 0) * (y < h * 0.08 || y > h * 0.87 ? 0.72 : 1);
  }
  const bandHeight = 26;
  let bestStart = 0, bestScore = 0, score = 0;
  for (let y = 0; y < h; y++) {
    score += lineScores[y] - (y >= bandHeight ? lineScores[y - bandHeight] : 0);
    if (score > bestScore) { bestScore = score; bestStart = Math.max(0, y - bandHeight + 1); }
  }
  // Metallic lettering spans several brightness levels. Pool by hue, favouring
  // its colourful midtones over near-white glints that would wash out the ink.
  const inks = new Map<number, Bin>();
  const titleStrokes = strokes.filter(s => s.y >= bestStart && s.y < bestStart + bandHeight);
  for (const { rgb, strength } of titleStrokes) {
    const chroma = Math.max(...rgb) - Math.min(...rgb);
    add(inks, hueGroup(rgb), rgb, strength * (1 + chroma / 40) ** 2);
  }
  let ink = winner(inks, [233, 218, 192]);
  const hue = hueGroup(ink);
  const blockInk = blockLetterInk(data, w, h);
  const useBlockInk = blockInk !== undefined && hueGroup(blockInk) !== hue;
  if (useBlockInk) {
    ink = blockInk;
  } else if (hue >= 0) {
    const pigments = titleStrokes.filter(({ rgb }) => {
      const group = hueGroup(rgb), distance = Math.abs(group - hue);
      return group >= 0 && (distance <= 1 || distance === 23);
    }).map(s => s.rgb);
    const chroma = (rgb: RGB) => Math.max(...rgb) - Math.min(...rgb);
    pigments.sort((a, b) => chroma(b) - chroma(a));
    // The richest strokes carry the pigment of foil or shaded type.
    const rich = pigments.slice(0, Math.ceil(pigments.length * 0.15));
    if (rich.length) {
      const values = pigments.map(rgb => Math.max(...rgb)).sort((a, b) => a - b);
      const brightest = values[Math.floor(0.9 * values.length)];
      ink = [0, 1, 2].map(c => Math.round(rich.reduce((sum, rgb) => sum + rgb[c], 0) / rich.length)) as RGB;
      ink = shade(ink, Math.max(1, brightest / Math.max(...ink)));
    }
  }
  const sampleColour = sampleBackground(data, light, w, h, inks.size || useBlockInk ? ink : undefined);
  let base = shade(sampleColour, 0.35);
  while (luminance(base) > 0.014) base = shade(base, 0.90);
  const effect = useBlockInk ? 'flat' : classifyInk(titleStrokes, hue, bestStart, bandHeight);
  return { sampleColour, base, ink: legibleInk(ink, base, useBlockInk ? 1 : 0.87, useBlockInk ? 4.5 : 5), effect };
}
