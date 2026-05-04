import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const REVIEW_TIER = z.enum(['π', 'S', 'A', 'B', 'C', 'D', 'F']);

const reviews = defineCollection({
  loader: glob({ pattern: '*/index.md', base: './content/reviews' }),
  schema: ({ image: _image }) =>
    z.object({
      title: z.string(),
      name: z.string(),
      description: z.string(),
      sentence: z.string(),
      date: z.coerce.date(),
      auth: z.string(),
      categories: z.array(z.string()).default(['reviews']),
      review: REVIEW_TIER,
      weight: z.number(),
      tags: z.array(z.string()).default([]),
      search_terms: z.string().default(''),
      aliases: z.array(z.string()).default([]),
      // The frontmatter uses Hugo's `links: { amazon: "...", audible: "..." }`
      // pattern. Zod v3 (Astro 5) takes the value schema only — passing a key
      // schema as the second arg becomes a no-op in older versions, so just
      // declare values are strings and let any well-formed key through.
      links: z.record(z.string()).default({}),
      video: z.string().optional(),
      images: z.array(z.string()).optional(),
      short_title: z.string().optional(),
      math: z.boolean().default(false),
    }),
});

const blogs = defineCollection({
  loader: glob({ pattern: '*/index.md', base: './content/blogs' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    categories: z.array(z.string()).default(['blog']),
    tags: z.array(z.string()).default([]),
    aliases: z.array(z.string()).default([]),
    images: z.array(z.string()).optional(),
    short_title: z.string().optional(),
    hide_description: z.boolean().default(false),
    math: z.boolean().default(false),
    layout: z.string().optional(),
    // `cascade._build` lives on a handful of older Hugo posts — it's only
    // consumed by Hugo, never by us, so accept any shape and forget it.
    cascade: z.unknown().optional(),
  }),
});

const tutorials = defineCollection({
  loader: glob({ pattern: '*/index.{md,mdx}', base: './content/tutorials' }),
  // `title` is optional because a few tutorials (e.g. genetic_part_one)
  // only set `short_title`; the Hugo template falls back to that. Pages
  // that consume this collection must do the same.
  schema: z.object({
    title: z.string().optional(),
    short_title: z.string().optional(),
    description: z.string().optional(),
    date: z.coerce.date(),
    categories: z.array(z.string()).default(['tutorial']),
    tags: z.array(z.string()).default([]),
    aliases: z.array(z.string()).default([]),
    images: z.array(z.string()).optional(),
    hide_description: z.boolean().default(false),
    hide_toggle: z.boolean().default(false),
    math: z.boolean().default(false),
  }).refine(
    (data) => data.title || data.short_title,
    { message: 'Either `title` or `short_title` is required', path: ['title'] },
  ),
});

export const collections = { reviews, blogs, tutorials };
