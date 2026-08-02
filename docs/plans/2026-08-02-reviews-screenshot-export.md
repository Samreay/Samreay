# Reviews screenshot export (WebP download button)

**Date:** 2026-08-02
**Status:** Done

## Goal

A camera button next to Reset on `/reviews` (plus an `s` keyboard shortcut) downloads a
single WebP image of the entire review list — all of it, not just the viewport — in
whichever layout is active (wide, cover, or tier), with output resolution that follows
the browser zoom level but is capped so files never get unreasonably large.

## Context

- **Page:** `/reviews` is a static Astro shell (`src/pages/reviews/index.astro`) around
  one Svelte 5 island, `src/components/islands/ReviewsExplorer.svelte` (`client:load`).
  Layout (`?l=wide|cover|tier`), filters, and the Reset button all live in that island.
- **Capture root:** `#all-card-wrapper` (ReviewsExplorer ~line 428) wraps the full card
  list in all three layouts. For **tier** we capture it directly. For **wide/cover** we
  capture the inner `container mx-auto` grid div instead (give it
  `data-capture-root`): the wrapper adds ~380 px of dead gutter either side on wide
  monitors, and the grid's `mt-20` margin collapses *out* of the wrapper's rect in the
  live page but would not collapse inside the capture clone — capturing the wrapper
  would crop ~80 px of cards or add dead space. Capturing the grid sidesteps both.
- **Covers:** plain `<img loading="lazy">` tags pointing at build-time-optimized webp
  URLs (`resolveCover` → `/_astro/*.webp`, same-origin). Every `<img>` gets a real
  `src` at render time, so a capture library that fetches from `src` is unaffected by
  lazy loading. The content schema supports a `<video>` cover
  (`ReviewCard.svelte:164`) but **no review currently uses one** — untested path, noted
  as a caveat only.
- **Remote CSS assets:** `fancy.css` card-overlay backgrounds reference
  `https://cosmiccoding.com.au/static/img/textures/*.webp` (cross-origin in dev,
  invisible at rest since `--o: 0`). Exclude `.card_effect` from capture: contributes
  nothing visually, avoids ~165 cross-origin fetches and console noise.
- **Fonts:** the site loads Inter / Architects Daughter from Google Fonts. SnapDOM
  rasterizes inside an SVG `foreignObject`, which does not load external fonts unless
  they are inlined — so `embedFonts: true` is required or all text falls back to system
  fonts (very visible in wide layout).
- **Library choice:** [`@zumer/snapdom`](https://github.com/zumerlab/snapdom) (MIT,
  v2.23.x, zero runtime dependencies). Serializes the DOM subtree to SVG
  `foreignObject`, rasterizes via the browser's own renderer; fetches and inlines
  every `<img>` from its `src` (defeats lazy loading); native WebP export via
  `canvas.toBlob` — no wasm encoder.
- **Page-load cost: zero.** The library is `await import()`-ed inside the capture
  helper, so Vite splits it into a separate chunk fetched only on first use (verified:
  no `manualChunks` config; nothing else dynamic-imports at runtime). The type-only
  import in the helper **must** be `import type` or snapdom leaks into the island
  chunk. This interaction-time-import pattern is new to the repo → ADR below.
- **Zoom handling:** browser zoom reflows the page in CSS pixels (this is how the tier
  board is meant to be viewed all-at-once, per the 2026-08-01 tier-list plan), and
  `window.devicePixelRatio` includes the zoom factor on desktop. Capturing the element
  as-laid-out with a dpr-derived scale respects zoom for free; we only add clamping.
- **WebP caveat:** Safari cannot *encode* WebP from a canvas — `toBlob('image/webp')`
  silently returns PNG. Sniff the blob's **magic bytes** (`RIFF….WEBP` vs `\x89PNG`),
  not `blob.type` (which snapdom may set optimistically), and name the file `.webp` or
  `.png` to match.
- **Non-goals:** the flowchart page (separate xyflow canvas page, own export concerns);
  copying to clipboard; capturing the filter bar/tag chips; server-side rendering.

## Design

### Pre-implementation spike — FINDINGS (from snapdom 2.23.1 shipped types/dist)

1. **`scale`/`dpr` composition:** effective pixel multiplier is `scale × dpr`, with
   `dpr` defaulting to `devicePixelRatio`. We pass `dpr: 1` and control size ourselves.
2. **`compress` is scale-aware:** it downsamples covers to `display box × scale × dpr`,
   so it's fidelity-neutral whenever that product ≥ output resolution.
3. **Discovered during browser testing (changed the design):** elements taller than
   the browser image-decode limit (16 384 px/side — the wide list is ~37 000 CSS px
   tall) make snapdom downscale its intermediate SVG to fit, and a `scale` option then
   multiplies *on top of* that downscale, shrinking the output twice (a 583 px-wide
   target came out 255 px). Fix: pass explicit `width`/`height` (same clamp policy)
   instead of `scale` — those size the final canvas directly. Since `compress` keys
   off `scale` (now 1), pass `compress: scale <= 1` so upscaled captures embed covers
   verbatim. The post-capture canvas-width assertion (±2 px, throw on mismatch) is
   what caught this.

