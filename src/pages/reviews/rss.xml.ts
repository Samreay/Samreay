import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const entries = await getCollection('reviews');

  const sorted = entries.sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );

  return rss({
    title: 'Cosmic Coding — Book Reviews',
    description: 'Progression fantasy and LitRPG book reviews',
    site: context.site!,
    customData: '<language>en-us</language>',
    items: sorted.map((entry) => ({
      title: `${entry.data.name} by ${entry.data.auth}`,
      description: entry.data.sentence,
      author: entry.data.auth,
      pubDate: entry.data.date,
      link: `/reviews/${entry.id}/`,
    })),
  });
}
