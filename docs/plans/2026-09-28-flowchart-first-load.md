# Flowchart first-load follow-up

Status: complete. The follow-up after commit `02c4b3331428e55f5fe6d34194a16a3e46631e72` reduced mobile simulated LCP from 4.06 to 2.61 seconds and applied graph readiness from 3.06 to 2.02 seconds. The strict two-second simulated LCP target remains unmet. Changes remain local and uncommitted; see the [result report](../performance/2026-09-28-flowchart-first-load-results.md).

## Evidence and scope

The preceding [flowchart report](../performance/2026-09-28-perf-01-flowchart-results.md) measured mobile simulated LCP at 4,041 ms and applied graph readiness at 3,072 ms. These are different metrics. The LCP element is the root decision text. The saved network trace shows a blocking Google Fonts CSS import ahead of island discovery and a second chain for the island's JavaScript dependencies.

Profile `/reviews/flowchart/` on the same host, browser, production server, throttling and cold-cache presets. Preserve the complete graph, cached positions, cover renditions, navigation, quiz, and accessible fallback. Preserve all inherited work and the completed report. Shared font changes are permitted only to address the observed flowchart critical path and require checks of shared consumers. This is not blanket execution of the other performance briefs.

## Experiments and acceptance

1. Snapshot source and inherited files, rebuild, and confirm the current baseline with five Lighthouse runs and three applied interaction runs per device.
2. Remove the measured blocking font discovery chain with a bounded experiment. Preserve font families, weights, glyph coverage, licenses, export and standalone OG consumers. Keep only a measured gain with intact typography and behavior.
3. Inspect the remaining first-load trace. Test another bounded loading or CPU change only when its cause is visible in the trace. Do not defer primary graph content or remove analytics to improve a score.
4. Repeat the same load and interaction cohorts for accepted candidates. Run one profiler at a time, without concurrent builds or browser tests. Keep raw evidence and medians/ranges, including outliers and failures.
5. Run the full Chromium/WebKit desktop/mobile flowchart regression suite against the saved graph inventory. Run Astro checks and production build. If shared styles/fonts change, verify their consumers, failed/slow fonts, and screenshot export.

Stop when the target is reached or remaining changes are disproportionate or require broader scope. Report simulated LCP, applied LCP, graph readiness, FCP, TBT, CLS, transfer, interaction diagnostics, and limitations separately. The inherited dev drag-stop exception remains visible; do not suppress it or claim clean authoring runtime coverage.

## Evidence and delivery

Artifacts: `artifacts/performance/20260928T074452Z-flowchart-first-load/`. The initial inventory and dirty-file archive capture the entire shared checkout before edits. Write a separate result report and compact JSON under `docs/performance/`, record the exact retained patch and preservation audit, and stop only task-owned servers. Do not commit, push, deploy, or create a PR.

## Outcome

Retained exact local font assets and eleven low-priority module hints on the flowchart route. Reverted the raw-node experiment because its gains overlapped the font-only spread. Rejected font preload because WebKit downloaded the font twice. Default-priority module hints were superseded by low-priority hints after a complete comparison.

Five load and three interaction runs per device cover each complete cohort. The final four-browser/profile regression matrix passes; typography probes match all 672 sampled metrics. The strict dev audit still exits 1 for the inherited drag-stop exception, with authoring payload assertions passing. Source checks/build pass, the final runtime matches the measured asset digests, and the preservation audit passes. The report records performance tradeoffs, font fallback and device limitations, and the boundary for deeper initialization work.