### Size / scale policy

Hard limits: WebP maxes out at 16 383 px per side, and **Safari caps total canvas area
around ~16.7 MP** (over-cap canvases fail *silently* — blank output). The tier list at
100% zoom is ~10 000+ CSS px tall, so a naive dpr-2 capture blows past both.

```
rect  = captureRoot.getBoundingClientRect()    // CSS px, reflects current zoom/layout
if (rect.width < 1 || rect.height < 1) return  // empty filtered list → no-op, no crash
scale = clamp(window.devicePixelRatio, 1, 2)   // floor 1 so zoomed-out captures aren't blurry
scale = min(scale,
            MAX_SIDE / rect.width,
            MAX_SIDE / rect.height,
            sqrt(MAX_PIXELS / (rect.width * rect.height)))
```

with `MAX_SIDE = 16000` and `MAX_PIXELS = 16e6` (~16 MP — within Safari's area limit,
keeps encode time and file size sane everywhere). Encode at `quality: 0.85`. After
capture, verify the canvas has non-zero dimensions/content before encoding; surface
failure rather than downloading a blank file.

### Capture flow

1. Button click or `s` shortcut → set `capturing = true`, `await tick()` (spinner must
   paint and the capture-time class must be in the DOM before the blocking work).
2. The `capturing` state also toggles a `screenshotting` class on `#all-card-wrapper`
   whose CSS neutralizes clone-hostile styles (all with `!important` to beat inline
   custom properties):
   - `.tier-label .sticky { position: static }` — sticky has no scrollport in the
     clone; force the intended static/centred position.
   - `.fancy_card { --o: 0; --rx: 0deg; --ry: 0deg }` — a card hovered at the moment
     `s` is pressed would otherwise be captured mid-tilt with glare baked in.
3. `const { snapdom } = await import('@zumer/snapdom')` — first use fetches the chunk.
4. `const result = await snapdom(captureRoot, { dpr: 1, scale, backgroundColor,
   embedFonts: true, fast: true, compress: <per spike>, exclude: ['.card_effect',
   '.bookmark-btn'] })` where `backgroundColor` is read from
   `getComputedStyle(document.body)` (body carries `bg-gray-900`) so captures sit on
   the real page background instead of snapdom's white default.
5. `const blob = await result.toBlob({ type: 'webp', quality: 0.85 })`.
6. Sniff magic bytes → extension `.webp` or `.png`. Download via a temporary
   `<a download>` + `URL.createObjectURL`, then revoke.
7. Filename: `reviews-{layout}-{YYYY-MM-DD}.{ext}`.
8. `finally { capturing = false }`. On error: `console.error` and swap the button label
   to "Failed — retry" for a few seconds (capture can fail for actionable reasons —
   memory, offline — and runs long enough that silence reads as breakage).

### UI

- New button immediately left of Reset in `#toggle-input` (ReviewsExplorer ~line 395),
  same styling as Reset (`bg-gray-700 hover:bg-main-700 …`), containing a small inline
  camera SVG (same pattern as the reading-list bookmark SVG) + "Screenshot" text, with
  `title="Download screenshot (s)"` and `aria-label`. While capturing: `disabled`,
  reduced opacity, icon swapped for a spinner (`animate-spin`). Disabled when
  `visiblePosts.length === 0`.

### Keyboard shortcut

- Add `s` (and `S`) to the existing `keypress` handler in ReviewsExplorer
  (~lines 271–287) rather than a second listener (`keypress` is already the pattern and
  avoids most modifier combos).
