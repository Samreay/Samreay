# Images: replacing `resize.py`

`resize.py` exists in this repo to pre-generate image renditions. Astro's `astro:assets` makes this entire pipeline obsolete. Delete `resize.py` and the manual rendition folders once the migration is complete.

## Where to put images

| Folder | Behavior |
|---|---|
| `src/assets/...` | Imported into components/Markdown; Astro optimizes (resizes, converts, generates `srcset`, hashes filename). |
| `src/content/<collection>/<entry>/cover.jpg` | Colocated with the entry; reference via `image()` in the schema. |
| `public/...` | Served as-is. No optimization. Use only for things that need a stable URL (favicon, OG fallback, robots.txt). |

Rule of thumb: if it's optimizable and used inside the build, put it in `src/`.

## `<Image />` component

```astro
---
import { Image } from 'astro:assets';
import cover from '../assets/reviews/the-way-of-kings.jpg';
---
<Image src={cover} alt="The Way of Kings cover" widths={[320, 640, 960]} sizes="(min-width: 768px) 320px, 100vw" />
```

Behavior on a prerendered page:

- Generates an optimized `<img>` with `loading="lazy"`, `decoding="async"`, correct `width`/`height` (CLS-safe).
- With `widths` and `sizes`, generates a full responsive `srcset`.
- Default output format is `webp`; pass `format="avif"` or `format="png"` to override.
- Filename gets a content hash so it's safe to cache forever.

`alt` is **required** on `<Image />`. Pass `alt=""` for purely decorative images.

## `<Picture />` component

Use `<Picture />` when you want multiple `<source>` formats with a fallback:

```astro
---
import { Picture } from 'astro:assets';
import hero from '../assets/hero.png';
---
<Picture src={hero} formats={['avif', 'webp']} alt="Hero illustration" />
```

The browser picks the best format it supports; older browsers fall back to the original.

## Responsive images

Two ways to enable the modern responsive layout (auto-generated `srcset` + `sizes`):

1. **Globally** in `astro.config.mjs`:

   ```js
   image: {
     layout: 'constrained',  // or 'full-width', 'fixed'
     responsiveStyles: true, // injects a tiny global stylesheet so images resize correctly
   }
   ```

   This applies to `<Image />`, `<Picture />`, and Markdown `![]()` syntax.

2. **Per-component**: pass `layout="constrained"` (or `full-width`/`fixed`) to the component directly.

If you also use Tailwind 4's responsive utilities, set `responsiveStyles: false` and style images yourself, or the two systems will fight.

## Markdown images

Standard Markdown `![alt](src)` syntax in collection entries is automatically processed when the path is relative or remote:

```md
<!-- src/content/reviews/some-book/index.md -->
![Some book cover](./cover.jpg)
![External cover](https://example.com/cover.jpg)
![Public asset (NOT optimized)](/static/og-default.png)
```

For richer image controls in Markdown, switch the file to `.mdx` and use `<Image />` directly.

## Images on collection entries (schema)

```ts
// src/content.config.ts
const reviews = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/reviews' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      cover: image(),
    }),
});
```

The `image()` helper validates that `cover` resolves to a real file and gives you an optimized image object on `entry.data.cover`:

```astro
---
import { Image } from 'astro:assets';
import { getEntry } from 'astro:content';
const review = await getEntry('reviews', 'name-of-the-wind');
---
<Image src={review.data.cover} alt={`Cover of ${review.data.title}`} />
```

## Remote images

Remote images are served as-is unless you allow the host:

```js
// astro.config.mjs
image: {
  domains: ['example.com'],
  remotePatterns: [{ protocol: 'https', hostname: '**.imgix.net' }],
}
```

Remote URLs need an explicit `width` and `height` on the `<Image />` to avoid CLS.

## Migrating `resize.py` outputs

1. Move source images into `src/assets/` or `src/content/<collection>/<entry>/`.
2. Delete the manually-resized renditions in `themes/sams-theme/static/`. Astro will regenerate them at build time and place them under `dist/_astro/`.
3. Remove `resize.py` from the `Makefile` (`make blog` no longer needs it).
4. Update any hardcoded paths (`/static/img/.../800.webp`) to imports (`import cover from '../assets/.../cover.jpg'`).
