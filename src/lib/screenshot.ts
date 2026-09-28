/**
 * Client-side screenshot export for the reviews page (ADR-011).
 *
 * snapdom is dynamically imported inside `captureElement` so Vite splits it
 * into its own chunk: the library costs nothing at page load and is only
 * fetched the first time a capture is requested.
 */

/** WebP hard limit is 16 383 px per side. */
const MAX_SIDE = 8_000;
/** Safari silently produces a blank bitmap above ~16.7 MP of canvas area. */
const MAX_PIXELS = 16_000_000;
const WEBP_QUALITY = 0.9;

function exportSource(img: HTMLImageElement, scale: number): string {
  const needed = img.getBoundingClientRect().width * scale;
  const candidates = img.srcset.split(',').map(candidate => {
    const [src, descriptor] = candidate.trim().split(/\s+/);
    return { src, width: Number.parseInt(descriptor, 10) };
  }).filter(candidate => candidate.src && candidate.width > 0)
    .sort((a, b) => a.width - b.width);
  return (candidates.find(candidate => candidate.width >= needed) ?? candidates.at(-1))?.src ?? img.src;
}

/**
 * devicePixelRatio bakes browser zoom into the multiplier on desktop, so a
 * dpr-derived scale "respects zoom" for free. Floor at 1 so zoomed-out
 * captures aren't blurry, cap at 2, then shrink to fit the pixel budget.
 */
function computeScale(width: number, height: number): number {
  const base = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
  return Math.min(
    base,
    MAX_SIDE / width,
    MAX_SIDE / height,
    Math.sqrt(MAX_PIXELS / (width * height))
  );
}

/**
 * Safari cannot encode WebP from a canvas and silently returns a PNG blob,
 * possibly still labelled as webp — so sniff magic bytes, not `blob.type`.
 */
async function extensionFor(blob: Blob): Promise<'webp' | 'png'> {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' ? 'webp' : 'png';
}

/**
 * Capture `el` in full (including parts scrolled out of view) and download it
 * as `reviews-{layout}-{date}.webp` (`.png` on browsers without canvas WebP
 * encoding). No-op when the element is empty (e.g. a filter matched nothing).
 */
export async function captureElement(
  el: HTMLElement,
  layout: string
): Promise<void> {
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;

  const scale = computeScale(rect.width, rect.height);
  const targetWidth = Math.round(rect.width * scale);
  const targetHeight = Math.round(rect.height * scale);
  const { snapdom } = await import('@zumer/snapdom');

  const cards = new Map(Array.from(el.querySelectorAll<HTMLElement>('[data-review-card]')).map(card => {
    const img = card.querySelector('img');
    return [card.querySelector('a')!.getAttribute('href'), {
      rect: card.getBoundingClientRect(), src: img ? exportSource(img, scale) : undefined,
    }];
  }));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('screenshot: canvas is unavailable');

  // A full wide list exceeds SVG decode limits even when its final bitmap
  // fits. Rasterize bounded regions, then join them at the final export scale.
  const tileHeight = 4000;
  for (let top = 0; top < rect.height; top += tileHeight) {
    const height = Math.min(tileHeight, rect.height - top);
    const y = Math.round(top * scale);
    const bottom = Math.round((top + height) * scale);
    const result = await snapdom(el, {
      dpr: 1,
      width: targetWidth,
      height: bottom - y,
      clip: { x: rect.left + window.scrollX, y: rect.top + window.scrollY + top, width: rect.width, height },
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      embedFonts: true,
      fast: true,
      compress: false,
      exclude: ['.card_effect', '.bookmark-btn'],
      excludeMode: 'remove',
      plugins: [{
        name: 'review-covers',
        async afterClone({ clone }) {
          if (!(clone instanceof HTMLElement)) return;
          // Computed auto-fit tracks lose their collapsed gutters in SVG;
          // Chromium also drops auto margins. Freeze the measured card boxes.
          if (layout !== 'tier') {
            Object.assign(clone.style, {
              display: 'block', position: 'relative', margin: '0',
              width: `${rect.width}px`, height: `${rect.height}px`,
            });
          }
          for (const card of clone.querySelectorAll<HTMLElement>('[data-review-card]')) {
            const link = card.querySelector('a')?.getAttribute('href');
            // Clipped tiles can retain an empty placeholder for a card.
            if (!link) continue;
            const original = cards.get(link);
            if (!original) continue;
            if (layout !== 'tier') {
              const box = original.rect;
              Object.assign(card.style, {
                position: 'absolute', inset: 'auto', margin: '0',
                left: `${box.left - rect.left}px`, top: `${box.top - rect.top}px`,
                width: `${box.width}px`, height: `${box.height}px`,
              });
            }
            const img = card.querySelector('img');
            if (img && original.src) {
              // Only the detached clone changes: browsing stays lazy, and an
              // offscreen or cached low-density currentSrc cannot blur exports.
              const decoded = new Image();
              decoded.src = original.src;
              await decoded.decode();
              img.removeAttribute('srcset');
              img.removeAttribute('sizes');
              img.src = original.src;
              img.style.visibility = 'visible';
              // snapdom can also copy opacity:0 from a cover hidden during
              // hydration. Its replacement has now decoded for this book.
              img.style.opacity = '1';
            }
          }
        },
        afterRender(capture) {
          if (scale <= 1 || !capture.svgString) return;
          // WebKit rasterizes shadowed SVGs at their intrinsic size first.
          // Scale the HTML inside a pixel-sized SVG to avoid a blurry 2x bitmap
          // and WebKit's misplaced foreignObject content under viewBox scaling.
          const svg = new DOMParser().parseFromString(capture.svgString, 'image/svg+xml').documentElement;
          const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
          const sx = targetWidth / width;
          const sy = (bottom - y) / height;
          svg.setAttribute('width', String(targetWidth));
          svg.setAttribute('height', String(bottom - y));
          svg.setAttribute('viewBox', `0 0 ${targetWidth} ${bottom - y}`);
          const foreign = svg.querySelector('foreignObject')!;
          for (const attr of ['x', 'y', 'width', 'height']) {
            const multiplier = attr === 'x' || attr === 'width' ? sx : sy;
            foreign.setAttribute(attr, String(Number(foreign.getAttribute(attr)) * multiplier));
          }
          Object.assign((foreign.lastElementChild as HTMLElement).style, {
            transform: `scale(${sx}, ${sy})`, transformOrigin: '0 0',
          });
          capture.svgString = new XMLSerializer().serializeToString(svg);
          capture.dataURL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(capture.svgString)}`;
        },
      }],
    });
    const tile = await result.toCanvas();
    if (Math.abs(tile.width - targetWidth) > 2 || Math.abs(tile.height - (bottom - y)) > 2) {
      throw new Error('screenshot: capture tile has unexpected dimensions');
    }
    context.drawImage(tile, 0, y, targetWidth, bottom - y);
  }
  if (canvas.width === 0 || canvas.height === 0) {
    throw new Error('screenshot: capture produced an empty canvas');
  }
  // Over-limit canvases fail silently as fully transparent bitmaps; we asked
  // for an opaque background, so a transparent centre pixel means failure.
  const probe = canvas
    .getContext('2d')
    ?.getImageData(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1
    ).data;
  if (probe && probe[3] === 0) {
    throw new Error('screenshot: capture produced a blank canvas');
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('screenshot: encoding failed'))),
      'image/webp',
      WEBP_QUALITY
    );
  });

  const ext = await extensionFor(blob);
  const date = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reviews-${layout}-${date}.${ext}`;
  a.click();
  // Delayed revoke: revoking synchronously can abort the download in Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
