/**
 * Cover resolution shared between `<CoverImage />` (used in single-page
 * templates) and the Phase 8 reviews explorer. Returns a `getImage` result
 * (URL + width/height) so the Svelte island can put a stable string in its
 * pre-serialized post payload.
 *
 * Same precedence order as `<CoverImage>`:
 *   1. `entry.data.images[0]` if set.
 *   2. Co-located `cover.{ext}` inside the entry bundle.
 *   3. Bundled cover keyed by entry.id (`src/assets/img/covers/<id>.<ext>`).
 *      (Pre-cutover this lived under `themes/sams-theme/assets/img/covers/`.)
 *   4. Deterministic placeholder rotation from `src/assets/img/jeff/`.
 */
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import type { CollectionEntry } from 'astro:content';

const COLOCATED = import.meta.glob<{ default: ImageMetadata }>(
  '/content/**/{cover,thumbnail}.{jpg,jpeg,png,webp,gif}',
  { eager: true }
);
const THEME_COVERS = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/img/covers/*.{jpg,jpeg,png,webp}',
  { eager: true }
);
const PLACEHOLDERS = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/img/jeff/placeholder_*.{jpg,jpeg,png,webp}',
  { eager: true }
);

// `import.meta.glob` returns paths sorted lexicographically — i.e.
// `placeholder_1`, `placeholder_10`, `placeholder_11`, … `placeholder_19`,
// `placeholder_2`, `placeholder_20`, …  Sort by the numeric suffix so callers
// that walk the list sequentially actually walk through 1, 2, 3, … in order.
const PLACEHOLDER_LIST: ImageMetadata[] = Object.entries(PLACEHOLDERS)
  .map(([path, mod]) => {
    const match = path.match(/placeholder_(\d+)\./);
    const n = match ? parseInt(match[1], 10) : 0;
    return { n, img: mod.default };
  })
  .sort((a, b) => a.n - b.n)
  .map((x) => x.img);

// Lookup table keyed by lower-cased basename (no extension) so callers can
// reference covers by their YAML id without worrying about case sensitivity
// on macOS APFS vs Linux ext4 (the source artists.yml mixes both).
const THEME_COVERS_BY_STEM: Map<string, ImageMetadata> = (() => {
  const out = new Map<string, ImageMetadata>();
  for (const [path, mod] of Object.entries(THEME_COVERS)) {
    const stem = path.split('/').pop()!.replace(/\.[^.]+$/, '').toLowerCase();
    out.set(stem, mod.default);
  }
  return out;
})();

type Resolvable = CollectionEntry<'reviews' | 'blogs' | 'tutorials'>;

function findColocatedExplicit(entry: Resolvable, wantedFile: string): ImageMetadata | undefined {
  const wanted = wantedFile.toLowerCase();
  for (const [path, mod] of Object.entries(COLOCATED)) {
    if (path.includes(`/${entry.id}/`) && path.toLowerCase().endsWith(wanted)) {
      return mod.default;
    }
  }
  return undefined;
}

function findColocated(entry: Resolvable): ImageMetadata | undefined {
  for (const [path, mod] of Object.entries(COLOCATED)) {
    if (path.includes(`/${entry.id}/`)) return mod.default;
  }
  return undefined;
}

function findThemeCover(entry: Resolvable): ImageMetadata | undefined {
  for (const [path, mod] of Object.entries(THEME_COVERS)) {
    const stem = path.split('/').pop()!.split('.')[0];
    if (stem === entry.id) return mod.default;
  }
  return undefined;
}

function pickPlaceholder(entry: Resolvable): ImageMetadata {
  if (PLACEHOLDER_LIST.length === 0) throw new Error('covers: no placeholders available');
  // There are 31 numbered placeholders, one per day-of-month, so pick by
  // `getDate()` (1–31). Falls through `% length` to stay safe if the
  // placeholder set ever shrinks.
  const day = (entry.data as { date?: Date }).date?.getDate() ?? 1;
  return PLACEHOLDER_LIST[(day - 1) % PLACEHOLDER_LIST.length];
}

function resolveSource(entry: Resolvable): ImageMetadata {
  const explicit = (entry.data as { images?: string[] }).images?.[0];
  if (explicit) {
    const m = findColocatedExplicit(entry, explicit);
    if (m) return m;
  }
  return findColocated(entry) ?? findThemeCover(entry) ?? pickPlaceholder(entry);
}

export async function resolveCover(
  entry: Resolvable,
  width: number,
  height: number,
): Promise<{ src: string; width: number; height: number }> {
  const src = resolveSource(entry);
  const optimized = await getImage({
    src,
    width,
    height,
    quality: 70,
    format: 'webp',
  });
  return { src: optimized.src, width, height };
}

export interface ResolvedArtistCover {
  /** Original cover id from `artists.yml`. Lets the consumer log misses. */
  id: string;
  /** Optimised webp URL ready to drop into `<source srcset>`. */
  src: string;
  width: number;
  height: number;
}

/**
 * Resolve a list of cover ids into optimised webp images.
 *
 * Hugo's artists template uses `resources.GetMatch "img/covers/<id>.*"` and
 * fills each to `500x800 Center webp q70 #000000`; we mirror that with
 * `getImage()` from `astro:assets` so the URLs (and filesystem outputs) end
 * up under `/_astro/<hash>.webp`. Missing ids are dropped silently — the
 * Hugo build did the same.
 */
export async function resolveArtistCovers(
  ids: string[],
  width: number,
  height: number,
): Promise<ResolvedArtistCover[]> {
  const out: ResolvedArtistCover[] = [];
  for (const id of ids) {
    const src = THEME_COVERS_BY_STEM.get(id.toLowerCase());
    if (!src) continue;
    const optimised = await getImage({
      src,
      width,
      height,
      quality: 70,
      format: 'webp',
    });
    out.push({ id, src: optimised.src, width, height });
  }
  return out;
}