- **Included fix:** that handler currently fires `c/C/x/X` clipboard copies while you
  type in the search box (no focus guard — the Flowchart island has one, this island
  doesn't). Add a guard at the top of the handler: bail on `INPUT`/`TEXTAREA`/
  contenteditable targets **and** on `e.ctrlKey || e.metaKey || e.altKey` (so `Cmd+S`
  save-page is untouched). Covers old shortcuts and the new `s`.

### Open question (owner decision)

The capture deliberately excludes page chrome, so a shared image carries no site
attribution or filter context. If wanted, a capture-time-only header row ("Book Reviews
— cosmiccoding.com.au" + active filters) rendered above the cards inside the capture
root would cost nothing at page load. **Default: not included** unless requested.

## Affected files

```
~ package.json                                      (+ @zumer/snapdom dependency)
+ src/lib/screenshot.ts                             (capture helper: scale math, snapdom call, blob download)
~ src/components/islands/ReviewsExplorer.svelte     (button, capturing state, capture-root data attr, shortcut + focus guard)
~ src/styles/fancy.css                              (.screenshotting neutralization rules)
~ docs/DECISIONS.md                                 (ADR-011)
```

`src/lib/screenshot.ts` keeps the island thin and is the code-splitting boundary: only
`import type` at top level; the runtime `await import('@zumer/snapdom')` lives inside
its exported `captureElement()`.

## Tasks

- [ ] 0. Spike: confirm snapdom `scale`/`dpr` composition and `compress`-vs-`scale`
        behaviour on one tier row; record findings in this plan (throwaway script or
        browser console; no committed code)
- [ ] 1. `npm install @zumer/snapdom` (`package.json`)
- [ ] 2. Write `captureElement(el, { layout })`: empty-rect guard, scale policy,
        dynamic snapdom import, options per Capture flow step 4, canvas dimension
        assertion + blank-output check, magic-byte sniff, anchor download, dated
        filename (`src/lib/screenshot.ts`)
- [ ] 3. Add `capturing` state, `screenshotting` class binding, capture-root
        `data-capture-root` on the wide/cover grid, and the screenshot button next to
        Reset with spinner/disabled/failed states
        (`src/components/islands/ReviewsExplorer.svelte`)
- [ ] 4. Add `.screenshotting` neutralization rules for sticky labels and fancy-card
        hover vars (`src/styles/fancy.css`)
- [ ] 5. Extend the keypress `$effect` with `s`/`S` → capture, and add the input/
        textarea/contenteditable + modifier-key guard covering all shortcuts
        (`src/components/islands/ReviewsExplorer.svelte`)
- [ ] 6. Append ADR-011 in DECISIONS.md house format — **Context / Decision /
        Consequences** with `---` separator (`docs/DECISIONS.md`)

## Verification

### Static analysis

```bash
astro check
npm run build
```

Expected: no errors, no warnings. Confirm in build output that snapdom lands in its own
chunk (not the ReviewsExplorer island chunk) and note its actual gzipped size in the
ADR (don't assert "tens of KB" unverified).

### Visual review (browser-tester)

Pages to check on `http://localhost:4321/reviews`:

- `?l=tier` — click Screenshot; downloaded image shows **every** tier row top to bottom,
  including covers never scrolled into view (lazy-load defeated), tier labels at their
  static/centred position regardless of scroll offset, dimensions within caps.
- `?l=wide` and `?l=cover` — **last card row fully present** (margin-collapse trap),
  no dead side gutters, page background color correct (not white), card titles render
  in Inter not a system fallback (compare side by side with the live page), no faint
  bookmark glyphs on cards.
- Zoom into a cover in the exported image — cover-art title text as legible as on
  screen (compress spike outcome holds).
- Press `s` → capture fires; hover a card while pressing `s` → exported card is flat
  (no tilt/glare); type "s" and "c" in the search box → no capture, no clipboard copy
  (guard works); `Cmd+S` → browser save dialog, no capture.
- Button shows spinner during capture, re-enables after; search for gibberish → button
  disabled, pressing `s` does nothing (no console error).
- `http://localhost:4321/kitchensink/` — no regressions in existing components.

### Manual checks

- [ ] Zoom to ~50% and ~150%, capture tier view each time — output reflects the zoomed
      layout (column counts change) and stays within size caps.
- [ ] Largest realistic case (tier list, 100% zoom, widest available monitor) — open
      the file and confirm it is **not blank** (silent canvas-cap failure mode).
- [ ] File opens as valid WebP (`file` / preview) and is a sane size (< ~10 MB).
- [ ] A filtered view (tags/search active) captures only the visible cards.
- [ ] Safari (if available): capture downloads a `.png` (magic-byte fallback), not a
      mislabeled `.webp`.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| snapdom `compress` downsamples covers to CSS-px size, blurring hi-res captures | Quality | Spike (task 0) decides `compress` explicitly; legibility check in verification |
| Canvas area over Safari's ~16.7 MP limit fails silently (blank image) | Broken output | `MAX_PIXELS = 16e6`; post-capture non-blank assertion; largest-case manual check |
| `scale`/`dpr` double-applies zoom | Wrong output size | `dpr: 1, scale: computed` + dimension assertion (spike-confirmed) |
| Capture of ~165 covers takes seconds / spikes memory | UX | `compress` per spike, spinner + disabled button, scale caps bound the canvas |
| Safari WebP encode unsupported | Wrong file extension | Magic-byte sniff, `.png` fallback |
| `<video>` covers (schema-supported, currently unused) capture oddly | Cosmetic, latent | Documented caveat; revisit if a video cover is ever added |

## Architectural decision (ADR)

**Decision (ADR-011):** Client-side DOM screenshots use `@zumer/snapdom`, dynamically
imported at the moment of first use.
**Why:** Zero-dependency, actively maintained, best fidelity/speed for large DOMs, and
native WebP export via canvas — no wasm encoder. Dynamic import preserves the zero-JS /
minimal-island-payload principle (ADR-001): the library costs nothing until the user
actually clicks Screenshot.
**Consequences:** First capture has a one-off chunk-fetch delay (size to be recorded
from the build output). Interaction-time `await import()` is now an established pattern
for heavy, rarely-used client features. Safari users get PNG instead of WebP until
WebKit supports canvas WebP encoding. Runtime dependency count goes from 3 to 4.
(To be appended to `docs/DECISIONS.md` in house format: Context / Decision /
Consequences.)
