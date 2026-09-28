# Flowchart first-load follow-up

The retained changes reduce mobile simulated LCP from **4,059 ms to 2,611 ms**
and observed graph readiness under applied throttling from **3,058 ms to
2,025 ms**. The useful graph is now ready in roughly two seconds in this local
test. The stricter two-second simulated LCP target is **not reached**.

This is a separate investigation after commit
`02c4b3331428e55f5fe6d34194a16a3e46631e72`. The preceding
[Brief 1 report](2026-09-28-perf-01-flowchart-results.md) remains its historical
snapshot. New changes are local and uncommitted; nothing was pushed or deployed.

## Retained changes

- Bundle the exact existing Inter and Architects Daughter WOFF2 files through
  Vite. Replace the blocking Google Fonts CSS import with local declarations,
  and remove the two obsolete font preconnects from `Head.astro`. Preserve all
  nine Unicode subsets, font families, weights, and `font-display: fallback`.
  Include both upstream SIL Open Font Licenses and asset provenance.
- Add `scripts/flowchart-preload.mjs`, an Astro integration that puts eleven
  low-priority module preload links in `/reviews/flowchart/` only. It walks the
  final static imports of the generated Flowchart island and its renderer. The
  browser can fetch these existing modules while parsing HTML. It does not
  postpone hydration, replace graph content, or fetch another runtime bundle.

The complete graph, positions, geometry, cover renditions, accessible fallback,
and graph component source are unchanged from the starting commit. The work
does not execute the image brief or the remaining font brief recommendations.
See [ADR-014 and ADR-015](../DECISIONS.md) for the loading decisions.

## Method and identity

Artifacts live in
`artifacts/performance/20260928T074452Z-flowchart-first-load/`, abbreviated `R`
below. `initial-state.json`, the initial patches, and `inherited-work.tar.gz`
capture the starting checkout and inherited work. All source files already
present were inventoried before edits.

Each complete cohort has five Lighthouse loads and three applied interaction
runs **per device**, with fresh browser contexts and cold caches. The same
production preview, pinned runners, and browser were used throughout. One
profiler ran at a time, without concurrent builds or browser tests. The fresh
confirmation baseline is used for every before/after comparison.

| Setting             | Value                                                           |
| ------------------- | --------------------------------------------------------------- |
| Host                | Apple M4 Pro, 12 CPU, 24 GiB; Darwin 25.6.0 arm64               |
| Runtime             | Node 22.22.2; Lighthouse 13.5.0; Chromium 147.0.7727.15         |
| Functional browsers | Same Chromium; WebKit 26.4                                      |
| Production server   | Astro preview at `http://127.0.0.1:4331`                        |
| Lighthouse mobile   | Simulated 4× CPU, 150 ms RTT, 1,638.4 Kbit/s; 412×823, DPR 1.75 |
| Lighthouse desktop  | Simulated 1× CPU, 40 ms RTT, 10,240 Kbit/s; 1350×940            |
| Applied mobile      | CDP 4× CPU, 150 ms latency, 1.6 Mbit/s                          |
| Applied desktop     | CDP 1× CPU, 40 ms latency, 10 Mbit/s                            |
| Third parties       | Retained, including analytics and remote assets                 |

`comparisons.json` contains unrounded statistics; the checked-in
[compact JSON](2026-09-28-flowchart-first-load-results.json) stores comparison
metrics for every complete cohort as `[median, minimum, maximum]` tuples. Raw traces, Lighthouse HTML/JSON,
screenshots, request data, and exact runtime settings remain beside each cohort.
These measurements describe local production output, not the deployed CDN or
physical devices. Event Timing values below are interaction diagnostics, not
field INP.

To repeat a cohort after building and starting a dedicated production preview,
run these commands sequentially, using fresh output directories:

```sh
profile_run="artifacts/performance/$(date -u +%Y%m%dT%H%M%SZ)-flowchart-repeat"
npm run perf:load -- --base-url http://127.0.0.1:4331 --paths /reviews/flowchart/ --profiles mobile,desktop --runs 5 --output "${profile_run}-load"
npm run perf:interactions -- --base-url http://127.0.0.1:4331 --paths /reviews/flowchart/ --profiles mobile,desktop --runs 3 --output "${profile_run}-interactions"
```

