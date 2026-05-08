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
 * Return up to `n` reviews most similar to `current`, ranked by shared-tag
 * count (descending), then by `weight` (ascending), then by `date`
 * (descending).  The current review is always excluded.
 */
export function getSimilarReviews(
  current: import('astro:content').CollectionEntry<'reviews'>,
  all: import('astro:content').CollectionEntry<'reviews'>[],
  n = 4,
): import('astro:content').CollectionEntry<'reviews'>[] {
  const currentTags = new Set(current.data.tags);
  return all
    .filter((e) => e.id !== current.id)
    .map((e) => {
      const shared = e.data.tags.filter((t) => currentTags.has(t)).length;
      return { entry: e, shared };
    })
    .sort((a, b) => {
      if (b.shared !== a.shared) return b.shared - a.shared;
      const dw = a.entry.data.weight - b.entry.data.weight;
      if (dw !== 0) return dw;
      return +b.entry.data.date - +a.entry.data.date;
    })
    .slice(0, n)
    .map((x) => x.entry);
}
