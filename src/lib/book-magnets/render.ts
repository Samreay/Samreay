import { coverPixelsPerMm, gap, margin, type Finish, type InkEffect, type Book, type Layout } from './layout';
import { drawFillets, textureLeather } from './leather';
import { backgroundColour, bindingColours, shade, type RGB } from './palette';

const palettes = new Map<string, ReturnType<typeof bindingColours>>();

export async function loadCover(book: Book) {
  // An immutable native-resolution bitmap also isolates print resampling from
  // the browser's adaptive JPEG decoding for smaller previews of the same URL.
  const response = await fetch(book.src);
  if (!response.ok) throw new Error('Could not load the cover for ' + book.title + '.');
  const image = await createImageBitmap(await response.blob());
  let palette = palettes.get(book.src);
  if (!palette) {
    palette = bindingColours(image);
    palettes.set(book.src, palette);
  }
  return { image, ...palette };
}
type Cover = ReturnType<typeof bindingColours> & { image: ImageBitmap | HTMLCanvasElement };
const proofCovers = new Map<string, Promise<Cover>>();

// Sharing a small proof image keeps font changes fast without retaining every
// full-resolution original. Export still decodes the original cover.
export function loadProofCover(book: Book): Promise<Cover> {
  const cached = proofCovers.get(book.src);
  if (cached) return cached;
  const pending = loadCover(book).then(cover => {
    const tile = document.createElement('canvas');
    const scale = Math.min(1, 960 / Math.max(cover.image.width, cover.image.height));
    tile.width = Math.max(1, Math.round(cover.image.width * scale));
    tile.height = Math.max(1, Math.round(cover.image.height * scale));
    const ctx = tile.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cover.image, 0, 0, tile.width, tile.height);
    cover.image.close();
    return { ...cover, image: tile };
  }).catch(error => {
    if (proofCovers.get(book.src) === pending) proofCovers.delete(book.src);
    throw error;
  });
  if (proofCovers.size >= 24) proofCovers.delete(proofCovers.keys().next().value!);
  proofCovers.set(book.src, pending);
  return pending;
}

const css = (rgb: RGB) => 'rgb(' + rgb.join(',') + ')';

function letteringPaint(ctx: CanvasRenderingContext2D, ink: RGB, width: number, height: number, effect: InkEffect) {
  if (effect === 'flat' || height === 0) return css(ink);
  if (effect === 'gradient') {
    const paint = ctx.createLinearGradient(0, -height / 2, 0, height / 2);
    paint.addColorStop(0, css(ink));
    paint.addColorStop(1, css(shade(ink, 0.75)));
    return paint;
  }
  // Project the word onto a diagonal and repeat the reflection at glyph scale.
  // This keeps the shine visible on letters at both ends of long titles.
  const dx = Math.sin(Math.PI / 7), dy = Math.cos(Math.PI / 7);
  const span = width * dx + height * dy;
  const paint = ctx.createLinearGradient(-dx * span / 2, -dy * span / 2, dx * span / 2, dy * span / 2);
  const periods = Math.max(1, Math.round(span / (2 * height)));
  const highlight = ink.map(c => Math.round(c + (255 - c) * 0.58)) as RGB;
  const stops: [number, RGB][] = [[0, shade(ink, 0.82)], [0.28, ink], [0.43, highlight],
    [0.48, ink], [0.53, shade(ink, 0.73)], [0.77, ink], [1, shade(ink, 0.82)]];
  for (let period = 0; period < periods; period++)
    for (const [offset, color] of stops) paint.addColorStop((period + offset) / periods, css(color));
  return paint;
}

const minorWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);

function titleCase(title: string) {
  // Capturing the words keeps hyphens, apostrophes and punctuation in place.
  const parts = title.split(/([\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’][\p{L}\p{N}\p{M}]+)*)/u);
  const mixedCase = /\p{Ll}/u.test(title);
  return parts.map((word, i) => {
    if (i % 2 === 0) return word;
    const lower = word.toLowerCase();
    if (i > 1 && i < parts.length - 2 && minorWords.has(lower)) return lower;
    // Preserve names like BuyMort, acronyms within a title, and ordinals.
    if (/\p{Ll}.*\p{Lu}/u.test(word) || (mixedCase && word === word.toUpperCase()) || /^\d/u.test(word)) return word;
    return lower.replace(/^\p{L}/u, first => first.toUpperCase());
  }).join('');
}