## Before and after

Values are medians with `[minimum–maximum]` ranges. Time values are milliseconds.
Lighthouse FCP, LCP, and Speed Index are simulated. The applied measurements in
the following table come from a separate, genuinely throttled browser run.

| Lighthouse metric            |             Mobile before |           Mobile retained |            Desktop before |          Desktop retained |
| ---------------------------- | ------------------------: | ------------------------: | ------------------------: | ------------------------: |
| FCP                          |       2,421 [2,395–2,445] |       1,968 [1,966–1,969] |             804 [778–874] |             500 [498–502] |
| LCP                          |       4,059 [3,705–4,945] |       2,611 [2,607–2,624] |       1,154 [1,134–1,245] |             771 [600–885] |
| TBT                          |             181 [169–218] |             153 [151–185] |                   0 [0–0] |                   0 [0–0] |
| CLS                          |                         0 |                         0 |                  0.000271 |                  0.000271 |
| Speed Index                  |       2,421 [2,395–2,445] |       1,968 [1,966–1,969] |             804 [778–874] |             500 [498–502] |
| Total transfer, bytes        | 590,107 [590,085–590,110] | 589,621 [589,608–589,625] | 676,161 [676,143–676,163] | 675,671 [675,670–675,678] |
| Image transfer, bytes        | 179,416 [179,402–179,424] | 179,424 [179,418–179,424] | 265,470 [265,468–265,471] | 265,477 [265,469–265,479] |
| Initial image requests       |                         3 |                         3 |                         9 |                         9 |
| Performance score, secondary |                80 [76–84] |                93 [92–93] |                97 [96–97] |              100 [99–100] |

| Applied metric           |       Mobile before |     Mobile retained |      Desktop before |    Desktop retained |
| ------------------------ | ------------------: | ------------------: | ------------------: | ------------------: |
| FCP                      | 1,032 [1,028–1,092] |       764 [760–772] |       528 [516–528] |       168 [164–168] |
| LCP                      | 2,972 [2,944–3,364] | 2,024 [2,024–2,052] |       620 [608–620] |       256 [256–264] |
| Graph/search readiness   | 3,058 [3,025–3,474] | 2,025 [2,024–2,056] |       895 [869–901] |       410 [405–416] |
| Load event               | 3,784 [3,784–4,121] | 3,304 [3,265–3,350] | 1,214 [1,180–1,214] | 1,117 [1,104–1,133] |
| Initially mounted nodes  |                  10 |                  10 |                  19 |                  19 |
| Initially decoded covers |                   0 |                   0 |                   6 |                   6 |

Mobile simulated LCP improves by 36%; applied graph readiness improves by 34%.
The load event still occurs after three seconds. The unchanged image requests
and nearly identical transfer show that this improvement comes from request
discovery and scheduling, rather than reducing image quality or primary content.

## Experiments and critical paths

The baseline trace shows the shared CSS discovering a remote Google Fonts
stylesheet before the island can hydrate. In the first baseline Lighthouse
trace, that stylesheet starts at 30 ms and finishes at 434 ms; Flowchart module
discovery follows at 463 ms. Those are trace timings used by Lighthouse's model,
not its simulated LCP or the separate applied result. With local fonts, the
island request starts at 44 ms in the comparable trace.

| Complete cohort                             | Mobile simulated LCP | Mobile simulated FCP | Mobile applied graph readiness | Desktop simulated LCP | Decision            |
| ------------------------------------------- | -------------------: | -------------------: | -----------------------------: | --------------------: | ------------------- |
| Fresh baseline                              |  4,059 [3,705–4,945] |  2,421 [2,395–2,445] |            3,058 [3,025–3,474] |   1,154 [1,134–1,245] | Reference           |
| Local fonts                                 |  2,532 [2,530–2,546] |  2,114 [2,038–2,189] |            2,533 [2,522–2,537] |         600 [575–601] | Retained foundation |
| Local fonts + raw nodes                     |  2,527 [2,524–2,538] |  2,188 [2,187–2,189] |            2,519 [2,504–2,559] |         599 [577–601] | Reverted            |
| Local fonts + default-priority module hints |  2,607 [2,599–2,617] |  2,414 [2,412–2,417] |            2,044 [2,020–2,049] |         644 [599–782] | Superseded          |
| Local fonts + low-priority module hints     |  2,611 [2,607–2,624] |  1,968 [1,966–1,969] |            2,025 [2,024–2,056] |         771 [600–885] | Retained            |

