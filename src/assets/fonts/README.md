# Bundled website fonts

These unmodified WOFF2 files replace the Google Fonts CSS request previously imported by `src/styles/main.css`. Vite fingerprints the files referenced by `src/styles/fonts.css`. Shared pages, standalone OG pages, and screenshot export consume that same stylesheet.

Downloaded on 2026-09-28 from the existing [Google Fonts CSS request](https://fonts.googleapis.com/css2?family=Architects+Daughter&family=Inter:wght@400;500;600;700;800;900&display=fallback), using a Chromium 147 user agent. The versioned binaries remain byte-for-byte upstream assets:

- Inter v20, normal, variable weight 400–900: Latin, Latin extended, Greek, Greek extended, Cyrillic, Cyrillic extended, and Vietnamese. The original six weight declarations all referenced the same variable file for each subset. Local declarations combine those weight ranges.
- Architects Daughter v20, normal, weight 400: Latin and Latin extended.

The original Unicode ranges and `font-display: fallback` behavior are retained. Fonts for scripts outside these faces continue through the existing CSS fallback stack. Fonts load when text needs them; the tested font preload caused duplicate WebKit transfers and was rejected.

Both families use the SIL Open Font License 1.1. Copyright and license text accompany the files in [Inter-OFL.txt](Inter-OFL.txt) and [Architects-Daughter-OFL.txt](Architects-Daughter-OFL.txt), copied from the respective [Inter](https://github.com/google/fonts/tree/main/ofl/inter) and [Architects Daughter](https://github.com/google/fonts/tree/main/ofl/architectsdaughter) upstream directories. The [performance result JSON](../../../docs/performance/2026-09-28-flowchart-first-load-results.json) records the exact source URLs and checksums in `fontSources`.
