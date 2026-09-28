# Flowchart performance results — 2026-09-28

Status: accepted locally. Production regressions pass in both browsers and profiles. Authoring UI assertions pass with an inherited dev-only runtime defect documented below.

The final patch combines native lazy covers, production viewport rendering, and search dimming inside custom nodes. Across five load runs per device, mobile initial image transfer fell 94%, simulated LCP fell 72%, and TBT fell 39%. Across three applied interaction runs, mobile search fell from 200 to 48 ms and clearing from 216 to 24 ms. Graph content, cached geometry, cover renditions, and navigation logic are unchanged.

## Scope and exact patch

[Brief 1](../plans/2026-09-28-perf-01-flowchart.md) is the only implemented brief. Starting and final HEAD: `1cc5fe89054f86a78b1cc9c6369bdb17d97d80ef`. All changes remain local and uncommitted. No commit, push, deployment, or PR was made.

Artifact root: [`artifacts/performance/20260928T063039Z-01-flowchart/`](../../artifacts/performance/20260928T063039Z-01-flowchart/). Paths below are relative to this directory unless linked elsewhere.

- `initial-state.json` records SHA-256, existence, and modes for every tracked and non-ignored untracked file. `initial-status.txt`, `initial-worktree.patch`, `initial-index.patch`, and `inherited-work.tar.gz` preserve the original Git state and dirty contents. Ignored caches, dependencies, and older artifacts are outside that snapshot.
- Inherited modified files are `.gitignore`, `CLAUDE.md`, `Makefile`, `README.md`, `package.json`, and `package-lock.json`. Inherited untracked work includes the performance skill, original reports and three briefs, other plans, and the post-embeds verifier. These files are preserved.
- Production changes are limited to `src/components/islands/Flowchart.svelte`, `src/components/islands/flowchart/BookNode.svelte`, `src/components/islands/flowchart/DecisionNode.svelte`, and `src/styles/flowchart.css`.
- Supporting changes are the new `scripts/verify-flowchart-performance.mjs`, this report, its [compact JSON](2026-09-28-perf-01-flowchart-results.json), and ADR-013 in [DECISIONS.md](../DECISIONS.md).
- `final-production.patch` is byte-identical to the measured `search-dim.patch`. Its SHA-256 is `c5bd399fc91337eef5cedd2d30631791b4e44ab30cfcf3304e680da096b3b9f7`. `production-identity.json` records each source file hash. `final-state.json` records the complete handoff inventory and preservation audit; `final-task.patch` includes task-owned source, documentation and new files.

## Measurement method

The comparison uses fresh local production builds at `http://127.0.0.1:4331/reviews/flowchart/`. It does not compare against the older deployed report. Hardware: Apple M4 Pro, 12 logical CPUs, 24 GiB RAM; Darwin 25.6.0 arm64; Node 22.22.2; Lighthouse 13.5.0; Chromium 147.0.7727.15. Browser regression coverage also includes Playwright WebKit 26.4.

Each of the four cohorts has **five Lighthouse runs and three applied interaction runs per device**: 40 load runs and 24 interaction runs overall. Each run starts with a fresh browser profile/context. Interaction measurements disable the browser cache. Profilers ran sequentially without concurrent builds or browser tests. Existing idle servers on 4321 and 4329 were left alone. Third-party network requests remained enabled; remote cache state was uncontrolled.

- Lighthouse: simulated mobile 4× CPU, 150 ms RTT, 1,638.4 Kbit/s, 412×823 at DPR 1.75; desktop 1× CPU, 40 ms RTT, 10,240 Kbit/s, 1350×940 at DPR 1. Exact settings are in each load manifest.
- Applied CDP: mobile 4× CPU, 150 ms latency, 1.6 Mbit/s download; desktop 1× CPU, 40 ms latency, 10 Mbit/s. Viewports match the load profiles.
- Functional regressions use fresh desktop/mobile Chromium and WebKit contexts at DPR 1. Cover responses are explicitly held or aborted for loading checks; these tests are separate from profiling.

All table cells show **median [minimum–maximum]**. Times are milliseconds, bytes are decimal bytes, and times are rounded to the nearest millisecond for readability. JSON retains unrounded measurements. Event Timing values are the maximum recorded event duration per scripted action; the three resulting samples are then summarized. They are diagnostics, not field INP. Pan samples do not represent the whole gesture or its frame rate. Automation-to-paint values include Playwright waits and are not used as latency claims.

## Before and final load results

