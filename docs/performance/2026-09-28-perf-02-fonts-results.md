# Font loading and layout stability — 2026-09-28

**Keep the measured fallback and display-policy change, with a small first-paint tradeoff.** Applied mobile CLS falls from 0.175270 to 0 on home and from 0.106283 to 0.000040 on reviews. Held fonts remain readable in WebKit. Loaded typography and exported pixels are preserved. Mobile flowchart simulated LCP remains about 2.61 seconds; its applied first contentful paint is consistently about 32 ms later. This is a qualified font-scope result, not a claim that every metric improved or that the brief's strict no-regression condition passed.

This implements [Brief 2](../plans/2026-09-28-perf-02-fonts.md) on top of the
complete flowchart handoff. HEAD remains
`d5ca8f8b3582dc8e5ba7533fab189de23dd70f5a`. The preceding flowchart commits are
present. Changes in this report are local and uncommitted; nothing was pushed,
deployed, or submitted as a PR.

## Starting point and retained change

The brief's Google Fonts import description predates the
[first-load follow-up](2026-09-28-flowchart-first-load-results.md). That work
already bundles all nine original WOFF2 subsets, removes the remote CSS request
and obsolete preconnects, and supplies shared layouts, standalone OG pages, and
export through the same CSS. Its eleven low-priority flowchart module hints
remain intact. This pass does not repeat that migration or claim its improvement
against the old deployed numbers.

The remaining problem appears under applied network throttling. Inter arrives
after fallback text has painted and changes wrapping. Across three baseline
runs, mobile home records 0.175270 CLS and mobile reviews 0.106283. On reviews,
the controls move from y = 382 to y = 410 and grow from 170 to 226 px. The font response
finishes around that shift, before reviews hydration becomes ready. Lighthouse's
unthrottled recording followed by simulation reports zero mobile CLS, so it
does not expose this behavior.

The retained CSS change adds a local Arial fallback whose metrics are measured
against Inter at each used weight. It applies only to the original Latin range.
Other scripts and systems without Arial retain the existing fallback stack.
The real Inter and Architects Daughter files, weights, and Unicode ranges are
unchanged. No additional font downloads or preloads are introduced.

`font-display: swap` also replaces `fallback` on the existing faces. A held-font
probe reproduces blank WebKit headings under both `fallback` and `optional`.
With `swap`, the held heading is visibly painted in the fallback face. Pixel
comparisons against a hidden-heading control distinguish painted text from an
element that merely has a visible DOM box. This follows the browser's
[font-display policy](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face/font-display).

## Measurement conditions

Artifact root: `artifacts/performance/20260928T083543Z-02-fonts/`, abbreviated
`R` below. `initial-state.json`, the two initial patches, `initial-status.txt`,
and `inherited-work.tar.gz` record HEAD, all tracked and non-ignored untracked
files, and inherited work before edits. The original `.gitignore`, `CLAUDE.md`,
`Makefile`, `README.md`, package files, plans, profiling tools and earlier
reports are preserved.

Both builds use production preview at `http://127.0.0.1:4331`. Each route and
profile has five Lighthouse loads and three applied interaction runs. Baseline
loads are three initial runs plus two additional runs in a separate folder;
the runtime source is identical across them. Candidate loads are five runs in
one folder. All runs use fresh contexts and the same pinned browser. Profilers,
builds, and browser suites run sequentially.

- Host: Apple M4 Pro, 12 logical CPUs, 24 GiB; Darwin 25.6.0 arm64; Node 22.22.2.
- Lighthouse 13.5.0, Chromium 147.0.7727.15; browser checks also use WebKit 26.4.
- Simulated mobile: 412×823, DPR 1.75, 4× CPU, 150 ms RTT, 1638.4 Kbit/s. Desktop:
  1350×940, DPR 1, 1× CPU, 40 ms RTT, 10240 Kbit/s.
