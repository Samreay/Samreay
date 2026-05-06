# Phase 10 — Markdown details

**Goal:** Make markdown rendering match Hugo's output (code highlighting, tables, footnotes, image classes, KaTeX) and ensure the `convert.py` notebook pipeline produces output Astro can consume.

**Estimate:** ½ day.

## Skills to load before starting

- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — MDX configuration, custom `{class=...}` shortcode handling, code highlight theme

## What needs handling

- Code blocks (`base16-snazzy` Chroma theme today → Shiki)
- Math (`math: true` posts → KaTeX)
- Image-class hack: `convert.py` produces `![](foo.png?class="img-large")` syntax
- `<div class="..." markdown=1>` wrappers around code blocks (Hugo `goldmark.renderer.unsafe = true` honours these)
- `style_tables` post-processing (`<table class="table-auto table dataframe">` injection)
- Generated "code at the end" appendix from `convert.py`
- Soft-break behaviour, GFM extensions

## Tasks

### 1. Code highlighting

- Already configured in Phase 1's `astro.config.mjs`:
  ```js
  shikiConfig: { theme: 'base16-snazzy' }
  ```
- Verify Shiki bundles `base16-snazzy` (it does as of 2026). If a colour swatch differs, consider `themes: { light, dark }` to match per-page expectation.
- Note: Astro caches highlighted output between builds, so first build may take a minute on tutorial-heavy content.

### 2. Math rendering

- `remark-math` and `rehype-katex` are wired in Phase 1.
- KaTeX CSS imported globally in Phase 2's `BaseLayout`.
- Test pages: any tutorial with `math: true` (e.g. `/tutorials/bayesianlinearregression/`) should render `$f(x) = mx + c$` and block-math `\\[ ... \\]` correctly with no flash.
- `MathJax`-specific `MathJax.Hub.Config` blocks at the bottom of `single.html` are removed in Phase 5.

### 3. Image-class hack via remark plugin

The `convert.py` script emits `![](image.png?class="img-large")` to attach CSS classes to converted notebook images. Write a small remark plugin to handle this:

`src/lib/remark-image-class.ts`:

```ts
import type { Plugin } from 'unified';
import type { Root, Image } from 'mdast';
import { visit } from 'unist-util-visit';

export const remarkImageClass: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'image', (node: Image) => {
    const url = node.url;
    const match = url.match(/^([^?]+)\?class="([^"]+)"$/);
    if (match) {
      node.url = match[1];
      const classes = match[2].split(/[ ,]+/).join(' ');
      node.data ??= {};
      (node.data as any).hProperties = { class: classes };
    }
  });
};
```

Register in `astro.config.mjs`:

```js
import { remarkImageClass } from './src/lib/remark-image-class.ts';
// ...
remarkPlugins: [remarkMath, remarkImageClass],
```

### 4. `<div ... markdown=1>` wrappers

The `convert.py` `wrap_code` step generates HTML like:

```html
<div class="reduced-code width-50" markdown=1>

```python
...code...
```

</div>
```

Hugo's `goldmark` (with `unsafe: true`) honours `markdown=1` and processes children as markdown. Astro's remark pipeline by default processes markdown only at the top level — children of `<div>` tags become raw HTML.

Solution: rename converted notebook outputs from `index.md` to `index.mdx`. MDX automatically processes JSX-like tags but **also continues processing markdown children inside HTML/JSX elements**, which is what we need.

Required adjustments to `builder/convert.py`:

```python
# In convert_notebook(), change:
output = expected_output.with_stem("index")
# to:
output = expected_output.with_stem("index").with_suffix(".mdx")
```

And update `wrap_code()` to drop the `markdown=1` attribute (MDX doesn't need it):

```python
content[start_line] = f'<div class="{cls} width-{max_width}">'
```

Test on `content/tutorials/bayesianlinearregression/` — re-run `uv run python builder/convert.py content/tutorials/bayesianlinearregression/2019-07-27-BayesianLinearRegression.ipynb` and verify the resulting `index.mdx` builds correctly under Astro.

Update `builder/hashes.json` lookup key handling (paths now end in `.mdx`).

### 5. Table styling

`convert.py`'s `style_tables` injects `class="table-auto table dataframe"` on `<table>` tags. Astro and MDX preserve this verbatim — no changes needed.

### 6. "Code at the end" appendix

`put_all_code_at_the_end()` appends a markdown block with all Python code combined. Renders fine under Astro/Shiki. No changes needed.

### 7. Frontmatter `aliases` keyed differently

`aliases:` doesn't affect markdown rendering — handled in Phase 12.

### 8. Spot-check pages

Build and review:

- `/tutorials/bayesianlinearregression/` — code blocks with custom widths, image classes (`img-main`), pandas tables.
- `/tutorials/gaussian_processes/` — math heavy.
- `/tutorials/genetic_part_one/` — has many code blocks and figures.
- `/blogs/2023_07_writing_update/` — plain markdown with embedded images, no `convert.py` involvement.

## Acceptance criteria

- All 39 tutorial pages build successfully after notebooks are reconverted to `.mdx`.
- Code blocks visually match Hugo (theme, line padding, copy affordance if present).
- KaTeX-rendered math is bit-identical across simple equations vs MathJax (acceptable cosmetic differences on edge cases like `\begin{aligned}`).
- Notebook-derived images preserve their `img-large` / `img-main` classes.
- Tables render with the dataframe styling.
- Code-at-the-end appendix renders.

## Risks

- **MDX parsing strictness**: MDX 3 is strict about unbalanced JSX-like tags in markdown. If a notebook produces unintended `<` characters in markdown text, the build will fail loudly. Mitigation: a one-time pass through all notebook outputs to escape stray `<`s; if widespread, fall back to processing the markdown children manually with a rehype plugin instead of switching to `.mdx`.
- **Shiki theme drift**: `base16-snazzy` should be present in Shiki's `bundledThemes`. If not, ship the theme JSON manually via `loadTheme`.

## Out of scope

- Adding interactive code execution (keep Jupyter rendering static).
- Replacing the Python notebook pipeline with a Vite plugin (deferred).
- Switching to a different code highlighter (e.g. `expressive-code`) — possible future enhancement.
