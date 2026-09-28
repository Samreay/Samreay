# Review image sizing and export — 2026-09-28

Reviews transfer **32.0% fewer bytes on desktop and 2.9% fewer on the standard
mobile profile**. Higher-density covers retain more of the originals’ detail.
Load-time ranges overlap; this is primarily an image-quality and transfer
improvement. Screenshot exports also retain offscreen covers without the
previous grid clipping.

This implements [Brief 3](../plans/2026-09-28-perf-03-images.md). The requested
font commit is `9258973b3fd7b63cf32ed37b95e27716e939d75c`, **Stabilize font loading
and fallback text**. Measurements were collected from the uncommitted image
changes in the local production preview.

## What changed

Review covers now have original-derived WebP candidates at 150, 250, 384, 500,
750, and 1,000 px. Quality is 85 up to 250 px and 80 above it, compared with the
previous quality 70. The small widths match the actual desktop card widths;
this avoids resampling tiny lettering between nearby sizes. The 1,000 px
candidate supplies a 250 CSS-pixel card at DPR 4.

The UI already stretches covers into a 5:8 frame. Generated candidates preserve
that framing without cropping. Candidates stop when either original dimension
would require enlargement, and a limited original remains available at native
resolution. All 167 current reviews use co-located covers. Separate fixtures
check explicit selection, bundled images, deterministic placeholders, and video
covers. Other consumers of `resolveCover`, including flowchart covers, retain
their existing transforms.

`Post.img` remains the fallback URL; optional `Post.cover.srcset` carries the
width descriptors. Layout-aware `sizes` follows the actual image box, including
mobile grid padding. `sizes="auto"` was rejected after a tier-to-wide transition
requested the largest candidate before the new grid had layout. Hydration
repairs `sizes`, `srcset`, and `src` together and hides a stale decoded image
until it belongs to the current book. Ordinary browsing remains lazy.

Export selects and decodes a sufficient source on the detached clone. It freezes
measured card positions because snapdom's computed grid tracks lose collapsed
gutters and, in Chromium, auto margins. Long lists are rasterized in 4,000 CSS
pixel tiles to avoid oversized intermediate SVGs. Decoded export replacements clear both visibility and copied opacity, including
covers hidden during filtered-URL hydration. The existing 2× scale cap,
8,000 px side limit, and 16 MP area budget remain. Final WebP quality rises from
70 to 90 to reduce a second compression loss. For upscaled tiles, a pixel-sized
SVG with an internally scaled HTML wrapper avoids WebKit's 1× intermediate
bitmap and its misplaced content under SVG viewBox scaling. WebKit's PNG
fallback is retained.