export function drawWrap(ctx: CanvasRenderingContext2D, sheet: Layout, cover: Cover, title: string, family: string, finish: Finish) {
  const { height, face, spine } = sheet;
  const { binding, texture, transform } = finish;
  const colour = backgroundColour(cover.sampleColour, cover.base, finish.saturation, finish.darkness);
  const base = css(colour);
  const back = texture === 'leather' ? css(shade(colour, 0.82)) : base;
  ctx.fillStyle = back;
  ctx.fillRect(0, 0, face + spine, height);
  ctx.fillStyle = 'black';
  ctx.fillRect(face + spine, 0, face, height);
  if (texture !== 'none') {
    const background = ctx.createLinearGradient(face, 0, face + spine, 0);
    background.addColorStop(0, back);
    if (texture === 'leather') {
      // A broad, off-centre highlight gives the narrow spine a rounded profile.
      background.addColorStop(0.23, css(shade(colour, 0.97)));
      background.addColorStop(0.42, base);
      background.addColorStop(0.66, css(shade(colour, 0.96)));
    }
    background.addColorStop(1, css(shade(colour, 0.77)));
    ctx.fillStyle = background;
    ctx.fillRect(face, 0, spine, height);
  }
  if (texture === 'leather') textureLeather(ctx, face + spine, height);
  const endMargin = binding === 'none' ? height * 0.05 : drawFillets(ctx, face, spine, height, binding) + 0.75;
  ctx.save();
  ctx.translate(face + spine / 2, height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.font = (transform === 'small-caps' ? 'small-caps ' : '') + '600 100px "' + family + '"';
  ctx.letterSpacing = '2.5px'; // 0.025 em at the 100 px size used to measure and fit the title.
  const text = transform === 'uppercase' ? title.toUpperCase() : titleCase(title);
  const m = ctx.measureText(text);
  const glyphWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const glyphHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const titleLength = height - 2 * endMargin;
  const scale = Math.min(spine * 0.54 / Math.max(glyphHeight, 1), titleLength / Math.max(glyphWidth, 1));
  ctx.scale(scale, scale);
  const effect = finish.lettering === 'dynamic' ? cover.effect : finish.lettering;
  ctx.fillStyle = letteringPaint(ctx, cover.ink, glyphWidth, glyphHeight, effect);
  ctx.fillText(text, (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  ctx.restore();
  const density = coverPixelsPerMm(cover.image, sheet);
  const cropWidth = face * density, cropHeight = height * density;
  const left = (cover.image.width - cropWidth) / 2, top = (cover.image.height - cropHeight) / 2;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cover.image, left, top, cropWidth, cropHeight, face + spine, 0, face, height);
}

export function drawSheetItem(ctx: CanvasRenderingContext2D, index: number, sheet: Layout, cover: Cover, title: string, family: string, finish: Finish) {
  const { columns, wrap, height, face, spine } = sheet;
  ctx.save();
  ctx.translate(margin + index % columns * (wrap + gap), margin + Math.floor(index / columns) * (height + gap));
  drawWrap(ctx, sheet, cover, title, family, finish);
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 0.13;
  ctx.beginPath();
  for (const x of [0, face, face + spine, wrap]) {
    ctx.moveTo(x, -1.6); ctx.lineTo(x, -0.3);
    ctx.moveTo(x, height + 0.3); ctx.lineTo(x, height + 1.6);
  }
  for (const y of [0, height]) {
    ctx.moveTo(-1.6, y); ctx.lineTo(-0.3, y);
    ctx.moveTo(wrap + 0.3, y); ctx.lineTo(wrap + 1.6, y);
  }
  ctx.stroke();
  ctx.restore();
}