Five samples per cell. Simulated LCP is separate from applied LCP, mounted-graph readiness, and the load event.

| Metric | Mobile before | Mobile final | Desktop before | Desktop final |
| --- | ---: | ---: | ---: | ---: |
| FCP (ms) | 2,433 [2,414–2,488] | 2,445 [2,418–2,499] | 803 [792–821] | 824 [791–829] |
| Simulated LCP (ms) | 14,218 [10,671–15,894] | 4,041 [3,727–4,384] | 2,621 [2,444–2,820] | 1,166 [1,142–1,181] |
| TBT (ms) | 294 [269–392] | 178 [174–226] | 2 [0–5] | 0 [0–0] |
| CLS | 0 [0–0] | 0 [0–0] | 0.000271 [0.000271–0.000271] | 0.000271 [0.000271–0.000271] |
| Speed Index (ms) | 2,433 [2,414–2,488] | 2,445 [2,418–2,499] | 803 [792–821] | 824 [791–829] |
| Total transfer (bytes) | 3,408,391 [3,408,390–3,408,393] | 590,112 [590,104–590,120] | 3,408,398 [3,408,382–3,408,450] | 676,167 [668,012–676,176] |
| Image requests | 170 [170–170] | 3 [3–3] | 170 [170–171] | 9 [9–9] |
| Image transfer (bytes) | 2,997,752 [2,997,751–2,997,754] | 179,421 [179,416–179,428] | 2,997,759 [2,997,752–2,997,811] | 265,477 [265,447–265,484] |
| Script evaluation diagnostic (ms) | 715 [678–834] | 753 [703–794] | 173 [169–188] | 187 [182–206] |
| Style/layout diagnostic (ms) | 642 [606–710] | 430 [370–447] | 163 [158–165] | 118 [109–127] |
| Paint/composite/render diagnostic (ms) | 432 [416–460] | 125 [110–131] | 104 [101–105] | 36 [34–43] |

The mobile initial viewport contains no book cards, so the final three image requests are page assets. Desktop initially loads six book covers plus page assets. The full 167-book model remains available. There is no timer that defers work beyond a measurement window: covers are fetched as nodes become relevant to the viewport. FCP and CLS are effectively unchanged. The optimization reduces image transfer and rendering work; script-evaluation diagnostics do not show a startup JavaScript improvement.

### Applied load observations

Three samples per cell. Readiness is the runner's mounted graph/search condition. The decoded-image row records successful initial image loads (`naturalWidth > 0`); the separate behavioral suite explicitly awaits `decode()` on navigated covers.

| Metric | Mobile before | Mobile final | Desktop before | Desktop final |
| --- | ---: | ---: | ---: | ---: |
| Graph/search ready (ms) | 3,456 [3,356–3,593] | 3,072 [3,058–3,097] | 938 [908–992] | 909 [891–921] |
| Applied LCP (ms) | 3,204 [3,136–3,312] | 2,980 [2,972–3,000] | 640 [588–652] | 636 [608–648] |
| Load event (ms) | 18,585 [18,540–18,666] | 3,798 [3,780–3,817] | 3,430 [3,428–3,448] | 1,238 [1,205–1,258] |
| Applied CLS | 0 [0–0] | 0 [0–0] | 0.001195 [0.001195–0.001195] | 0.001195 [0.001195–0.001195] |
| Initially mounted nodes | 269 [269–269] | 10 [10–10] | 269 [269–269] | 19 [19–19] |
| Initially loaded book images | 167 [167–167] | 0 [0–0] | 167 [167–167] | 6 [6–6] |
| Load long-task total (ms) | 831 [780–889] | 640 [639–645] | 215 [202–215] | 117 [117–119] |

Native lazy loading alone substantially shortened the load event without improving graph readiness or applied LCP. Production viewport rendering then improved mobile readiness by about 0.4 seconds. The much larger simulated LCP change must not be reported as an equivalent improvement in observed readiness.

## Bounded experiments and decisions

Every candidate passed checks/build and the production regression suite before its measurement cohort. Each row below is cumulative. Cohorts are `before`, `native-lazy`, `virtualized`, and `search-dim`; the last is the final accepted production patch, not a separate remeasurement.

### 1. Native lazy covers — keep as part of the final combination