- Applied CDP mobile: 4× CPU, 150 ms request latency, 1.6 Mbit/s. Desktop: 1× CPU,
  40 ms, 10 Mbit/s. Browser cache is disabled. These are request-level
  approximations, not physical-device or packet-shaped measurements.
- Functional views use DPR 1; export checks use DPR 2. Third-party requests and
  analytics remain enabled. Remote cache state is uncontrolled.

The [compact JSON](2026-09-28-perf-02-fonts-results.json) preserves unrounded
statistics, calibration values, font provenance, and verification outcomes.
Times below are milliseconds, shown as median [min–max]. Load metrics are
simulated; applied results are separate. Event Timing is a lab diagnostic,
not field INP. No new field data was collected and local serving does not prove
deployed CDN behavior.

FCP (first contentful paint) is when the first text or image appears. LCP
(largest contentful paint) tracks when the largest visible content element
appears. CLS (cumulative layout shift) measures unexpected visual movement;
it is a score, not milliseconds. TBT (total blocking time) adds the portions of
main-thread tasks beyond 50 ms. None of these is the same as the load event or
controls becoming usable, which are recorded separately below.

## Repeated measurements

Lighthouse simulated navigation, five loads per route/profile/cohort:

| Route / metric | Mobile before | Mobile after | Desktop before | Desktop after |
| --- | ---: | ---: | ---: | ---: |
| Home: FCP | 1,363 [1,360–1,368] | 1,365 [1,361–1,437] | 338 [336–378] | 336 [335–380] |
| Home: LCP | 2,188 [2,115–2,336] | 2,411 [2,262–2,415] | 498 [476–518] | 496 [495–540] |
| Home: TBT | 16 [6–26] | 19 [6–20] | 0 [0–0] | 0 [0–0] |
| Home: CLS | 0 [0–0] | 0 [0–0] | 0.001454 [0.001454–0.011183] | 0.000677 [0.000131–0.000677] |
| Home: Speed Index | 1,363 [1,360–1,368] | 1,365 [1,361–1,437] | 338 [336–378] | 336 [335–380] |
| Home: transfer bytes | 614,088 [614,080–614,364] | 614,259 [614,241–614,262] | 1,114,084 [1,114,080–1,114,134] | 1,114,257 [1,114,246–1,114,541] |
| Home: score, secondary | 98 [98–99] | 98 [97–98] | 100 [100–100] | 100 [100–100] |
| Reviews: FCP | 1,820 [1,819–1,821] | 1,820 [1,818–1,894] | 441 [440–442] | 440 [440–442] |
| Reviews: LCP | 2,720 [2,496–2,870] | 2,720 [2,421–2,870] | 601 [582–602] | 600 [600–602] |
| Reviews: TBT | 22 [18–22] | 22 [15–24] | 0 [0–0] | 0 [0–0] |
| Reviews: CLS | 0 [0–0] | 0 [0–0.000040] | 0.001454 [0.001454–0.001454] | 0.000677 [0.000677–0.000677] |
| Reviews: Speed Index | 1,820 [1,819–1,821] | 1,820 [1,818–1,894] | 441 [440–442] | 440 [440–442] |
| Reviews: transfer bytes | 1,405,906 [1,405,900–1,406,187] | 1,406,071 [1,406,057–1,406,079] | 2,062,507 [2,062,499–2,062,792] | 2,062,665 [2,062,657–2,062,670] |
| Reviews: score, secondary | 95 [94–96] | 95 [94–97] | 100 [100–100] | 100 [100–100] |
| Flowchart: FCP | 1,966 [1,966–1,970] | 1,965 [1,964–1,967] | 497 [497–500] | 498 [497–502] |
| Flowchart: LCP | 2,613 [2,608–2,618] | 2,611 [2,605–2,937] | 647 [597–651] | 601 [597–758] |
| Flowchart: TBT | 166 [154–174] | 162 [158–170] | 0 [0–0] | 0 [0–0] |
| Flowchart: CLS | 0 [0–0] | 0 [0–0] | 0.000271 [0.000271–0.000271] | 0.000128 [0.000128–0.000128] |
| Flowchart: Speed Index | 1,966 [1,966–1,970] | 1,965 [1,964–1,967] | 497 [497–500] | 498 [497–502] |
| Flowchart: transfer bytes | 589,652 [589,643–589,666] | 589,819 [589,806–589,839] | 675,717 [675,704–675,988] | 675,881 [675,866–676,160] |
| Flowchart: score, secondary | 93 [93–93] | 93 [91–93] | 100 [100–100] | 100 [100–100] |

