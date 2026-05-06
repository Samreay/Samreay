/**
 * Static metadata endpoint used by the implement-plan verifier (Phase 4+).
 * Emits real `getCollection()` counts so the gate doesn't have to infer them
 * from disk. Lives at `/meta.json` in the built dist; consider gating it
 * behind a robots noindex or removing it post-cutover (Phase 14) if it
 * stays around longer than expected.
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
