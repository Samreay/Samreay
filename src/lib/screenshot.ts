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
const WEBP_QUALITY = 0.7;

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

  const result = await snapdom(el, {
    // Ask for exact output dimensions rather than a `scale` factor: elements
    // taller than the browser image-decode limit (16 384 px/side — the wide
    // list is ~37 000 px) make snapdom downscale its intermediate SVG, and a
    // `scale` would multiply on top of that downscale, shrinking the output
    // twice. Explicit width/height size the final canvas directly.
    dpr: 1,
    width: targetWidth,
    height: targetHeight,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    embedFonts: true,
    fast: true,
    // `compress` downsamples inlined covers to their CSS display size, which
    // only loses detail when we upscale (scale > 1, e.g. retina at 100% zoom
    // on a short list) — embed covers verbatim in that case.
    compress: scale <= 1,
    // Absolutely-positioned overlays that don't belong in a shared image:
    // hover glare layers (which also reference cross-origin texture webps
    // that would trigger ~165 remote fetches) and bookmark glyphs. `remove`
    // skips them entirely — no fetch, no clone — without affecting layout.
    exclude: ['.card_effect', '.bookmark-btn'],
    excludeMode: 'remove',
  });

  const canvas = await result.toCanvas();
  if (canvas.width === 0 || canvas.height === 0) {
    throw new Error('screenshot: capture produced an empty canvas');
  }
  if (Math.abs(canvas.width - targetWidth) > 2) {
    throw new Error(
      `screenshot: canvas width ${canvas.width}, expected ~${targetWidth} — ` +
        'snapdom sizing semantics may have changed'
    );
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
