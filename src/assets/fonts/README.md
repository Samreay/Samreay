# Bundled website fonts

These unmodified WOFF2 files replace the Google Fonts CSS request previously imported by `src/styles/main.css`. Vite fingerprints the files referenced by `src/styles/fonts.css`. Shared pages, standalone OG pages, and screenshot export consume that same stylesheet.

Downloaded on 2026-09-28 from the existing [Google Fonts CSS request](https://fonts.googleapis.com/css2?family=Architects+Daughter&family=Inter:wght@400;500;600;700;800;900&display=fallback), using a Chromium 147 user agent. The versioned binaries remain byte-for-byte upstream assets:

- Inter v20, normal, variable weight 400–900: Latin, Latin extended, Greek, Greek extended, Cyrillic, Cyrillic extended, and Vietnamese. The original six weight declarations all referenced the same variable file for each subset. Local declarations combine those weight ranges.
- Architects Daughter v20, normal, weight 400: Latin and Latin extended.

The original Unicode ranges are retained. `font-display: swap` keeps fallback text visible while a response is delayed, including in WebKit. Fonts load when text needs them; the tested font preload caused duplicate WebKit transfers and was rejected.

For Latin text, `font-fallback.css` provides a local Arial fallback calibrated separately for each Inter weight. Its size adjustment comes from measured glyph widths; ascent, descent, and line gap come from the bundled Inter binary. It adds no downloaded asset. Other scripts and systems without Arial keep the existing fallback stack. The [font performance report](../../../docs/performance/2026-09-28-perf-02-fonts-results.md) records the calculation, browser checks, and remaining limits.

Both families use the SIL Open Font License 1.1. Copyright and license text accompany the files in [Inter-OFL.txt](Inter-OFL.txt) and [Architects-Daughter-OFL.txt](Architects-Daughter-OFL.txt), copied from the respective [Inter](https://github.com/google/fonts/tree/main/ofl/inter) and [Architects Daughter](https://github.com/google/fonts/tree/main/ofl/architectsdaughter) upstream directories. The [performance result JSON](../../../docs/performance/2026-09-28-flowchart-first-load-results.json) records the exact source URLs and checksums in `fontSources`.