Change only `loading="eager"` to `loading="lazy"` in `BookNode.svelte`; retain dimensions, URL and rendition. The browser supplies loading thresholds without a custom observer. See [browser-level lazy loading](https://web.dev/articles/browser-level-image-lazy-loading). Transformed-canvas behavior was tested directly.

Mobile image transfer fell from 2,997,752 to 405,366 bytes; desktop from 2,997,759 to 936,930 bytes. This established a useful loading benefit, but it was not a sufficient final result: mobile search/clear medians rose by 16 ms with overlapping ranges, and their long-task totals increased. One zoom sample took 496 ms, including about 455 ms presentation delay; the other two took 80 ms. All samples remain in the report. The subsequent rendering change removes those search long tasks and the final zoom range is 48–48 ms.

### 2. Production viewport rendering — keep

Add `onlyRenderVisibleElements={!isDev}`. Dev authoring still mounts every node. Search, quiz, routing, and minimap retain the complete model. The installed SvelteFlow implementation retains `nodeLookup`, includes endpoints needed by visible edges, and unobserves nodes on destruction. Navigation already has explicit width/height fallbacks. [SvelteFlow documents added overhead as well as potential benefit](https://svelteflow.dev/api-reference/svelte-flow#onlyrendervisibleelements), so it was measured separately.

Initial mounted nodes fell from 269 to 10 mobile and 19 desktop. More useful evidence is the reduction in mobile style/layout and paint work, search/clear Event Timing, and search long tasks. Mobile search long-task totals were 252 [177–396] ms at baseline, 418 [394–425] ms with lazy loading alone, and 0 [0–0] ms after viewport rendering. Clearing likewise fell from 190 [183–196] ms at baseline to zero recorded long-task time. A zero means no task over the Long Tasks threshold in that action window, not zero work.

Desktop Fit View increased from the native-lazy-only 128 [120–136] ms to 200 [200–200] ms. This is a mount-work tradeoff, with the final median 8 ms above the original 192 [152–224] ms baseline. The original ranges do not establish a credible baseline regression. It is explicitly retained as a residual cost; the final patch improves mobile Fit View and search on both profiles.

### 3. Dim custom nodes directly — keep

Search previously replaced the complete node array to propagate wrapper classes through SvelteFlow. Custom book/decision nodes now read a reactive context predicate and dim their existing content. Edge dimming is unchanged. This preserves the graph model and dragged positions while avoiding node-adoption work for each keystroke. The test compares effective opacity, so it checks the outcome rather than requiring a particular class location.

Mobile search improved from 72 [56–72] to 48 [48–56] ms, and clear-search from 48 [48–48] to 24 [24–24] ms. Desktop search/clear remained around 32/24 ms. Load LCP varies between these cohorts (3,761 vs 4,041 ms mobile), with nearly identical overlapping ranges; no startup improvement is attributed to this search-only change. Geometry, dimming after remount, pulses, delayed covers, and authoring checks gate acceptance.

### Load measurements across iterations

Mobile, five samples per cell:

| Metric | Before | Lazy covers | + Visible elements | + Direct dimming (final) |
| --- | ---: | ---: | ---: | ---: |
| Simulated LCP (ms) | 14,218 [10,671–15,894] | 4,992 [4,951–5,558] | 3,761 [3,744–4,391] | 4,041 [3,727–4,384] |
| TBT (ms) | 294 [269–392] | 247 [242–281] | 184 [178–194] | 178 [174–226] |
| Image requests | 170 [170–170] | 15 [15–16] | 3 [3–3] | 3 [3–3] |
| Image bytes | 2,997,752 [2,997,751–2,997,754] | 405,366 [405,365–405,796] | 179,424 [179,416–179,426] | 179,421 [179,416–179,428] |
| Style/layout (ms) | 642 [606–710] | 579 [559–609] | 434 [343–502] | 430 [370–447] |
| Paint/composite/render (ms) | 432 [416–460] | 343 [321–351] | 132 [90–166] | 125 [110–131] |

Desktop, five samples per cell:

| Metric | Before | Lazy covers | + Visible elements | + Direct dimming (final) |
| --- | ---: | ---: | ---: | ---: |
| Simulated LCP (ms) | 2,621 [2,444–2,820] | 1,276 [1,186–1,473] | 1,193 [1,149–1,334] | 1,166 [1,142–1,181] |
| TBT (ms) | 2 [0–5] | 0 [0–2] | 0 [0–0] | 0 [0–0] |
| Image requests | 170 [170–171] | 48 [48–48] | 9 [9–9] | 9 [9–9] |
| Image bytes | 2,997,759 [2,997,752–2,997,811] | 936,930 [936,926–936,935] | 265,470 [265,470–265,479] | 265,477 [265,447–265,484] |
| Style/layout (ms) | 163 [158–165] | 143 [142–153] | 112 [97–147] | 118 [109–127] |
| Paint/composite/render (ms) | 104 [101–105] | 87 [84–94] | 36 [27–57] | 36 [34–43] |

### Interaction measurements across iterations

Mobile, three samples per cell, maximum recorded Event Timing duration (ms):

| Metric | Before | Lazy covers | + Visible elements | + Direct dimming (final) |
| --- | ---: | ---: | ---: | ---: |
| Search | 200 [184–208] | 216 [208–224] | 72 [56–72] | 48 [48–56] |
| Fit matching books | 136 [128–168] | 128 [128–152] | 64 [64–80] | 56 [56–72] |
| Clear search | 216 [216–224] | 232 [216–232] | 48 [48–48] | 24 [24–24] |
| Fit View | 160 [152–168] | 144 [120–160] | 128 [120–136] | 128 [112–128] |
| Zoom in | 128 [128–144] | 80 [80–496] | 48 [48–56] | 48 [48–48] |
| Pan diagnostic | 136 [136–144] | 120 [120–128] | 32 [24–32] | 32 [32–32] |

Desktop, three samples per cell, maximum recorded Event Timing duration (ms):

| Metric | Before | Lazy covers | + Visible elements | + Direct dimming (final) |
| --- | ---: | ---: | ---: | ---: |
| Search | 56 [56–64] | 64 [56–64] | 32 [32–32] | 32 [24–32] |
| Fit matching books | 64 [56–64] | 64 [56–64] | 48 [48–48] | 48 [48–48] |
| Clear search | 64 [64–64] | 64 [64–64] | 24 [24–24] | 24 [24–24] |
| Fit View | 192 [152–224] | 128 [120–136] | 200 [200–200] | 200 [200–200] |
| Zoom in | 128 [128–144] | 120 [112–128] | 120 [112–120] | 112 [112–112] |
| Pan diagnostic | 104 [104–104] | 112 [112–120] | 96 [96–104] | 96 [96–96] |

## Regression coverage

Final production results: `final-regression/results.json`. Authoring UI results: `final-dev/results.json`; corrected strict runtime results: `dev-runtime-audit/results.json`. The earlier dev runner incorrectly marked runtime-error rows as passed; use the strict audit for runtime status. The inventory contains **102 decisions, 167 books, 269 nodes and 269 edges**. Every final production context compares all serialized IDs, positions, sizes, labels, search data, links, covers, and accessible fallback HTML with the unchanged baseline inventory. The source data and position cache are independently hash-checked.

| Behavior | Chromium desktop | Chromium mobile | WebKit desktop | WebKit mobile |
| --- | --- | --- | --- | --- |
| Root view, controls, complete fallback, production authoring boundary | Pass | Pass | Pass | Pass |
| Title/case/multiword/decision/edge/no-result search, clear, slash, Escape | Pass | Pass | Pass | Pass |
| Distant single/multiple fits, including below mobile zoom floor; decoded covers | Pass | Pass | Pass | Pass |
| Fit View, zoom, mouse pan, resize/rotation, repeated distant revisits | Pass | Pass | Pass | Pass |
| Minimap: all nodes retained; desktop drag; mobile hidden | Pass | Pass | Pass | Pass |
| Rendered endpoints/labels/colors/sizes, moving pulses after remount, hover/focus/links | Pass | Pass | Pass | Pass |
| Quiz choices, highlighted trail, completion, back/restart/exit/re-entry | Pass | Pass | Pass | Pass |
| Valid, partially unknown, all-unknown and nonadjacent known deep links | Pass | Pass | Pass | Pass |
| Held/failed cover response, stable geometry, revisit/reload | Pass | Pass | Pass | Pass |
| Observer cleanup after repeated remount cycles | Pass | Pass | Pass | Pass |
| Touch tap | N/A | Pass | N/A | Pass |
| Protocol touch pan/pinch | N/A | Pass | N/A | Unavailable |
| Dev drag/discard/save/reset while searching | UI pass; inherited runtime error | N/A | UI pass; inherited runtime error | N/A |

Quiz navigation follows a path derived from the full model: `d_start → d_will_you_die → d_maybe_some_cultivation_instead → d_haaaave_you_read_cradle → b_cradle`. Re-entry starts from a different decision. The target starts offscreen. Tests check the book and review URL as well as camera placement and selected edge trail.

The observer check instruments ResizeObserver and IntersectionObserver subscriptions, requires no detached targets, and bounds live targets by the currently mounted nodes plus page overhead after repeated distant fits. It checks cleanup across these cycles, not an indefinite memory soak.

Dev Save and Reset requests are intercepted and their complete payloads checked. Save contains all 269 positions, including the dragged root, with other coordinates unchanged. Reset sends `{reset: true}` and reloads. This verifies the UI lifecycle without writing the user's cache; it does not test server-side layout regeneration or persistence.

### Inherited authoring runtime defect

The final audit found that the original dev test branch skipped its runtime-error assertion. That harness bug is fixed: `--dev` now exits unsuccessfully on browser errors and captures full stacks. The earlier `final-dev` and `baseline-dev-03` status fields must not be read as clean runtime results.

The corrected test fails in **both the unchanged original source and the final candidate** with the same drag-stop exception. `baseline-dev-runtime-audit/results.json` and `dev-runtime-audit/results.json` each record two Chromium errors and one WebKit error, all from `onnodedragstop` accessing `node.id`. Both versions pass every UI assertion, including the complete Save payload. The baseline replay temporarily restored only the four task-owned source files, then restored the candidate byte for byte.

The unchanged handler destructures `{ node }`, while the installed SvelteFlow `NodeWrapper` calls it with `{ event, targetNode, nodes }`. Its dragged-position overlay callback therefore throws. Bound node positions still satisfy the tested drag/discard/save behavior, but this is a real inherited authoring defect, not a clean dev runtime pass. It is outside this performance patch. The corrected harness keeps failing visibly until it is fixed; no blanket error suppression was added. Production has zero runtime errors in all four final contexts.

### Baseline characterization and visual review

Before production edits, the core production suite passed in `baseline-regression-03` (Chromium) and `baseline-regression-04` (WebKit). `baseline-dev-03` passed authoring UI assertions but recorded the inherited drag-stop error described below. Candidate suites are `native-lazy-regression-02`, `virtualized-regression`, and `search-dim-regression`. `virtualized-observers` checked the enhanced opacity/observer assertions before direct dimming. Final tests additionally require pulses to move after remount and validate the complete dev Save payload.

Earlier failures were harness corrections on unchanged code: normalize SVG colors through CSSOM; drag the minimap rather than expect clicking; compare numeric transforms rather than wrapper style strings; normalize JSON's omitted undefined keys. For the single intentionally held-image screenshot, the harness temporarily bypasses Playwright's font-ready wait because WebKit can tie it to the blocked load event. Profiling settings are untouched.

Screenshots were inspected during camera movement and after settling, not just at initial load. Representative evidence: `final-regression/chromium-desktop-fit-in-flight-0.png`, `final-regression/chromium-desktop-single-fit.png`, `search-dim-regression/webkit-mobile-quiz-result.png`, and the `search-dim-interactions` loaded/after images. The WebKit mobile held/loaded pairs in `virtualized-regression` and `final-regression` were inspected and show the same reserved geometry before and after cover delivery (`webkit-mobile-cover-in-flight.png` / `webkit-mobile-cover-loaded.png`). Inspected cards, edge placement, dimming, labels, controls and quiz UI remain intact.

### Limits and inherited behavior

- Standard Fit View respects minimum zoom 0.05 desktop / 0.12 mobile and can leave graph extremes outside the canvas. The custom multi-result fit bypasses that floor and is tested separately. No camera semantics changed.
- Deep links filter unknown IDs but retain known nonadjacent IDs. Mobile landscape keeps the existing 600 px minimum page height. These are inherited behaviors.
- Chromium mobile touch taps, pan and pinch are emulated. WebKit taps are covered; Playwright's public WebKit API does not provide the same multi-touch protocol. No physical iOS or Android device was available.
- Cover response holding proves geometry and eventual decode; failed covers preserve navigation but do not gain a new error placeholder. Finite scripted paths do not prove every possible pan speed or network condition.
- `node scripts/verify-flowchart-colors.mjs` passes but its single-line parser sees only 3 of 269 source edges. It is not graph-wide uniqueness proof. Browser assertions compare rendered endpoints, labels and colors against the full serialized model. No edge recoloring or position change was made.
- Local production measurements do not establish deployed CDN behavior or field Core Web Vitals. Small sample ranges are descriptive, not confidence intervals.

## Final checks and self-review

Final `npx astro check`, `npm run build`, `node --check scripts/verify-flowchart-performance.mjs`, and `git diff --check` passed. Astro reports 0 errors, 0 warnings and six inherited hints; the build generated 455 pages. The measured JS/CSS assets and flowchart HTML (22 files total) are byte-identical after the final rebuild, as recorded in `runtime-assets-verification.json`. The color checker was run without `--fix` before and after every production experiment.

Self-review covered offscreen lookup, size fallbacks, handles, observer disposal, pulse state, dimming after remount, and delayed images. SvelteFlow keeps the complete model and minimap; mounted endpoint handles preserve routing. NodeWrapper unobserves detached elements. The dim predicate reads current reactive matching state when nodes mount, and opacity leaves the existing hidden handles unchanged. Parent-owned pulses and quiz state survive remount. Dev mode avoids viewport unmounting. No custom timer, subscription, loading observer, layout pass, library update, image rendition, font change, or graph-data change was added.

## Stopping decision and handoff

All three measured changes are retained together. No production experiment was reverted. Native lazy loading alone was rejected as the stopping point because rendering and search costs remained; the next two measured changes addressed those costs.

A custom intersection observer was not implemented: native loading plus viewport rendering already removes offscreen initial book requests, and another transform-aware lifecycle would add complexity without demonstrated remaining benefit. An explicit asynchronous-decode experiment was not justified by the final interaction traces: the native-only zoom outlier did not recur, visible covers decode on repeated navigation, and search/clear long tasks are absent. A layout/physics rewrite would exceed this brief and risk preserved geometry. Those are unmeasured alternatives, not claimed failed experiments.

The remaining mobile startup cost includes unchanged rendering-blocking resources and script work. Font work belongs to Brief 2 and image rendition work to Brief 3. A broader graph implementation change is not supported by the measured remaining cost and would increase correctness risk. This is the stopping point after three bounded, independently measured iterations.

**Brief 2 must start from this complete working tree and this result report**, including the inherited profiling tools, plans and original report. Do not start from HEAD alone or copy only the four production files. `final-state.json`, `final-task.patch`, and the per-cohort manifests identify the handoff. This task does not start another brief or chat.

## Reproduction and artifact index

```bash
npx astro check
npm run build
npm run preview -- --host 127.0.0.1 --port 4331
# Run the following in a separate terminal, with fresh output directories.
node scripts/verify-flowchart-performance.mjs \
  --base-url http://127.0.0.1:4331 \
  --baseline artifacts/performance/20260928T063039Z-01-flowchart/baseline-regression-04/graph-inventory.json \
  --output artifacts/performance/flowchart-recheck
npm run perf:load -- --base-url http://127.0.0.1:4331 \
  --paths /reviews/flowchart/ --runs 5 --output artifacts/performance/flowchart-recheck-load
npm run perf:interactions -- --base-url http://127.0.0.1:4331 \
  --paths /reviews/flowchart/ --runs 3 --output artifacts/performance/flowchart-recheck-interactions
node scripts/verify-flowchart-colors.mjs
```

For authoring, start a dev server on 4332 and run the regression script with `--dev --profiles desktop --base-url http://127.0.0.1:4332` and a fresh output directory. Save/Reset remain intercepted.

The dev command currently exits 1 for the inherited drag-stop defect even when its UI checks pass. Production verification exits 0. The task-owned 4331 preview and 4332 dev servers were stopped; the pre-existing servers were not stopped by this task. At final inspection, 4329 was still listening and 4321 was no longer listening.

- `before-load/`, `native-lazy-load/`, `virtualized-load/`, `search-dim-load/`: five runs per profile, Lighthouse HTML/JSON, DevTools logs, traces, manifest and summary.
- Corresponding `*-interactions/`: three runs per profile, applied observations, Event Timing, Long Tasks, screenshots, traces and manifests.
- `comparisons.json`, `comparisons.txt`, `summarize.py`: aggregated raw precision and regeneration helper. [The compact result JSON](2026-09-28-perf-01-flowchart-results.json) is the portable comparison.
- Regression directories: screenshots, full model/fallback inventory, browser version, checks, errors, and observer counts. See `final-regression/results.json`, `final-dev/results.json`, and the corrected `dev-runtime-audit/results.json` for production, authoring UI, and dev runtime evidence respectively.
- `native-lazy.patch`, `virtualized.patch`, `search-dim.patch`, `final-production.patch`: exact cumulative production iterations. `pre-search-dim/` preserves the prior accepted candidate for a scoped revert if needed.
- `final-astro-check.log`, `final-build.log`, `final-colors.log`, `final-state.json`, `runtime-assets-verification.json`, `server-cleanup.json`: final validation, preservation and cleanup evidence.