Applied network and CPU throttling, three loads per route/profile/cohort:

| Route / metric | Mobile before | Mobile after | Desktop before | Desktop after |
| --- | ---: | ---: | ---: | ---: |
| Home: FCP | 544 [540–544] | 548 [544–556] | 140 [140–148] | 140 [136–152] |
| Home: LCP | 664 [652–668] | 592 [588–592] | 464 [460–472] | 168 [160–176] |
| Home: controls / graph ready | 1,654 [1,590–1,670] | 1,634 [1,581–1,635] | 144 [142–145] | 142 [135–146] |
| Home: load event | 3,202 [3,186–3,212] | 3,166 [3,164–3,245] | 1,034 [1,020–1,045] | 1,046 [1,016–1,052] |
| Home: CLS | 0.175270 [0.175270–0.175270] | 0 [0–0] | 0.204935 [0.204935–0.204935] | 0.000128 [0.000128–0.000128] |
| Reviews: FCP | 604 [596–604] | 616 [608–620] | 140 [140–144] | 140 [140–144] |
| Reviews: LCP | 804 [796–812] | 652 [652–668] | 264 [256–268] | 188 [184–192] |
| Reviews: controls / graph ready | 3,413 [3,372–3,421] | 3,446 [3,438–3,461] | 462 [450–462] | 467 [459–472] |
| Reviews: load event | 5,278 [5,268–5,307] | 5,284 [5,284–5,292] | 1,456 [1,451–1,500] | 1,449 [1,436–1,449] |
| Reviews: CLS | 0.106283 [0.106283–0.106283] | 0.000040 [0.000040–0.000040] | 0.321516 [0.321516–0.321516] | 0.145865 [0.145865–0.145865] |
| Flowchart: FCP | 776 [776–780] | 808 [808–816] | 164 [164–164] | 172 [168–176] |
| Flowchart: LCP | 2,004 [1,984–2,012] | 1,944 [1,940–1,968] | 264 [264–264] | 176 [176–180] |
| Flowchart: controls / graph ready | 2,005 [1,984–2,018] | 1,942 [1,941–1,965] | 407 [405–420] | 413 [410–415] |
| Flowchart: load event | 3,341 [3,311–3,350] | 3,394 [3,392–3,410] | 1,191 [1,092–1,286] | 1,110 [1,099–1,122] |
| Flowchart: CLS | 0 [0–0] | 0 [0–0] | 0.001195 [0.001195–0.001195] | 0.000128 [0.000128–0.000128] |

The clearest benefit is repeatable font-related CLS reduction, supported by the controlled font-release test. Applied LCP improves in the primary cohorts on every route/profile. Simulated reviews and flowchart medians are effectively unchanged. The flowchart retains the preceding improvement; this brief does not establish a new two-second simulated LCP result. One candidate flowchart load reached 2,937 ms while the other four were approximately 2,605–2,613 ms. That sample remains in the range; the recorded LCP node was still START HERE and the unthrottled render delay changed only slightly. No specific cause is established.

The initial home simulated LCP comparison, 2,188 → 2,411 ms, warranted a fresh comparison. Restoring the exact original font CSS reproduced a 2,411 ms median. Restoring the candidate produced 2,338 ms, with overlapping ranges. These confirmation cohorts do not support a stable 223 ms source-dependent penalty or a reliable home LCP speedup. They supplement rather than replace the primary results.

