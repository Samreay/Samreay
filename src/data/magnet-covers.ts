import { z } from 'astro/zod';
import { parseAllDocuments } from 'yaml';

const text = z.string().trim().min(1);
const id = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'Expected a stable catalogue ID');
const url = z.string().url().regex(/^https?:\/\//i, 'Expected an HTTP or HTTPS source URL');
const sources = z.record(text, url).optional();

const bookSchema = z.object({
  volume: z.number().nonnegative().multipleOf(0.5),
  part: z.number().int().positive().optional(),
  title: text,
  author: text.optional(),
  cover: z.string().regex(/^(?:[\w-]+\/)+[\w-]+\.webp$/, 'Expected a relative WebP asset path'),
  rankedReviewId: id.optional(),
  omnibus: z.boolean().optional(),
  collection: z.boolean().optional(),
  sources,
}).strict();

const editionSchema = z.object({
  id,
  idPrefix: id.optional(),
  name: text.optional(),
  notes: text.optional(),
  sources,
  books: z.array(bookSchema).nonempty(),
}).strict();

const seriesSchema = z.object({
  series: text,
  author: text,
  reviewId: id.optional(),
  editions: z.array(editionSchema).nonempty(),
}).strict();

function readSeries(file: string, yaml: string) {
  const documents = parseAllDocuments(yaml);
  if (!documents.length) throw new Error(file + ': empty YAML file');
  return documents.map((document, i) => {
    const context = file + ' (document ' + (i + 1) + ')';
    const problem = document.errors[0] ?? document.warnings[0];
    if (problem) throw new Error(context + ': ' + problem.message);
    const result = seriesSchema.safeParse(document.toJS());
    if (!result.success) {
      const issues = result.error.issues.map(issue => issue.path.join('.') + ': ' + issue.message);
      throw new Error(context + ': ' + issues.join('\n'));
    }
    return result.data;
  });
}

function register(seen: Set<string>, value: string, kind: string, context: string) {
  if (seen.has(value)) throw new Error(context + ': duplicate ' + kind + ' ' + value);
  seen.add(value);
}

export function loadMagnetCatalogue(files: Record<string, string>, assets: Set<string>, reviews: Set<string>) {
  const seriesNames = new Set<string>(), editions = new Set<string>();
  const selections = new Set<string>(), covers = new Set<string>();
  const entries = Object.entries(files).flatMap(([file, yaml]) => readSeries(file, yaml).flatMap(series => {
    register(seriesNames, series.series, 'series', file);
    function checkReview(reviewId: string | undefined) {
      if (reviewId && !reviews.has(reviewId)) throw new Error(file + ': unknown review ' + reviewId);
    }
    checkReview(series.reviewId);
    return series.editions.flatMap(edition => {
      register(editions, edition.id, 'edition ID', file);
      const volumes = new Set<string>();
      return edition.books.map(book => {
        const context = file + ' / ' + edition.id + ' / ' + book.title;
        const volume = [book.volume, book.part].filter(v => v !== undefined).join('-');
        register(volumes, volume, 'volume/part', context);
        checkReview(book.rankedReviewId);
        const selectionId = book.rankedReviewId ?? (edition.idPrefix ?? edition.id) + '-' + volume;
        if (!book.rankedReviewId && reviews.has(selectionId)) throw new Error(context + ': ID collides with review ' + selectionId);
        register(selections, selectionId, 'selection ID', context);
        register(covers, book.cover, 'cover path', context);
        if (!assets.has(book.cover)) throw new Error(context + ': missing cover ' + book.cover);
        const provenance = [...Object.entries(edition.sources ?? {}), ...Object.entries(book.sources ?? {})];
        if (!provenance.length) throw new Error(context + ': missing source URL');
        return {
          id: selectionId, title: book.title, author: book.author ?? series.author,
          reviewId: book.rankedReviewId ?? series.reviewId, cover: book.cover,
          series: { name: series.series, edition: edition.name, volume: book.volume, part: book.part,
            collection: book.collection, omnibus: book.omnibus },
          editionId: edition.id, notes: edition.notes, sources: provenance,
        };
      });
    });
  }));
  for (const asset of assets) {
    if (!covers.has(asset)) throw new Error('Unregistered magnet cover: ' + asset);
  }
  return entries;
}