The raw-node experiment used a production-only raw snapshot to avoid deep state
proxying. Its improvement overlapped the font-only spread, so the component
change was reverted despite passing the four-profile regression suite.

Module hints address the remaining serial discovery chain. Chromium records
their initial priority as `Low`, and every expected module is fetched once.
They make the actual graph ready roughly half a second sooner than local fonts
alone. The tradeoff is a slightly higher simulated mobile LCP, and desktop
simulated LCP rises from 600 to 771 ms with a 600–885 ms range. All are below the
fresh baseline. Low priority is retained because it also avoids the simulated
first-paint penalty of default-priority hints. Applied FCP is 764 ms for both
hint variants, versus 640 ms for local fonts alone: that smaller regression is
accepted for the earlier interactive graph, not concealed by the headline.

Two additional experiments failed before acceptance:

- **Latin font preload:** Chromium reused it, but WebKit fetched two complete
  48,432-byte font bodies, with CORS mode for the preload and no-CORS mode for
  the CSS request. The preload was removed before a timing cohort. Evidence:
  `webkit-preload-network.json` and `preload-font-diagnostics/`.
- **Initial module manifest capture:** `generateBundle` captured a CSS-only JS
  chunk later removed by Vite. An emitted-file assertion caught the missing
  target, and the incomplete `preload-modules-load/` run was interrupted and
  excluded. Moving capture to `writeBundle` fixed the manifest. The complete
  `preload-modules-fixed/` and `preload-low/` cohorts use the corrected build.

## Interaction and behavior checks

Maximum Event Timing duration per action, reported as three-run median and
range. Neither JavaScript interaction logic nor the model changed.

| Action             | Mobile before | Mobile retained | Desktop before | Desktop retained |
| ------------------ | ------------: | --------------: | -------------: | ---------------: |
| Type Cradle search |    40 [40–64] |      48 [40–56] |     24 [24–32] |       32 [32–32] |
| Fit matching books |    64 [56–64] |      64 [56–72] |     48 [40–48] |       40 [40–48] |
| Clear search       |    24 [24–24] |      24 [24–32] |     24 [24–24] |       24 [24–24] |
| Fit entire graph   | 112 [112–112] |   120 [112–128] |  200 [200–200] |    200 [200–208] |
| Zoom               |    40 [40–48] |      48 [48–56] |  120 [112–120] |     112 [80–112] |
| Pan                |    32 [24–32] |      32 [24–32] |     96 [88–96] |     104 [96–104] |

Several medians move by one eight-millisecond Event Timing bucket. With three
samples and overlapping or touching ranges, these do not establish a new
interaction improvement or a substantial regression. The original viewport
remount tradeoff remains.

The final production regression passed Chromium and WebKit on desktop and
mobile with no runtime errors. It compares the entire serialized model and
accessible fallback against the original inventory: 269 nodes, 269 edges,
167 books, and 102 decisions. Checks include cached geometry, offscreen single
and multiple fits, cover decoding and failures, animated pulses after remount,
minimap and viewport changes, search and keyboard navigation, quiz results and
deep links, touch taps, and observer cleanup. Chromium additionally exercises
CDP pan/pinch. WebKit has no public multi-touch API in this harness; no physical
devices were used. Evidence: `final-regression/`.