| Confirmation, mobile | Original | Candidate |
| --- | ---: | ---: |
| Home simulated LCP, five loads | 2,411 [2,271–2,413] | 2,338 [2,260–2,411] |
| Flowchart applied FCP, three loads | 776 [768–780] | 808 [804–808] |
| Flowchart applied LCP, three loads | 1,972 [1,968–2,032] | 2,000 [1,968–2,012] |
| Flowchart ready, three loads | 1,971 [1,968–2,035] | 2,003 [1,971–2,014] |

The approximately 32 ms flowchart FCP cost repeats across both comparisons; it is not dismissed as noise. Graph readiness and LCP ranges overlap around two seconds. The primary cohorts also show reviews-mobile readiness 33 ms later and flowchart load-event completion 53 ms later; these smaller differences were not separately isolated. The keep decision favors the large layout-stability gain and delayed-font readability for that small first-paint cost. If zero FCP regression is an absolute release gate, this patch needs further work before release. Desktop reviews also remains above the usual 0.1 CLS target because of its separate hydration layout switch.

An additional experiment put `font-display: swap` on the local fallback aliases. Its five home loads had LCP 2,263 [2,261–2,412] ms, overlapping the other cohorts, and it did not remove the applied flowchart FCP cost. Those extra declarations were reverted. `R/confirmations.json` and the separate `baseline-*-confirm`, `candidate-*-confirm`, and `local-display-*` folders retain all supplemental results. Overall, 75 Lighthouse loads and 45 applied runs completed, including the rejected experiment.

| Route / action | Mobile before | Mobile after | Desktop before | Desktop after |
| --- | ---: | ---: | ---: | ---: |
| Home: Open mobile menu | 24 [24–40] | 24 [24–40] | N/A | N/A |
| Home: Close mobile menu | 24 [24–32] | 24 [24–32] | N/A | N/A |
| Home: Scroll to featured reviews | none | none | none | none |
| Reviews: Type cradle search | 48 [40–48] | 48 [48–56] | 24 [24–24] | 24 [24–24] |
| Reviews: Reset search | 168 [160–168] | 152 [152–160] | 80 [80–88] | 88 [80–88] |
| Reviews: Select first tag | 48 [48–48] | 48 [48–48] | 40 [32–40] | 32 [24–40] |
| Reviews: Switch to tier layout | 128 [120–144] | 128 [120–136] | 48 [48–56] | 48 [48–56] |
| Reviews: Reset filters and layout | 136 [136–144] | 128 [128–136] | 72 [64–72] | 64 [64–80] |
| Flowchart: Type cradle search | 48 [40–48] | 48 [40–48] | 32 [24–32] | 32 [32–32] |
| Flowchart: Fit matching books | 56 [56–56] | 56 [56–64] | 48 [48–48] | 48 [40–48] |
| Flowchart: Clear flowchart search | 24 [24–32] | 24 [24–24] | 24 [24–24] | 24 [24–24] |
| Flowchart: Fit entire flowchart | 120 [120–128] | 128 [112–136] | 208 [200–208] | 200 [200–208] |
| Flowchart: Zoom in | 48 [48–48] | 40 [40–40] | 112 [112–112] | 112 [112–112] |
| Flowchart: Pan flowchart | 32 [32–32] | 32 [24–32] | 96 [96–96] | 96 [96–104] |

Interaction cells show each run's maximum Event Timing duration for the named action, then summarize across three runs. The unchanged action medians and overlapping ranges show no broad interaction regression. Review reset/filter medians move in both directions by roughly one timing bucket; no JavaScript behavior was changed. Flowchart desktop whole-fit remains around 200 ms. Scroll has no Event Timing entries and is shown as none rather than zero. All actions completed with no captured runtime errors. These measurements do not establish field INP.

To repeat the primary cohorts from this full checkout, build and start an owned
preview first, then run each command sequentially into fresh directories:

```bash
npx astro check
npm run build
npm run preview -- --host 127.0.0.1 --port 4331
```

