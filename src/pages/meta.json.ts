/**
 * Static metadata endpoint at `/meta.json`. Emits real `getCollection()` counts
 * and a small sample of each collection. Originally added for the (now-removed)
 * Hugo→Astro migration verifier; kept as a lightweight build sanity signal.
 * Safe to remove if nothing consumes it.
 */
import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const [reviews, blogs, tutorials] = await Promise.all([
    getCollection('reviews'),
    getCollection('blogs'),
    getCollection('tutorials'),
  ]);
  const payload = {
    counts: {
      reviews: reviews.length,
      blogs: blogs.length,
      tutorials: tutorials.length,
    },
    sample: {
      reviews: reviews.slice(0, 3).map((r) => ({ id: r.id, title: r.data.title })),
      blogs: blogs.slice(0, 3).map((b) => ({ id: b.id, title: b.data.title })),
      tutorials: tutorials.slice(0, 3).map((t) => ({ id: t.id, title: t.data.title ?? t.data.short_title })),
    },
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: { 'content-type': 'application/json' },
  });
};
