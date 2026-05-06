// Build-time collector for Hugo `aliases:` frontmatter.
//
// Hugo treats every entry under `aliases:` as a redirect: at build time it
// emits a `<meta http-equiv="refresh">` HTML stub at the alias URL pointing
// at the canonical page. Astro doesn't read frontmatter for this — it has a
// dedicated `redirects` map in `astro.config.mjs`. This module walks the
// content tree once at config-load time and produces that map.
//
// Behaviour notes:
//   * `trailingSlash: 'always'` is set in `astro.config.mjs`, so every alias
//     and every target is normalised to end in `/`.
//   * Conflicts (two different pages claiming the same alias) log a warning
//     and the first one wins. Empirically the corpus has no such conflicts;
//     the warning is here so future drift is loud rather than silent.
//   * The matcher accepts either a single alias string or a YAML list. Hugo
//     accepts both forms and our content uses both interchangeably.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import matter from 'gray-matter';

const CONTENT_GLOB = 'content/{reviews,blogs,tutorials}/*/index.{md,mdx}';

function normalise(alias) {
  if (!alias) return null;
  let value = String(alias).trim();
  if (!value.startsWith('/')) value = '/' + value;
  if (!value.endsWith('/')) value += '/';
  return value;
}

export async function collectRedirects(repoRoot = process.cwd()) {
  const files = await glob(CONTENT_GLOB, { cwd: repoRoot, absolute: true });

  // Pass 1: build the canonical URL set so alias collisions can defer to
  // real pages. Hugo's behaviour is "real content wins"; an alias pointing
  // at an existing canonical URL is silently ignored. We replicate that
  // here so the redirect map doesn't shadow live content.
  const canonicalUrls = new Set();
  for (const file of files) {
    const rel = path.relative(repoRoot, file);
    const [, collection, slug] = rel.split(path.sep);
    canonicalUrls.add(normalise(`/${collection}/${slug}`));
  }

  const redirects = {};
  // Index of which file claimed an alias, used purely for the conflict
  // warning. Astro itself doesn't see this map.
  const owners = {};

  for (const file of files) {
    const raw = await readFile(file, 'utf-8');
    let data;
    try {
      ({ data } = matter(raw));
    } catch (err) {
      console.warn(`[collect-redirects] could not parse ${file}: ${err.message}`);
      continue;
    }
    if (!data || data.aliases == null) continue;

    const rawAliases = Array.isArray(data.aliases) ? data.aliases : [data.aliases];
    if (rawAliases.length === 0) continue;

    const rel = path.relative(repoRoot, file);
    const parts = rel.split(path.sep);
    const collection = parts[1];
    const slug = parts[2];
    const target = normalise(`/${collection}/${slug}`);

    for (const alias of rawAliases) {
      const from = normalise(alias);
      if (!from) continue;
      // `from === target` would be a no-op redirect (and Hugo wouldn't emit
      // an HTML stub either). Skip silently.
      if (from === target) continue;
      // Aliases that collide with a real page get dropped silently — Hugo
      // does the same. Without this, Astro happily overwrites canonical
      // pages with redirect stubs (e.g. `travellers_trial` claims an alias
      // `/reviews/unbound`, but `/reviews/unbound/` is its own published
      // review).
      if (canonicalUrls.has(from)) continue;
      if (from in redirects && redirects[from] !== target) {
        console.warn(
          `[collect-redirects] alias ${from} claimed by both ${owners[from]} and ${rel}; keeping the first`,
        );
        continue;
      }
      redirects[from] = target;
      owners[from] = rel;
    }
  }

  return redirects;
}