```bash
npm run perf:load -- --base-url http://127.0.0.1:4331 --runs 5 --output artifacts/performance/NEW-02-load
npm run perf:interactions -- --base-url http://127.0.0.1:4331 --runs 3 --output artifacts/performance/NEW-02-interactions
node scripts/verify-flowchart-performance.mjs --base-url http://127.0.0.1:4331 --baseline artifacts/performance/20260928T063039Z-01-flowchart/baseline-regression-04/graph-inventory.json --output artifacts/performance/NEW-02-flowchart
```

The font-specific diagnostic scripts and their inputs are retained under `R`:
`verify-fonts.mjs`, `verify-readability.mjs`, `verify-font-cache.mjs`,
`font-failures-export.mjs`, `display-probe.mjs`, and `fallback-probe.mjs`.
Their outputs distinguish ordinary timing cohorts from intercepted-font tests.

## Waterfall and fallback calculation

The initial view uses one 48,432-byte Inter Latin font body, discovered directly
from the compiled local stylesheet. In baseline reviews-mobile-1, the main CSS
finishes at 17.0 ms and the font starts at 19.2 ms, finishing at 25.9 ms. These are
the unthrottled trace's resource timings, not the simulated LCP or applied
request timings. There is no intermediate Google stylesheet. The font-display
audit reports no wasted invisible-text time in that quick recording, despite
the separate delayed-response WebKit failure.

In candidate reviews-mobile-1, the main CSS finishes at 15.4 ms and the font is discovered at 17.5 ms, finishing at 23.3 ms. Both traces contain the same single Inter Latin response: 48,752 transferred bytes including headers. The two stylesheet transfers total 26,234 → 26,434 bytes, a 200-byte increase; the fallback rules are folded into the existing stylesheet. There is no added CSS request, Google Fonts request, font body, or preload. The small raw-timing difference is not a separate discovery optimization claim. The simplified font path was already delivered by the inherited self-hosting change. See `R/before-waterfall.json` and `R/after-waterfall.json`.

Calibration uses character frequencies from the current review bodies for
`reluctant_dungeon` and `terminate_the_other_world`, excluding frontmatter and
URLs. Chromium Canvas measures every character at 100 px in each Inter weight
and in Arial regular for 400/500 or Arial Bold for 600–900. For each weight,
`size-adjust` is the ratio of the weighted Inter width to the weighted Arial
width. The actual Inter binary has ascent 1984, descent 494, lineGap 0 and
unitsPerEm 2048. Vertical overrides divide those normalized metrics by the size
adjustment. Values are rounded to four decimal places as percentages.

| Inter weight | Local face | Size adjustment | Ascent override | Descent override |
| ---: | --- | ---: | ---: | ---: |
| 400 | Arial | 107.2515% | 90.3250% | 22.4902% |
| 500 | Arial | 108.3402% | 89.4174% | 22.2642% |
| 600 | Arial Bold | 101.4375% | 95.5022% | 23.7793% |
| 700 | Arial Bold | 102.4467% | 94.5614% | 23.5450% |
| 800 | Arial Bold | 103.6803% | 93.4362% | 23.2649% |
| 900 | Arial Bold | 105.0259% | 92.2391% | 22.9668% |

`R/calibrate-fallback.mjs`, `fallback-calibration.json` and `font-metrics.json`
retain the complete inputs and calculation. This is an approximate glyph-width
match, not a promise that every character has the same shape. The
[size-adjust descriptor](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face/size-adjust)
scales fallback glyphs and metrics; ascent, descent and line-gap overrides match
the line box. Recalibrate if the real font assets change.

Controlled font-release diagnostics compare the original policy, matched
fallback alone, and matched fallback plus `swap`. Mobile home font-shift totals
fall from 0.175270 to 0; reviews from 0.106283 to 0.0000399. The review control boxes
match before and after release in Chromium; WebKit differs by 0.328 px vertically
without changing their height. WebKit does not expose LayoutShift entries, so
its geometry checks are not CLS measurements. Use
`R/fallback-probe/results-with-support.json`; zero entries in the original raw
WebKit output mean unsupported, not measured zero.

