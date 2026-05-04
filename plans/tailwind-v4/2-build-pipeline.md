# Phase 2 — Build pipeline

**Goal:** Swap the build wiring from "v3 PostCSS plugin via `@astrojs/tailwind`" to "v4 Vite plugin via `@tailwindcss/vite`", remove `autoprefixer` and `postcss.config.cjs`, and confirm the Astro dev server still boots (even though styles will be broken until Phase 3 finishes the theme port).

**Estimate:** ~30 minutes.

## Source files being changed

- `package.json`
- `astro.config.mjs`
- `postcss.config.cjs` → deleted
- `package-lock.json` (regenerated)

## Tasks

### 1. Update dependencies

```bash
npm uninstall tailwindcss @astrojs/tailwind autoprefixer postcss
npm install -D tailwindcss@latest @tailwindcss/vite@latest
```

`@tailwindcss/forms` stays — same package, loaded via `@plugin` in CSS in Phase 3.

After running, `package.json` `devDependencies` should look like (relevant deltas only):

```diff
-    "@astrojs/tailwind": "^6.0.2",
     "@tailwindcss/forms": "^0.5.4",
+    "@tailwindcss/vite": "^4.x.x",
-    "autoprefixer": "^9.8.8",
-    "postcss": "^8.4.21",
-    "tailwindcss": "^3.2.4"
+    "tailwindcss": "^4.x.x"
```

`sass` stays for now — Phase 4 is what removes it.

### 2. Wire the Vite plugin in `astro.config.mjs`

Replace the `@astrojs/tailwind` integration with the Vite plugin in `vite.plugins`:

```diff
 import { defineConfig } from 'astro/config';
 import svelte from '@astrojs/svelte';
 import mdx from '@astrojs/mdx';
-import tailwind from '@astrojs/tailwind';
+import tailwindcss from '@tailwindcss/vite';
 import sitemap from '@astrojs/sitemap';
 import remarkMath from 'remark-math';
 import rehypeKatex from 'rehype-katex';
 import { remarkImageClass } from './src/lib/remark-image-class.ts';
 import base16Snazzy from './src/lib/shiki-themes/base16-snazzy.json' with { type: 'json' };
 import { collectRedirects } from './scripts/collect-redirects.mjs';
 import { contentAssets } from './scripts/content-assets.mjs';
 
 const redirects = await collectRedirects();
 
 export default defineConfig({
   site: 'https://cosmiccoding.com.au',
   output: 'static',
   trailingSlash: 'ignore',
   redirects,
   publicDir: 'astro-public',
   integrations: [
     svelte(),
     mdx(),
-    tailwind({ applyBaseStyles: false }),
     sitemap({
       filter: (page) => !page.includes('/kitchensink/'),
     }),
     contentAssets(),
   ],
+  vite: {
+    plugins: [tailwindcss()],
+  },
   markdown: {
     remarkPlugins: [remarkMath, remarkImageClass],
     rehypePlugins: [rehypeKatex],
     shikiConfig: { theme: base16Snazzy },
   },
 });
```

Notes on the equivalence:

- `applyBaseStyles: false` was the v3-era escape hatch that stopped `@astrojs/tailwind` from injecting its own stylesheet into every page. v4's Vite plugin is opt-in — Tailwind doesn't load until *we* `@import "tailwindcss"` from a stylesheet, which we already do (and in Phase 3 will keep doing). So the flag has no v4 equivalent and we just drop it.
- The `vite.plugins` array merges with anything Astro itself sets. There are currently no other Vite plugins in this config, so no conflict.

### 3. Delete `postcss.config.cjs`

Tailwind v4 handles `@import` bundling and vendor prefixing internally; the autoprefixer-only PostCSS config is obsolete.

```bash
git rm postcss.config.cjs
```

The header comment on the file already noted that PostCSS-import is unused and that autoprefixer is the only reason it existed. Removing it doesn't lose anything.

### 4. Leave `tailwind.config.cjs` in place *for now*

Phase 3 ports its contents to a CSS `@theme` block and then deletes the JS file. Don't delete it yet — we still need it as a reference, and there's no harm in leaving an orphan `tailwind.config.cjs` for one phase (v4 doesn't auto-detect it; we'd need an explicit `@config` to load it, which we won't add).

### 5. Smoke-build

```bash
npm run build
```

**Expected outcome of this phase:** the build either fails with an error like *"Cannot find tailwindcss directives in `src/styles/main.scss`"* (because the v3 `@tailwind base; @tailwind components; @tailwind utilities;` syntax is no longer recognised), or it succeeds with a near-empty CSS bundle (because no `@import "tailwindcss"` exists anywhere yet).

Either is fine. Phase 3 fixes both. **Do not** chase the build green at the end of this phase — that's a Phase 3 acceptance criterion.

If the build fails for any reason *other* than missing Tailwind directives or empty utility output (e.g. `@astrojs/tailwind` is still being imported because the diff didn't apply cleanly, or `vite` config is malformed), stop and triage before moving on.

### 6. Commit

```bash
git add package.json package-lock.json astro.config.mjs
git rm postcss.config.cjs
git commit -m "tailwind v4: swap @astrojs/tailwind for @tailwindcss/vite plugin"
```

## Acceptance criteria

- `package.json` lists `tailwindcss@^4.*` and `@tailwindcss/vite@^4.*`. Does not list `@astrojs/tailwind`, `autoprefixer`, or `postcss`.
- `astro.config.mjs` no longer imports or references `@astrojs/tailwind`. It imports `@tailwindcss/vite` and adds it to `vite.plugins`.
- `postcss.config.cjs` is deleted.
- `tailwind.config.cjs` is still present (intentional — Phase 3 deletes it).
- Astro dev (`npm run dev`) at minimum *boots* without throwing on config — even if the resulting page is unstyled.

## Risks

- **Astro version constraint**: `@tailwindcss/vite` requires Astro 5.2+. Current `package.json` pins `astro: ^5.18.1`, well above that, so we're fine.
- **`autoprefixer` was used by anything else**: Verified — it was only in `postcss.config.cjs`, which is going away. Tailwind v4 prefixes for us.
- **`postcss` removal breaks Astro's CSS pipeline**: Astro doesn't depend on a top-level `postcss` package; it ships its own internally. Removing the standalone dep is safe.

## Out of scope

- Migrating `tailwind.config.cjs` (Phase 3).
- Editing any `*.scss` files (Phase 4).
- Running the codemod again (Phase 5).
