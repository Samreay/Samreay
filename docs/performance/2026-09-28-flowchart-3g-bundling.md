# Flowchart bundling on cold 3G

Bundling the shared Svelte runtime reduced median graph readiness from **10.86 seconds to 7.16 seconds**, a **34% improvement**. The graph's preloaded module tree shrank from eleven files to three. The local production preview serves the retained build at `http://127.0.0.1:4321/reviews/flowchart/`.

This measures when graph nodes and the search control appear. Covers, textures, and analytics continue downloading afterwards. The load event improved by only 0.66 seconds, and heading LCP did not improve.

## Reproduction

- Source: `9258973b`, plus the inherited uncommitted image work. Only `astro.config.mjs` changes website behavior in this experiment.
- Target: local production build through Astro preview, HTTP/1.1 with gzip responses. This does not reproduce deployed HTTP/2 scheduling or CDN behavior.
- Browser: Playwright Chromium 147.0.7727.15, fresh browser and context per run, cache disabled, service workers blocked, analytics enabled.
- Host: Apple M4 Pro, macOS kernel 25.6.0, Node 22.22.2.
- Viewport: 1350 × 940, DPR 1, no CPU slowdown.
- Network: applied CDP throttling with 2,000 ms request latency and 50,000 bytes/s in each direction. These are the adjusted values in Chrome's current [3G preset](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/core/sdk/NetworkManager.ts).
- Three sequential runs per cohort. No builds or other automated browser tests ran during timing measurements.

The earlier applied mobile results used 150 ms request latency and 1.6 Mbit/s download. They are a different, faster profile. The earlier roughly two-second result does not describe cold Chrome 3G. CDP models requests rather than packets; these are lab measurements, not physical-device or field results.

Let `R` mean `artifacts/performance/20260928-flowchart-3g-bundling/`. `R/probe.mjs` records readiness on the first animation frame with a graph node and search input, navigation and paint timing, and every network request. Reproduce a cohort with:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4321
node artifacts/performance/20260928-flowchart-3g-bundling/probe.mjs fresh-label 3
```

## Before and after

Values are medians, with observed ranges in parentheses.

| Metric                          | Before                | Retained bundle       |
| ------------------------------- | --------------------- | --------------------- |
| Graph ready                     | 10.86 s (10.86–11.12) | 7.16 s (7.15–7.17)    |
| First contentful paint          | 5.12 s (5.12–5.38)    | 5.15 s (5.12–5.15)    |
| Largest contentful paint        | 5.12 s (5.12–5.39)    | 5.15 s (5.13–5.16)    |
| Load event                      | 18.33 s (18.33–18.59) | 17.67 s (17.64–17.67) |
| Total recorded transfer         | 673,721 B             | 667,396 B             |
| First-party JavaScript requests | 12                    | 4                     |
| First-party JavaScript transfer | 90,772 B              | 84,532 B              |
| Graph module preloads           | 11                    | 3                     |

LCP identifies the heading rather than the useful graph. Its small change lies within overlapping ranges. No Lighthouse score, TBT, or field INP improvement is claimed. The total transfer includes background work collected through one second after the load event, so it is not a critical-path byte budget.

The first-party script counts include the mobile menu. The external analytics script adds one request to each total. In every run, analytics records an aborted fetch followed by a successful beacon; no first-party request or page exception failed.

## Why bundling helped

The original HTML discovered all eleven graph modules early through preload links. Discovery alone did not remove the local HTTP/1.1 connection queue. In the first baseline run, the renderer's tiny module finished at 11.00 seconds, after the larger graph module had finished at 7.31 seconds. The graph appeared at 11.12 seconds.

The final build has a graph component, one shared Svelte runtime, and the Astro Svelte renderer. The first retained run finished the renderer at 6.33 seconds and the graph component at 7.05 seconds. The graph appeared at 7.17 seconds. Most of the gain comes from fewer queued requests, rather than a large reduction in bytes.

The client build's `manualChunks` rule assigns Svelte modules and their static dependencies to `svelte-runtime`. It leaves graph code in the graph component and snapdom behind its existing dynamic import. The current preload integration discovers the new import tree automatically. Server builds keep their existing chunking.

An intermediate experiment explicitly bundled only Svelte modules, leaving two tiny dependencies separate. It measured 7.23 seconds median with five graph preloads. Including those runtime dependencies produced the retained three-module tree. All three intermediate runs remain in `R/bundled.json`.

Other pages share this runtime. The home page's first-party JavaScript changes from nine files to three; gzip body size increases by 61 bytes, from 21,956 to 22,017. Raw code grows by 5,337 bytes because the bundle includes runtime functions used by other islands. Reviews changes from twelve files to four and drops from 33,553 to 31,381 gzip bytes. These are generated-file gzip sizes, excluding HTTP headers. Neither page fetches graph code, and reviews fetches snapdom only after export is requested.

## Remaining costs

- The analytics script transfers about 171 KB and competes with page resources. A separate experiment could defer it until primary content is usable, with explicit checks for page-view behavior.
- Two decorative card textures transfer about 179 KB combined. They start after the graph mounts and extend the resource-loading tail. Optimize their byte size or when they are needed; combining JavaScript does not remove them.
- Four stylesheets transfer about 33 KB including headers. They still gate first paint. Consolidating only the styles this route needs is a possible next experiment; combining every site's stylesheet would need a separate cost comparison.
- The graph document and graph component each transfer roughly 61–63 KB. Reducing serialized graph data or graph-library code would address throughput after request overhead is reduced.

The `artists.*.css` names come from shared build chunks and do not by themselves show that artist-page functionality loaded. The screenshot's `injected.js` is absent from the built site and this isolated browser capture.

## Verification

- `npx astro check`: 0 errors, 0 warnings, 6 inherited hints.
- Production build: 455 pages, three graph module preloads.
- Existing flowchart regression runner: all 34 scenario groups pass across Chromium and WebKit, desktop and mobile. Serialized nodes, edges, geometry, and accessible fallback match the previous image-work baseline exactly. Checks cover search, quiz, deep links, fit, zoom, pan, minimap, resize, navigation, and delayed or failed covers. Protocol-driven pinch is Chromium-only; WebKit exercises tap behavior.
- Focused shared-island checks: home and reviews mobile menus, reviews search and layout changes, and screenshot download pass in both browsers. Neither route loads the graph bundle. Snapdom loads only after an export request.
- Visual inspection: before and after graph screenshots preserve layout and styling. The WebKit screenshot export preserves the cover and readable text.
- `git diff --check` passes. During profiling, inherited tracked changes were preserved, the index remained empty, and HEAD was unchanged. Publication was outside the measurement phase.

The first shared-island smoke script incorrectly expected the title to be visible in the default cover layout. It failed its assertion, was corrected to inspect the review link, and passed on rerun. The failed script and log remain as `R/check-islands-first.mjs` and `R/island-checks-first.log`. No application change was needed.

## Evidence

- Compact measured summary: [JSON results](2026-09-28-flowchart-3g-bundling.json).
- `R/before.json`, `R/bundled.json`, `R/final.json`: all nine measured runs, including request timing and transfer bytes.
- `R/before-assets.json`, `R/final-assets.json`, `R/before-islands.json`: generated asset sizes and original shared-island requests.
- `R/before.png`, `R/final.png`: initial graph screenshots. Visual comparison preserves layout and styling; pulse animation positions vary.
- `R/final-build.log`, `R/check.log`: final production build and Astro check.
- `R/graph-regression/`, `R/island-checks.json`: browser checks and screenshots.
- `R/before.patch`, `R/before-status.txt`: inherited working-tree state, retained separately from this change.
