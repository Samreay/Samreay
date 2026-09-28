# Reduce flowchart request overhead on cold 3G

## Goal

Reduce the wait for a usable flowchart on Chrome's 3G preset while preserving the graph and other Svelte islands.

## Context

The production preview already compresses HTML and JavaScript with gzip. The graph's static module tree is preloaded, but eleven modules include several tiny Svelte runtime chunks. Earlier applied measurements used 150 ms latency and 1.6 Mbit/s download. Chrome's current 3G preset uses 2,000 ms emulated request latency and 50,000 bytes/s throughput after its adjustment factors. These cohorts cannot be compared directly.

## Tasks

1. Record three cold desktop runs with the Chrome 3G settings and separate graph readiness from the load event. Save request timing and bytes under `artifacts/performance/20260928-flowchart-3g-bundling/`.
2. Experiment with one shared Svelte runtime chunk in the client build. Keep the graph library and optional export code out of that shared chunk. Let the existing preload integration discover the resulting imports.
3. Repeat the same measurements. Retain the change only if it reduces the graph wait without breaking other islands or materially increasing their transfer cost.
4. Verify graph data, search, quiz, pan, zoom, mobile navigation, and reviews hydration. Run Astro check and a production build.
5. Record results and the bundle tradeoff in `docs/performance/` and `docs/DECISIONS.md`. Leave changes uncommitted and keep the preview available.

## Verification

Use the existing flowchart regression runner in Chromium and WebKit, plus focused checks on the home and reviews routes. Compare rendered screenshots. Inspect the final module graph to ensure unrelated pages do not fetch the flowchart or screenshot exporter.

## ADR

Add a decision only if the shared runtime experiment is retained. Analytics timing, CSS organization, and graph data serialization are separate experiments unless the baseline shows they prevent a useful bundling comparison.

## Outcome

Completed. The retained runtime bundle reduced cold desktop 3G graph readiness by 34%, from 10.86 to 7.16 seconds. Build, type checking, and browser checks pass. See [measurements and verification](../performance/2026-09-28-flowchart-3g-bundling.md). The user subsequently authorized committing and pushing the completed work.
