# HTML normalization rules

Before any structural diff (Hugo `public/` vs Astro `dist/`), both inputs are normalized so that legitimate build differences are stripped and only meaningful divergences remain. The rules live in `scripts/lib/structural_diff.py::normalize()`.

## Rules applied to every input

1. **Parse with `lxml` via BeautifulSoup.** Tag soup tolerated; both Hugo and Astro emit valid HTML5 but the parsing must be identical.
2. **Strip HTML comments** (`<!-- ... -->`). Astro emits a build-time comment header; Hugo doesn't. Never useful for the diff.
3. **Drop `<script>` and `<style>` elements with `data-astro-cid-*`** attributes. These are scoped style markers Astro injects.
4. **Replace content-hash filenames.** Anywhere an attribute value matches `r'/_astro/[^"]+?\.[a-f0-9]{8,}\.(css|js|woff2?)'`, replace the hash with `HASH`.
5. **Normalize `srcset` and `sizes`.** Sort comma-separated entries, strip query strings on URLs, and replace generated image filenames (`r'/_astro/[^ ]+\.(webp|avif|png|jpg|jpeg)'`) with `_astro/IMG.EXT`. Hugo's resize.py emits different dimensions than Astro's `<Image>`, so the URL itself is not a useful comparison axis.
6. **Drop tracking attributes.** `data-astro-cid-*`, `data-astro-source-file`, `data-astro-source-loc`, `data-svelte-h`, and any `nonce-*` attribute.
7. **Drop the analytics block.** Both Hugo's `partials/analytics.html` and Astro's `Analytics.astro` inject GA. The presence/absence is checked separately; the snippet's exact bytes differ between Hugo's Go template and Astro's runtime injection.
8. **Sort attribute order.** Within each tag, sort attributes alphabetically by name.
9. **Collapse whitespace.** Strip leading/trailing whitespace on text nodes; collapse runs of whitespace to a single space; drop text nodes that are pure whitespace between block-level tags.
10. **Lowercase tag names and attribute names.** They should already be lowercase; this is defensive.
11. **Pretty-print** with `indent=2` so the resulting two strings can be `difflib.unified_diff`'d cleanly.

## Rules applied selectively

These can be turned on per-check via `normalize(html, **opts)`:

- `drop_class_attributes=False` — set to True if the check is about structure not styling. Useful for templates whose class names are still being iterated on.
- `drop_inline_styles=True` — defaults on; Hugo doesn't emit inline `style="..."` but Astro's `<Image>` does.
- `drop_id_attributes=False` — set to True for `[id="post-container"]`-style anchors that Astro and Hugo may name differently.
- `keep_only=['main', 'article']` — restrict the diff to a subtree by tag name. Used by `representative_pages_structure` to focus on the article body and ignore the chrome.
- `mask_selectors=['.newsletter-form', '.footer']` — replace whole subtrees with a stub `<masked tag="$tag" />` element. Useful for components that are stubbed in early phases and replaced later.

## What the diff output looks like

`structural_diff.py` returns a `DiffResult`:

```python
@dataclass
class DiffResult:
    equal: bool
    summary: str            # "12 lines added, 8 lines removed (net +4)"
    unified: str            # full unified diff between normalized strings
    hugo_path: Path | None  # written to state/diffs/phase-N/hugo-<route>.html when --keep-normalized
    astro_path: Path | None # similarly astro-<route>.html
```

The unified diff is what gets surfaced to the agent on failure. Both normalized files are kept on disk when `--keep-normalized` is passed so a human can inspect them.

## When a diff fails and the cause is "Astro emits something extra"

Three options, in order of preference:

1. **Add a normalization rule** if the divergence is build-system noise (e.g. a new attribute Astro started emitting). Update this file and `structural_diff.py::normalize()` together.
2. **Mask the subtree** with `mask_selectors` if the component is intentionally different (e.g. the newsletter form has a different markup but the same behaviour).
3. **Downgrade severity** in `phase_N.py` from `must_match` to `should_match` and write a comment explaining why. Keep the check; don't delete it.

Never solve a failed structural diff by asking for the check to be removed entirely. The check's job is to make divergence visible — even an accepted divergence should be visible.