[ADR-017](../DECISIONS.md#adr-017-size-review-covers-for-their-display-and-export)
records the metadata and export decisions. The optional texture experiment was
not taken up in this pass.

## Conditions and provenance

Artifact root: `artifacts/performance/20260928T093909Z-03-images/`, abbreviated
`R` below. `initial-state.json`, `initial-status.txt`, both initial patches, and
`inherited-work.tar.gz` record the starting files and pending work. The original
package files, profiling tools, plans, earlier reports, and other inherited
changes are preserved. `final-owned.patch`, `final-state.json`, and `final-runtime.json` record the
finished source and build, including hashes. The index remains unchanged.

The final WebKit export fix adds 756 uncompressed bytes to the reviews island
bundle (about 320 bytes gzipped). The export handler is bundled with the island;
only snapdom itself loads on demand. Reviews timings were therefore repeated
against that final build in `after-reviews-load-02/` and
`after-reviews-interactions-02/`. They supersede reviews rows in the first `after-*`
cohort. Home and flowchart retain their unchanged candidate cohorts. The five
other production files match the earlier measured checkpoint byte-for-byte;
`final-export-raster-fix.patch` records the intervening source change. The final
source and runtime manifests identify the accepted checkout. Graph and font
geometry checks preceded the final export-only opacity repair, with their
sources and graph bundle unchanged. The complete export and font-failure/export
checks were repeated after that repair.

The target is the production build at `http://127.0.0.1:4331`, not the deployed
site. Preview serves gzip; raw HTML and serialized payload costs below must not
be confused with transferred bytes. Builds, browser suites, and profilers ran
sequentially.

- Apple M4 Pro, 12 logical CPUs, 24 GiB; Darwin 25.6.0 arm64; Node 22.22.2.
- Lighthouse 13.5.0 and Chromium 147.0.7727.15. Functional checks also use WebKit
  26.4. These are virtual browser conditions, not physical-device tests.
- Simulated mobile: 412×823, DPR 1.75, 4× CPU, 150 ms RTT, 1638.4 Kbit/s.
  Desktop: 1350×940, DPR 1, 1× CPU, 40 ms RTT, 10240 Kbit/s.
- Applied CDP mobile: 4× CPU, 150 ms request latency, 1.6 Mbit/s. Desktop: 1× CPU,
  40 ms, 10 Mbit/s. Browser cache is disabled and third-party requests remain
  enabled. This is request-level throttling, not packet shaping.
- Five Lighthouse loads and three applied interaction runs per route/profile
  and cohort. Baseline loads combine the original three with two extra runs.
  The six changed production files were checkpointed, temporarily restored to
  HEAD for those repeats, and restored byte-for-byte before the candidate build.
- An attempted extra baseline cohort reported `NO_FCP` across all three routes;
  ordinary browsing still painted. Its failures are retained in
  `before-load-extra-failed/`, with diagnostic runs kept separately. Valid
  measurement resumed, and the remaining benchmarks used a temporary wake lock.
  The failed runs and diagnostics are excluded from statistics. The precise
  browser failure cause was not established.

No new field data was collected. DPR (device pixel ratio) relates device pixels
to CSS pixels: a 250 CSS-pixel cover needs 1,000 pixels of width at DPR 4.
LCP (Largest Contentful Paint) is when the largest visible content element
appears; on mobile reviews that element is text, not a book cover. FCP (First
Contentful Paint) is the first text or image paint. CLS (Cumulative Layout
Shift) measures unexpected layout movement. TBT (Total Blocking Time) adds the
parts of main-thread tasks longer than 50 ms. Event Timing samples below are lab
diagnostics, not field INP or a measurement of every possible interaction.

## Repeated measurements

Times are milliseconds; values are median [minimum–maximum]. The
[JSON results](2026-09-28-perf-03-images-results.json) preserve exact statistics,
per-action timings, selected-file evidence, and export outcomes.

| Route / device / cohort            |         Score |              FCP ms |              LCP ms |        TBT ms |                          CLS |      Speed Index ms |              KiB |
| ---------------------------------- | ------------: | ------------------: | ------------------: | ------------: | ---------------------------: | ------------------: | ---------------: |
| / mobile before                    |    98 [97–98] | 1,372 [1,362–1,521] | 2,337 [2,263–2,413] |     13 [3–27] | 0.000000 [0.000000–0.000000] | 1,372 [1,362–1,521] |    600 [600–600] |
| / mobile after                     |    98 [98–99] | 1,368 [1,366–1,515] | 2,265 [1,763–2,341] |    16 [13–27] | 0.000000 [0.000000–0.000000] | 1,368 [1,366–1,515] |    600 [600–600] |
| / desktop before                   | 100 [100–100] |       341 [338–377] |       501 [498–537] |       0 [0–0] | 0.000131 [0.000128–0.000677] |       341 [338–377] | 1088 [1088–1088] |
| / desktop after                    | 100 [100–100] |       345 [344–349] |       504 [409–507] |       0 [0–0] | 0.000128 [0.000128–0.000128] |       345 [344–349] | 1088 [1088–1088] |
| /reviews/ mobile before            |    95 [95–96] | 1,820 [1,817–1,833] | 2,718 [2,642–2,721] |      9 [3–21] | 0.000000 [0.000000–0.000000] | 1,820 [1,817–1,833] | 1373 [1373–1373] |
| /reviews/ mobile after             |    96 [95–97] | 1,826 [1,825–1,829] | 2,575 [2,353–2,726] |     15 [0–31] | 0.000000 [0.000000–0.000000] | 1,826 [1,825–1,829] | 1333 [1333–1333] |
| /reviews/ desktop before           | 100 [100–100] |       443 [439–444] |       604 [580–623] |       0 [0–0] | 0.000677 [0.000128–0.000677] |       443 [439–444] | 2014 [2014–2014] |
| /reviews/ desktop after            | 100 [100–100] |       447 [446–457] |       567 [517–586] |       0 [0–0] | 0.000128 [0.000128–0.008276] |       447 [446–457] | 1371 [1371–1371] |
| /reviews/flowchart/ mobile before  |    93 [86–95] | 1,967 [1,965–1,972] | 2,615 [2,610–3,584] |  163 [83–176] | 0.000000 [0.000000–0.000000] | 1,967 [1,965–1,972] |    576 [576–576] |
| /reviews/flowchart/ mobile after   |    93 [93–93] | 1,975 [1,973–1,977] | 2,618 [2,615–2,623] | 158 [155–171] | 0.000000 [0.000000–0.000000] | 1,975 [1,973–1,977] |    576 [576–576] |
| /reviews/flowchart/ desktop before | 100 [100–100] |       500 [499–506] |       603 [601–650] |       0 [0–0] | 0.000128 [0.000128–0.000128] |       500 [499–506] |    660 [660–660] |
| /reviews/flowchart/ desktop after  | 100 [100–100] |       507 [504–529] |       605 [603–613] |       0 [0–0] | 0.000128 [0.000128–0.000128] |       507 [504–529] |    660 [660–660] |

| Applied route / device      |            FCP before → after |                        LCP before → after |                                          CLS before → after |                      Ready before → after |      Max event before → after |
| --------------------------- | ----------------------------: | ----------------------------------------: | ----------------------------------------------------------: | ----------------------------------------: | ----------------------------: |
| / mobile                    | 548 [536–552] → 540 [540–556] |             604 [576–604] → 580 [576–600] | 0.000000 [0.000000–0.000000] → 0.000000 [0.000000–0.000000] | 1,628 [1,627–1,687] → 1,593 [1,586–1,645] |       32 [24–40] → 24 [24–40] |
| / desktop                   | 140 [140–144] → 144 [140–148] |             168 [168–168] → 164 [160–164] | 0.000128 [0.000128–0.000128] → 0.000128 [0.000128–0.000128] |             143 [138–143] → 140 [138–141] |     unavailable → unavailable |
| /reviews/ mobile            | 616 [616–620] → 608 [604–616] |             664 [660–672] → 640 [636–648] | 0.000040 [0.000040–0.000040] → 0.000040 [0.000040–0.000040] | 3,444 [3,438–3,470] → 3,489 [3,451–3,501] | 160 [152–160] → 160 [152–168] |
| /reviews/ desktop           | 144 [144–144] → 152 [152–156] |             192 [184–212] → 196 [196–204] | 0.145865 [0.145865–0.145865] → 0.145865 [0.145865–0.145865] |             472 [454–541] → 430 [429–439] |       88 [80–96] → 80 [80–80] |
| /reviews/flowchart/ mobile  | 796 [796–804] → 800 [796–800] | 2,020 [1,996–2,056] → 1,952 [1,948–1,956] | 0.000000 [0.000000–0.000000] → 0.000000 [0.000000–0.000000] | 2,025 [1,996–2,065] → 1,956 [1,954–1,960] | 136 [120–136] → 120 [112–128] |
| /reviews/flowchart/ desktop | 168 [168–184] → 168 [160–168] |             176 [168–192] → 176 [168–176] | 0.000128 [0.000128–0.000128] → 0.000128 [0.000128–0.000128] |             413 [410–433] → 408 [406–408] | 208 [200–232] → 200 [200–200] |

Reviews' Lighthouse transfer median drops from 2,062,658 to 1,403,546 bytes on
desktop, and from 1,406,062 to 1,365,134 on mobile. The mobile result uses DPR
1.75; it is not a budget for the DPR 3/4 quality matrix.

Reviews' median simulated FCP is 6 ms later on mobile and 4 ms later on
desktop. Mobile TBT
moves from 8.5 to 15 ms with overlapping ranges. Mobile LCP falls from 2,718 to
2,575 ms, but the ranges overlap and the LCP element remains text. These runs do
not establish a repeatable LCP improvement.

Applied mobile review readiness moves from 3,444 to 3,489 ms (45 ms, 1.3%), with
overlapping ranges. The added HTML is a plausible cost, not an isolated cause.
Review filter/layout event medians are unchanged or 8 ms lower on mobile;
desktop changes are also within one 8 ms timing bucket. Flowchart readiness remains around two seconds
on the applied mobile profile (2,025 → 1,956 ms); no graph source changed.

Mobile CLS remains unchanged. Applied desktop reviews retains the inherited
0.145865 hydration layout shift. Lighthouse's desktop review maximum is 0.008276
in one candidate run, versus 0.000677 before; it does not recur in applied
loads, whose shift is identical before and after. The checks that hold image
responses confirm image decoding itself does not move the grid. Lighthouse attributes its outlier to the preamble paragraph when the unchanged
Inter font loads. There is no observed broad input-latency regression, but the existing hydration shift and
small readiness cost remain visible in the report rather than being treated
as an image optimization win.

All 36 accepted applied runs completed their action assertions without captured runtime
errors. The JSON contains every per-action median/range. An absent Event Timing
sample, such as desktop scrolling, is reported as unavailable, never zero.

## Image quality

All 186 selected-file samples pass the two-axis resolution floor (180 matrix
samples plus six rotated-layout samples). All 934 width descriptors agree with
the selected files' actual dimensions, and no emitted candidate exceeds its
original in either axis. This resolution check supplements the native-pixel
review below; it does not replace it.

The matrix covers wide, cover, and tier layouts in Chromium and WebKit at:

| CSS viewport |     DPR | Wide image width | Cover image width | Tier image width |
| ------------ | ------: | ---------------: | ----------------: | ---------------: |
| 375×812      |       3 |              250 |            148.34 |            87.66 |
| 390×844      |       3 |              250 |            155.09 |            92.66 |
| 430×932      |       3 |              250 |            173.09 |              106 |
| 412×915      |       4 |              250 |               165 |              100 |
| 1350×940     | 1 and 2 |              250 |               250 |              150 |

Widths are measured CSS pixels for the representative cards. Final direct-entry
checks use a fresh browser context for each layout, then exercise transitions
within that context. Cached larger candidates during transitions are allowed;
a new oversized request caused by an unlaid-out grid is checked separately.
Mobile rotation is also exercised. Chromium also passes a viewport/density equivalent of 150% desktop zoom:
1350×940 at DPR 2 becomes 900×627 at DPR 3, and Cradle selects 750 px instead of
500 px. This uses CDP device metrics; actual toolbar zoom and physical-device
behavior were not tested. `zoom-equivalent.json` records the selected files.

For each sampled cover, `final-quality/results.json` records `currentSrc`, CSS
bounds, DPR, original dimensions, actual selected-file dimensions and bytes,
and browser resource timing where available. Width descriptors for every
candidate are independently checked against Sharp metadata. Browser
`naturalWidth` is density-corrected and is recorded only as supplementary data;
see [MDN's definition](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/naturalWidth).

Representative covers are Cradle, Bastion, Mother of Learning, Dungeon Crawler
Carl, and Greatest Archmage. Together they cover small lettering, line work,
faces, gradients, dark texture, and a low-resolution original. Native screenshots
and original-derived references use identical display geometry. The strips in
`native-comparisons/` contain **before, after, original reference**, left to
right, with no resizing of the crops. At DPR 4, Cradle's lettering, Mother of Learning's fine lines, Dungeon Crawler
Carl's textured type, and Bastion's dark face/texture details visibly improve.
The DPR 1 Cradle crop retains the small lettering without the softness seen in
the rejected 256 px rendition. Greatest Archmage remains limited by its original.
The inspected native crops show no new ringing, blockiness, banding, or framing
change. These are sampled visual observations, not an exhaustive claim about
every pixel in every cover.

Inspect the [DPR 4 lettering comparison](../../artifacts/performance/20260928T093909Z-03-images/native-comparisons/chromium-cradle-412x915x4.png)
and [dark-detail comparison](../../artifacts/performance/20260928T093909Z-03-images/native-comparisons/webkit-bastion-412x915x4.png)
at native size. The [final WebKit export crop](../../artifacts/performance/20260928T093909Z-03-images/native-comparisons/webkit-export-title.png)
shows export and original reference side by side.

The inventory has originals from 200 to 3,000 px wide. Twenty-two are under
600 px wide. Fifty-six cannot fully supply a 250×400 CSS-pixel card at DPR 4 in
both dimensions. This is recorded per book in the JSON; it does not cap other
covers. Greatest Archmage's 200×300 original, for example, is served without
inventing pixels. The previous 500 px rendition had already enlarged it.

Selected compressed file bytes are separate from navigation transfer. For wide
cards at 412×915, DPR 4, Chromium selects:

| Cover                | Original  | Before: pixels / bytes | After: pixels / bytes |
| -------------------- | --------- | ---------------------: | --------------------: |
| cradle               | 1600×2560 |       500×800 / 31,320 |    1000×1600 / 83,228 |
| bastion              | 3000×4500 |       500×750 / 49,460 |   1000×1600 / 182,482 |
| mother of learning   | 1800×2700 |       500×750 / 54,444 |   1000×1600 / 185,294 |
| dungeon crawler carl | 1600×2560 |       500×800 / 51,566 |   1000×1600 / 179,256 |
| greatest archmage    | 200×300   |       500×750 / 25,880 |      200×300 / 16,796 |

Those increases buy detail rather than violating a low-DPR byte target. At DPR
1, Cradle's 250 px desktop cover falls from 31,320 to 20,852 bytes.

## Behavior, export, and inherited checks

Both browsers pass direct recent-order and filtered/recent entry, rank/recent
sorting, tag/search/reset, bookmarks and reading-list filtering, and transitions
between all three layouts. The test checks every card's title/link/alt/source
identity and samples visible frames for wrong-book covers. Deferred responses
stay unloaded until release, then decode without changing image or grid sizes.
Tier caption tinting follows the selected cover with no captured runtime errors.

Six fixture cases (three layouts per browser) verify explicit/co-located and
bundled sources, deterministic day-based placeholders, and a decoded autoplay,
muted, looping, inline video. The fixture was removed before the final build.

The old export failures were reproduced and retained. After correcting the
pixel-checker's independent horizontal/vertical rounding, Chromium's short wide
and cover exports and 77 covers in its long wide export failed the original
position/content check. WebKit's short wide and cover exports, 166 long-wide
covers, and all 167 long-cover images failed. Tier exports passed. These are
inherited defects, not failures introduced by responsive sources.

The accepted export evidence is `final-exports-02/results.json`: 16 downloads pass
format, size, and all-cover pixel checks across Chromium/WebKit, three layouts,
short/full lists, and the area-limit case. They include 1,392 cover-content
comparisons with no misplaced or missing cover. Full wide/cover/tier outputs
reach the 8,000 px side limit; the wide-viewport case reaches 15,999,255 pixels.
Chromium writes WebP and WebKit writes correctly named PNG.

Native short-export crops exposed an additional WebKit defect after the first
otherwise passing pixel-position suite: it enlarged a 1× raster. That earlier
output remains under `final-quality/`; it is superseded for export acceptance
by `final-exports-02/`. The final image's lettering is sharp against the original
reference. A focused Laplacian edge-energy check on Cradle's small lettering
now accompanies the position check: the failed WebKit output scored 0.12 of the
reference, whereas the final short wide/cover exports score 0.99 and tier
exports 0.83 in both browsers (minimum accepted 0.5). This detects that specific
blur failure; it is not a general perceptual-quality metric. Native export
crops in `native-comparisons/*-export-title.png` show **export, reference**.

A cold filtered list of 25 companion-tagged books also passes in both engines:
its 5,880 CSS-pixel height spans two tiles and exports at 1,750×8,000 pixels.
This caught covers whose hydration-hidden state became copied `opacity:0`.
Their decoded replacements now restore both opacity and visibility. All 50
cover comparisons across those two exports pass. The original failed attempts
are retained in `tiled-exports/` and `tiled-exports-02/`; changing SVG offsets
did not fix the failure and that experiment was reverted.

The production flowchart suite passes all four Chromium/WebKit desktop/mobile
profiles. Its 269 nodes and 269 edges, geometry, covers, and fallback match the
Brief 1 baseline. Search, fitting, pan/zoom/minimap, quiz/deep links, delayed and
failed covers, and revisit behavior pass without captured runtime errors.
WebKit covers touch taps; its Playwright API cannot synthesize the multi-touch
protocol gestures used in Chromium. The color script also passes, but parses
only three edges; it is not a full color audit.

The font geometry suite passes 28/28 page/browser/profile cases against Brief
2's accepted typography output, including 784 glyph measurements. It covers
home, reviews, flowchart, kitchensink, two individual reviews, and an OG page.
The cache/held/failed-font and export script passes all ten cases (six font
scenarios and four downloads). No accepted font source or configuration changed.

Final Astro check passes with zero errors, zero warnings, and six inherited
hints. The final build emits 455 pages. The source, index, and inherited-file
preservation audit is recorded in `final-state.json`.

## Cost and remaining limits

| Build output / payload                         |      Before |       After |                 Change |
| ---------------------------------------------- | ----------: | ----------: | ---------------------: |
| `_astro` asset count                           |       1,918 |       2,852 |                   +934 |
| `_astro` asset bytes                           | 219,253,573 | 282,255,381 | +63,001,808 (60.1 MiB) |
| Reviews HTML, uncompressed                     |     456,675 |     559,800 |   +103,125 (100.7 KiB) |
| Serialized posts JSON                          |     134,841 |     176,717 |     +41,876 (40.9 KiB) |
| Reviews document transfer, representative load |      52,744 |      69,913 |     +17,169 (16.8 KiB) |

The 934 review candidates total 62,998,222 bytes. Existing renditions used by
other pages remain. The asset increase is static build/storage cost; each
browser downloads selected candidates, not all six renditions for every book.
The serialized JSON is already inside the HTML and must not be added to it as a
separate network cost.

The first build generating the initial candidate set took 19.10 seconds, versus
5.91 seconds for the cached baseline build. That difference is not a controlled
cold-build comparison: it includes first-time image generation. The final cached
candidate build took 5.95 seconds and emitted the same 455 pages. A controlled
empty-cache build-time comparison was not collected.

Reading dimensions directly from Astro 5's imported metadata proxy initially
caused about 100 MB of unused originals to be published. The retained helper
reads `getImage`'s public normalized options instead. It still generates every
candidate from the original source. The current installed implementation was
inspected; this behavior should be rechecked on an Astro upgrade.

The SSR page has a default layout. A cold URL selecting another layout can
retain a larger candidate fetched before hydration, and browsers may keep that
candidate after moving to smaller cards. The metadata follows the new layout;
it does not force a redundant downgrade download. The test separately rejects
new requests above the largest candidate needed by any exercised layout.

No physical-device or deployed/CDN measurements were collected. Native browser
screenshots establish the observed local rendering, not every display or image.
Small originals and the existing long-export size cap still limit detail. This
pass leaves the inherited desktop hydration layout shift and developer-mode
flowchart drag-handler defect outside its scope. The production graph suite is
reported separately below.

The next performance experiment should address the reviews island's hydration
layout switch and roughly 3.5-second applied mobile readiness, using this build
as its baseline. Reducing cover quality further is not the proposed route to
that improvement.

## Reproduce

Use fresh output directories. The actual before/after cohort manifests and
commands are preserved under `R`; `WORKLOG.md` records the local sequence.

```bash
npx astro check
npm run build
npm run preview -- --host 127.0.0.1 --port 4331

node scripts/verify-review-image-quality.mjs \
  --base-url http://127.0.0.1:4331 --output artifacts/performance/image-quality-rerun

npm run perf:load -- --base-url http://127.0.0.1:4331 --runs 5 \
  --output artifacts/performance/image-load-rerun
npm run perf:interactions -- --base-url http://127.0.0.1:4331 --runs 3 \
  --output artifacts/performance/image-interactions-rerun

node scripts/verify-review-image-quality.mjs \
  --base-url http://127.0.0.1:4331 --upscale-only \
  --output artifacts/performance/image-tiled-export-rerun

node scripts/verify-flowchart-performance.mjs \
  --base-url http://127.0.0.1:4331 \
  --baseline artifacts/performance/20260928T063039Z-01-flowchart/baseline-regression-04/graph-inventory.json \
  --output artifacts/performance/image-flowchart-rerun
```

The inherited font checks used:

```bash
node artifacts/performance/20260928T083543Z-02-fonts/verify-fonts.mjs \
  artifacts/performance/font-regression-rerun \
  artifacts/performance/20260928T083543Z-02-fonts/candidate-typography-02/results.json
node artifacts/performance/20260928T083543Z-02-fonts/font-failures-export.mjs \
  artifacts/performance/font-failure-export-rerun
node scripts/verify-flowchart-colors.mjs
```

The temporary source-selection/video fixture is saved as
`R/image-fixture.astro.txt`, with its checks in `fixture-test.mjs` and outcomes in
`fixture-results.json`. It was removed before the final 455-page build.