The strict dev audit exits **1**, as it did for the original code. Both browsers
report the inherited `onnodedragstop` exception: the callback destructures
`node`, while SvelteFlow provides `targetNode`. All drag/discard and save/reset
payload assertions pass, but the runtime is not a clean pass. Save/reset
requests were intercepted to preserve cached positions. The final errors match
the original baseline's messages; see `final-dev/results.json` and
`final-dev/inherited-error-comparison.json`. This unrelated defect is unchanged.

Final validation passed: `astro check` reports zero errors, zero warnings, and
the same six inherited hints; the production build emits 455 pages. JavaScript
syntax validation and `git diff --check` pass. The color checker passes without
`--fix`, but its parser sees only three of 269 edges, so it is limited evidence.
The final build's 50 HTML/JS/CSS/font file digests match the measured build
exactly. A final Chromium/WebKit network check confirms each of eleven hinted
modules loads once with HTTP 200, no local asset failures or runtime errors,
and no Google Fonts requests. Other sampled routes receive no module hints.

The preservation audit checks all 3,097 files from the initial inventory. Only
the four intended existing files differ; inherited edits, original reports,
graph data, cached positions, and all file modes are preserved. HEAD and the
index are unchanged. Exact delivery files and hashes are recorded in
`retained-source-manifest.json`; the patch and source archive are retained in
`retained.patch` and `retained-source.tar.gz`. See `final-preservation-audit.json`,
`final-runtime-digest-comparison.json`, and `final-network-check.json` for the
corresponding assertions.

## Shared font verification

The same font files feed shared layouts, standalone OG pages, and screenshot
export. Before/after probes cover `/`, `/reviews/`, `/reviews/flowchart/`,
`/kitchensink/`, `/reviews/mother_of_learning/`, and `/og/mother_of_learning/` in
desktop/mobile Chromium and WebKit: 24 browser/profile/route combinations.
All 672 sampled text metrics match within 0.01 pixels, covering the six Inter
weights, Architects Daughter, Latin extended text, Greek, Cyrillic, and
Vietnamese. Screenshots are saved in `before-fonts/` and
`local-fonts-typography/`; representative shared pages were visually inspected.

Font diagnostics also verify cold/warm request reuse, aborted fonts, deliberately
held fonts, navigation, and short/long review screenshot exports in both
browsers. The short export is 2572×816; the 167-book export is 269×8000 after the
existing pixel-budget scaling. Both contain embedded fonts and visible image
content. Short exports were visually inspected in both browsers.

Astro preview serves `Cache-Control: no-cache`: a warm font request transfers
300 bytes of revalidation headers, rather than another font body. An initial
test incorrectly required zero bytes and failed. Its assertion was corrected;
the failed evidence remains in `font-failures-export/`, and the corrected checks
are in `preload-modules-diagnostics/`.

**WebKit held-font limitation:** A Playwright-held WOFF2 response can leave text
blank despite `font-display: fallback`. This reproduces with the original
remote CSS as well as the local files; the policy was preserved. Navigation
assertions pass, but this is not a readability pass. The explicit `limit` field
records that distinction. Chromium displays held-font fallback, and both
browsers display readable fallback when the font request is aborted. Evidence:
`webkit-local-no-preload-held.*` and `webkit-remote-original-held.*`.

The exact upstream URLs, checksums, and sizes are in the compact result JSON's
`fontSources` and `R/font-assets.json`. The binaries are unmodified. The source
Google Fonts CSS, both SIL license files, and asset README preserve provenance.
The loading approach follows [web.dev's font-loading guidance](https://web.dev/articles/optimize-webfont-loading);
the module hints use the browser's [module preload mechanism](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/modulepreload).

## Remaining boundary

The retained build is close to two seconds for observed graph readiness, but
simulated mobile LCP remains 611 ms above the target. The bounded font and module
discovery changes are exhausted for this pass. The rejected raw-state change
does not support a broader state rewrite. Further work would need a separate
investigation of the graph's bundle, initialization, and rendering architecture,
with the same geometry and behavior protections; these results do not establish
a hard performance ceiling.

No primary content was deferred to improve a score, analytics were retained,
and image quality did not change. Local synthetic results require a deployed
follow-up before claiming the same field improvement. Physical-device testing
and field INP remain outside this run.
