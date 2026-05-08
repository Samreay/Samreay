/**
 * Common queries against the content collections defined in
 * `src/content.config.ts`. Centralised here so home / explorer / list
 * pages don't each re-implement sort + slice and end up with subtly
 * different orderings.
 */
import { getCollection } from 'astro:content';

export const getRecentBlogs = async (n = 6) =>
  (await getCollection('blogs')).
    sort((a, b) => +b.data.date - +a.data.date).
    slice(0, n);

export const getRecentTutorials = async (n = 6) =>
  (await getCollection('tutorials')).
    sort((a, b) => +b.data.date - +a.data.date).
    slice(0, n);

export const getRecentReviews = async (n = 5) =>
  (await getCollection('reviews')).
    sort((a, b) => +b.data.date - +a.data.date).
    slice(0, n);

/**
 * Reviews ranked by the explicit `weight` field — that's the order the
 * Hugo template uses on the `/reviews/` index. Lower weight = featured
 * higher up. Ties are broken by date (newer first) so the order is
 * deterministic across platforms.
 */
export const getReviewsByWeight = async () =>
  (await getCollection('reviews')).
    sort((a, b) => {
      const dw = a.data.weight - b.data.weight;
      if (dw !== 0) return dw;
      return +b.data.date - +a.data.date;
    });

export const getReviewsByDate = async () =>
  (await getCollection('reviews')).
    sort((a, b) => +b.data.date - +a.data.date);

/**
 * Converts a review's frontmatter `weight` into a sampling weight for
 * tie-breaking within a shared-tag bucket. Higher-scoring reviews (lower
 * `weight` values) are more likely to be picked — the mapping is linear:
 *
 *   samplingWeight = MAX_WEIGHT - reviewWeight
 *
 * e.g. reviewWeight=10 → samplingWeight=50, reviewWeight=35 → samplingWeight=25
 * (half as likely to be drawn). Clamp to 1 so zero-probability entries are
 * impossible regardless of how large `reviewWeight` grows.
 */
function reviewSamplingWeight(reviewWeight: number, maxWeight = 60): number {
  return Math.max(1, maxWeight - reviewWeight);
}

/**
 * Weighted random sample of `k` items from `pool` without replacement.
 * Each item's probability of being drawn is proportional to its `weight`.
 */
function weightedSample<T>(pool: { item: T; weight: number }[], k: number): T[] {
  const remaining = [...pool];
  const result: T[] = [];
  while (result.length < k && remaining.length > 0) {
    const total = remaining.reduce((sum, x) => sum + x.weight, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < remaining.length - 1; idx++) {
      r -= remaining[idx].weight;
      if (r <= 0) break;
    }
    result.push(remaining[idx].item);
    remaining.splice(idx, 1);
  }
  return result;
}

/**
 * Return up to `n` reviews most similar to `current`, ranked by shared-tag
 * count (descending). Within each tag-overlap tier, ties are broken by
 * weighted random sampling — reviews with lower `weight` values (i.e. higher
 * editorial ranking) are proportionally more likely to appear. See
 * `reviewSamplingWeight` for the exact mapping.
 *
 * The current review is always excluded.
 */
export function getSimilarReviews(
  current: import('astro:content').CollectionEntry<'reviews'>,
  all: import('astro:content').CollectionEntry<'reviews'>[],
  n = 4,
): import('astro:content').CollectionEntry<'reviews'>[] {
  const currentTags = new Set(current.data.tags);

  // Group candidates by shared-tag count.
  const buckets = new Map<number, import('astro:content').CollectionEntry<'reviews'>[]>();
  for (const e of all) {
    if (e.id === current.id) continue;
    const shared = e.data.tags.filter((t) => currentTags.has(t)).length;
    if (!buckets.has(shared)) buckets.set(shared, []);
    buckets.get(shared)!.push(e);
  }

  // Drain buckets highest-overlap first, sampling within each bucket.
  const result: import('astro:content').CollectionEntry<'reviews'>[] = [];
  for (const shared of [...buckets.keys()].sort((a, b) => b - a)) {
    if (result.length >= n) break;
    const pool = buckets.get(shared)!.map((entry) => ({
      item: entry,
      weight: reviewSamplingWeight(entry.data.weight),
    }));
    const needed = n - result.length;
    result.push(...weightedSample(pool, Math.min(needed, pool.length)));
  }

  return result;
}