No arbitrary metric overrides, system-font replacement of the final design,
extra font binaries, or preload experiment was retained. The earlier preload
rejection remains relevant: WebKit fetched separate CORS and no-CORS bodies.
The current cold/warm check observes each requested font URL once per
navigation. Astro preview uses `Cache-Control:no-cache`; warm requests either
use cached data or transfer a 300-byte 304 revalidation, with no repeated font body.

## Font inventory and consumers

| Family | Subset | Weight | Bytes |
| --- | --- | --- | ---: |
| Architects Daughter | latin-ext | 400 | 7,008 |
| Architects Daughter | latin | 400 | 13,140 |
| Inter | cyrillic-ext | 400–900 variable | 25,844 |
| Inter | cyrillic | 400–900 variable | 18,744 |
| Inter | greek-ext | 400–900 variable | 11,272 |
| Inter | greek | 400–900 variable | 19,044 |
| Inter | vietnamese | 400–900 variable | 10,280 |
| Inter | latin-ext | 400–900 variable | 85,272 |
| Inter | latin | 400–900 variable | 48,432 |

All nine binaries match the inherited SHA-256 hashes. Exact upstream URLs and
checksums are retained in the compact JSON and the existing
[font README](../../src/assets/fonts/README.md). Both original SIL Open Font
License 1.1 notices remain unchanged. Arial is a local OS font reference; no
Arial binary is bundled.

`main.css` imports both the real font declarations and the fallback aliases.
`BaseLayout.astro` supplies this to normal pages. The standalone OG route
imports it directly and therefore receives the same policy. `screenshot.ts`
continues to ask snapdom to embed fonts. No font links were added only to
`Head.astro`, and the existing KaTeX imports, analytics, images, and graph data
are unchanged. Architects Daughter remains available even though source
inspection finds no current rendered component using its utility class.

## Verification and limits

- Astro check and the production build pass; the build emits 455 pages. Final check diagnostics are recorded in `R/closing-check.log`. Six inherited hints remain. An earlier 14-hint run also included eight type-inference hints in these new ignored diagnostic scripts; initializing their error fields removed those additional hints without changing assertions. Both logs are retained.
- `candidate-typography-02`: 28/28 checks pass; `readability-results.json`: 48/48 held/failed-font cases pass; `candidate-cache-02`: 12/12 cold/warm browser-route pairs pass. `unavailable-local-fallback` adds four passing cases where local Arial references are deliberately unavailable.
- The complete flowchart regression suite passes all four production profiles with no runtime errors, first in `candidate-flowchart` and again against the final rebuilt output in `final-flowchart`.
- The color checker passes without `--fix`, but its parser sees only 3 of 269 edges. The full regression inventory independently checks all 269 edges. This is not comprehensive color validation.

Normal typography covers `/`, `/reviews/`, `/reviews/flowchart/`,
`/kitchensink/`, `/reviews/reluctant_dungeon/`, `/og/reluctant_dungeon/`, and
`/reviews/terminate_the_other_world/`. The first review is the current longest
title; the other contains smart punctuation. No current review title contains
non-ASCII characters. Additional probes cover café, naïve, Œuvre, Łódź, Greek,
Cyrillic and Vietnamese, all six Inter weights and Architects Daughter.
Architects Daughter's unsupported scripts continue through its existing
fallbacks.

Before/after font measurements and sampled computed typography, dimensions,
and wrapping match across all 28 browser/profile/route combinations:
784 font measurements. Side-by-side contact sheets cover each route, with
full screenshots retained. Pixel differences in the two desktop home views
are confined to the animated book covers; all other 26 views have no channel
difference greater than 3/255. No sampled block has new horizontal overflow.

The 48 held/failed-font cases check actual painted headings and working review
or graph controls. Held requests are released after 4.5 seconds; the review
control boxes remain stable within 1 px. The separate font-cache suite covers
cold and warm navigation on six routes in both browsers, including standalone
OG. The nine face files also load successfully in the multilingual typography
probe. No physical devices were tested. Local-font metric matching benefits
systems where the selected Arial faces are available; other systems keep the
existing generic fallbacks.

