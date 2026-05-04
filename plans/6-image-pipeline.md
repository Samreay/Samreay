# Phase 6 — Image pipeline

**Goal:** Replace Hugo's built-in image processing (`.Fill "500x800 Center webp q70 #000000"`) with `astro:assets` and a thin `<CoverImage>` wrapper that produces equivalent `<picture>` markup.

**Estimate:** ½ day. (Simplified from the original plan because we're using `fit: 'cover'` instead of letterboxing.)

## Skills to load before starting

- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — `<Image>` / `<Picture>` from `astro:assets`, image optimisation

## What Hugo does today

The site uses two patterns:

1. **Per-content-page images** (e.g. `content/reviews/<slug>/cover.jpg`):
   - Resolved via `.Resources.ByType "image"` + `.GetMatch "{*cover*,*thumbnail*}"`
   - Resized + cropped + WebP-encoded at build time
   - Sizes used: `500x800` (review covers), `352x198` (post cards), `704x396` (post cards 2x), `516x400` (course cards), `620x992` (book covers)
2. **Theme-provided images** (e.g. `themes/sams-theme/assets/img/covers/<id>.jpg`):
   - 526 cover files, ~271 MB total
   - Referenced by ID from `data/artists.yml`
   - Resolved via `resources.GetMatch (printf "img/covers/%s.*" $cover)`
   - Same `500x800 webp q70` treatment

## Tasks

1. Move shared image assets so Astro's bundler can see them:
   ```bash
   git mv themes/sams-theme/assets/img src/assets/img
   ```
   This breaks the Hugo build, so do it on the migration branch only and don't merge to `master` until cutover. (Alternative: copy instead of move, accepting the 271 MB duplication during migration.)
2. Create `src/components/CoverImage.astro`:
   ```astro
   ---
   import { Image } from 'astro:assets';
   import type { ImageMetadata } from 'astro';
   import type { CollectionEntry } from 'astro:content';

   interface Props {
     entry?: CollectionEntry<'reviews' | 'blogs' | 'tutorials'>;
     src?: ImageMetadata;
     width: number;
     height: number;
     class?: string;
     alt?: string;
   }
   const { entry, src: explicitSrc, width, height, class: className = '', alt } = Astro.props;

   // Resolve image source: explicit prop > entry's `images[0]` field > co-located cover.{jpg,png,webp}
   let src: ImageMetadata;
   if (explicitSrc) {
     src = explicitSrc;
   } else if (entry) {
     const images = import.meta.glob<{ default: ImageMetadata }>(
       '/content/**/{cover,thumbnail}.{jpg,jpeg,png,webp}',
       { eager: true }
     );
     const match = Object.entries(images).find(([path]) => path.includes(`/${entry.id}/`));
     if (match) {
       src = match[1].default;
     } else {
       const placeholders = import.meta.glob<{ default: ImageMetadata }>(
         '/src/assets/img/jeff/placeholder_*.{jpg,webp}',
         { eager: true }
       );
       const idx = (entry.data.date.getMonth() % Object.keys(placeholders).length) + 1;
       src = Object.values(placeholders)[idx]?.default ?? Object.values(placeholders)[0].default;
     }
   } else {
     throw new Error('CoverImage requires either entry or src');
   }
   ---
   <picture>
     <Image
       src={src}
       width={width}
       height={height}
       quality={70}
       format="webp"
       loading="lazy"
       decoding="async"
       class={className}
       alt={alt ?? entry?.data.name ?? ''}
     />
   </picture>
   ```
3. Use `<CoverImage>` in:
   - `src/pages/reviews/[...slug].astro` (already stubbed in Phase 5)
   - `src/components/ReviewCard.astro` (used by Phase 8 explorer)
   - `src/components/PostCard.astro` (used by blogs/tutorials list)
4. For `data/books.yml` book covers (referenced by string path like `img/jeff/scion_of_storms.png`), import them up-front in `src/data/books.ts`:
   ```ts
   import scionCover from '../assets/img/jeff/scion_of_storms.png';
   import sanctuaryCover from '../assets/img/jeff/sanctuary.png';
   // ...
   export const books = [
     { link: '...', cover: scionCover, css: '...', desc: '...' },
     // ...
   ] as const;
   ```
   This gives `<Image>` a typed `ImageMetadata` reference rather than a string path.
5. Course images (`data/courses.yml`) and "other" thumbnails (`data/other.yml`): same pattern.
6. Artist covers (`data/artists.yml` → 526 referenced cover IDs): use `import.meta.glob('/src/assets/img/covers/*.{jpg,png,webp}', { eager: true })` keyed by basename and map artist IDs to entries. Done inside Phase 9's `ArtistsExplorer` setup — for this phase, just confirm the glob resolves.
7. CI build performance:
   - Add `node_modules/.astro/` and `.astro/` to the Actions cache (Phase 13).
   - Astro automatically caches transformed images by content hash, so subsequent builds only reprocess changed images.

## Acceptance criteria

- A review page produces a `<picture>` with a WebP `<source>` and a 500×800 image, identical bytes-on-disk to Hugo's output (within ±2% due to sharp vs imaging library differences).
- `<CoverImage>` correctly falls back to the placeholder rotation when neither `entry`'s images nor a co-located cover exists.
- Build time for a clean run is ≤ 5 minutes locally for the full ~1300 image variants. Subsequent builds (one image changed) ≤ 15 seconds.
- No 404s on cover images in the rendered HTML.

## Risks

- **Loss of letterbox padding on non-2:5 covers**: confirmed accepted in the migration decisions. Spot-check 5 oddly-shaped covers post-migration to confirm the visual change is acceptable.
- **`import.meta.glob` resolving content from outside `src/`**: Astro 5 supports this via the project root, but if it doesn't, fall back to importing covers via the collection schema's `image()` helper (per-entry typed image references).
- **Image filename casing or special characters in `data/artists.yml`**: a couple of cover IDs may not match their on-disk filename casing. Build will fail loudly; fix inline.

## Out of scope

- Restoring black letterbox padding (deferred — covered by `cover_crop` decision).
- AVIF output (deferred).
- Replacing `resize.py` with build-time sharp (deferred).
