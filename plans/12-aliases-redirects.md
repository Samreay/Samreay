# Phase 12 — Aliases as redirects

**Goal:** Preserve every legacy URL by emitting redirect HTML files at build time, replacing Hugo's `aliases:` frontmatter behaviour.

**Estimate:** ½ day.

## Skills to load before starting

- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — `redirects` map in `astro.config.mjs`, alias collection from frontmatter

## How aliases work today

Hugo treats any path listed under `aliases:` in a page's frontmatter as a redirect target. At build time it emits a tiny HTML file at the alias path with a `<meta http-equiv="refresh">` to the canonical URL.

Examples seen across content:

```yaml
# content/reviews/bobiverse/index.md
aliases: [/reviews/bobiverse]   # canonical is /reviews/bobiverse/ (trailing slash)

# content/blogs/2023_07_writing_update/index.md
aliases: [/blog/2023_08_update]

# content/tutorials/bayesianlinearregression/index.md
aliases: [/tutorials/bayes_lin_reg]
```

## Approach

The chosen strategy from the migration decisions is the `redirects` map in `astro.config.mjs`. Astro emits redirect HTML files for these at build time, suitable for static hosts including GitHub Pages.

## Tasks

### 1. Build-time alias collector

`scripts/collect-redirects.mjs`:

```js
import { glob } from 'glob';
import matter from 'gray-matter';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function collectRedirects() {
  const redirects = {};
  const files = await glob('content/{reviews,blogs,tutorials}/*/index.{md,mdx}');
  for (const file of files) {
    const { data } = matter(await readFile(file, 'utf-8'));
    if (!data.aliases?.length) continue;
    const collection = file.split(path.sep)[1];
    const slug = path.basename(path.dirname(file));
    const target = `/${collection}/${slug}/`;
    for (const alias of data.aliases) {
      const normalized = alias.endsWith('/') ? alias : alias + '/';
      redirects[normalized] = target;
    }
  }
  return redirects;
}
```

### 2. Wire into `astro.config.mjs`

```js
import { defineConfig } from 'astro/config';
import { collectRedirects } from './scripts/collect-redirects.mjs';

export default defineConfig({
  // ... other config ...
  redirects: await collectRedirects(),
});
```

Astro supports top-level `await` in config files. The redirects map is a plain object of `{ '/old/path/': '/new/path/' }` pairs.

### 3. Verify Astro emits the redirect files

After `npm run build`, expect:

```
dist/reviews/bobiverse/index.html
dist/blog/2023_08_update/index.html       <- meta-refresh redirect
dist/tutorials/bayes_lin_reg/index.html   <- meta-refresh redirect
```

Each redirect file contains the standard Astro-generated:

```html
<!doctype html>
<title>Redirecting to /reviews/bobiverse/</title>
<meta http-equiv="refresh" content="0;url=/reviews/bobiverse/">
<meta name="robots" content="noindex">
<link rel="canonical" href="/reviews/bobiverse/">
```

### 4. Edge cases

- **Aliases that conflict with real pages**: should not happen, but if a content slug exactly matches another page's alias, Astro will warn at build. The real page wins.
- **Aliases without trailing slash**: normalise to trailing slash (Hugo accepts both). Our `astro.config.mjs` uses `trailingSlash: 'always'`.
- **Aliases starting with `/blog/` (singular) vs `/blogs/`**: both forms exist in the wild. Don't try to be clever — emit redirect files for whatever's listed.
- **Repeated aliases across two pages**: log a warning during `collectRedirects` and pick the first one. Should be a no-op in practice.

### 5. Sitemap exclusion

The `@astrojs/sitemap` integration shouldn't include redirect URLs. Verify by inspecting `dist/sitemap-0.xml` — only canonical URLs should appear. If redirects leak in:

```js
sitemap({ filter: (page) => !isRedirectStub(page) }),
```

(Astro's sitemap typically doesn't include redirects automatically.)

### 6. Robots considerations

The redirect HTML includes `<meta name="robots" content="noindex">`, which is what we want — search engines should index the canonical URL only.

## Acceptance criteria

- A grep of `content/**/*.{md,mdx}` for `aliases:` finds N entries; the build emits N redirect files in `dist/`.
- Visiting `/reviews/bobiverse` (no trailing slash) eventually lands at `/reviews/bobiverse/` with the right content.
- Visiting `/blog/2023_08_update/` redirects to `/blogs/2023_07_writing_update/`.
- `dist/sitemap-0.xml` does not contain redirect URLs.
- A spot check of 5 random aliases confirms the right destination.

## Risks

- **Top-level await in config**: requires Node 22+ and Astro 5+ (both already present in our setup). No mitigation needed.
- **Glob ordering nondeterminism**: keys in the resulting redirects map are stable enough for build reproducibility, but if hashing is needed for cache keys, sort the entries.

## Out of scope

- Adding new redirects unrelated to aliases (e.g. for old WordPress paths). If needed, add a static `redirects` object alongside the dynamic one and merge.
- Server-side 301 redirects (only matters if we ever leave GitHub Pages for a host with redirect support like Cloudflare Pages — `_redirects` file format).