Exports download at 2572×816 for the short DPR 2 list and 269×8000 for the long
167-book list. The actual images were inspected at the top, middle and bottom.
All four decoded outputs are pixel-identical to the inherited follow-up's
exports, including their typefaces. **Export layout quality is not a clean
pass:** Chromium's short export is left-cropped, and WebKit's long export clips
the right side/second column. The old files reproduce both defects exactly.
The nonblank-image assertions only prove successful rendering/downloads;
`R/export-pixel-comparison.json` proves font and pixel preservation. These
existing crop defects belong in the image/export follow-up.

The production flowchart suite preserves all 269 nodes, 269 edges, 167 books and
102 decisions, including cached geometry, full fallback content, search and
keyboard behavior, offscreen fits, quiz/deep-link navigation, image loading and
failures, animated pulses after remount, minimap, resize, and observer cleanup.
Chromium mobile also exercises emulated pan/pinch; WebKit has touch taps but no
public multi-touch API in this harness. The inherited dev drag-stop exception
is unchanged and remains documented in the earlier report; authoring source
and position cache were not edited.

Harness corrections are preserved with their failed artifacts. The first
typography run compared whole-body DOM Range fragment counts as if they were
line counts; only that invalid aggregate was removed, retaining dimensions and
leaf-text checks. Mobile OG screenshots need coordinates scaled from the fixed
1200 px layout; the corrected pixel crop passes all four retests. The first cache
check rejected valid 304 responses; it now requires successful cold loads and
body-free warm reuse. No production code was changed to satisfy those mistakes.

## Exact handoff and remaining work

Task-owned files are `src/styles/fonts.css`, `src/styles/font-fallback.css`, `src/styles/main.css`, `src/assets/fonts/README.md`, `docs/DECISIONS.md`, and this report's Markdown and JSON files. ADR-016 records the policy and calibration tradeoff. `R/retained-source-manifest.json`, `retained.patch`, and `retained-source.tar.gz` preserve their final hashes and contents. Nothing is staged.

`R/preservation-audit.json` compares all 3,114 original files by SHA-256 and mode: only the four intended existing files changed; the fallback CSS and two reports are new. All inherited dirty files and untracked handoff files are unchanged, as are font binaries/licenses, graph data and geometry, analytics, JavaScript sources, and the preceding module hints. HEAD and the index are unchanged.

Candidate font-source hashes match the measured implementation exactly. The runtime audit confirms matching CSS and font bytes, but **does not claim a byte-identical whole build**. Sixteen JavaScript chunk names and five HTML hashes differ after rebuilding. Build logs show two recurring chunk variants in both original and candidate builds despite unchanged JavaScript source. `R/runtime-comparison.json` lists the differences; `final-runtime.json` records the final served output. The final flowchart regression pass checks that rebuilt output separately. This variability limits interpretation of very small timing differences.

The font-related review shift is addressed. Desktop reviews still switches
from the server's cover grid to the client's wide layout when screen width is
greater than 1280 px. The controlled test isolates a 0.137589 hydration shift before
the held font is released; `ReviewsExplorer.svelte` selects the two different
defaults. This is separate from font metrics and remains unchanged. Preserve
that distinction when tackling the next image/hydration brief.

The owned preview on port 4331 was stopped after verification. The unrelated preview on port 4329 (PID 88067) was left untouched; `R/process-cleanup.json` records the check. No dev authoring save ran and the user's position cache was never written. The inherited dev-only `onnodedragstop` exception (`node` versus `targetNode`) was not retested or repaired here. All new work remains uncommitted.

[Brief 3](../plans/2026-09-28-perf-03-images.md) must inherit the entire working
tree and this report, plus both preceding flowchart reports. Its export checks
should include the inherited Chromium short and WebKit long crop defects, and
its hydration checks should account for the desktop layout switch. No Brief 3
implementation was started here.
