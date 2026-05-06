/**
 * Astro integration that exposes co-located content assets at their
 * page-relative URL.
 *
 * Hugo's "page bundle" model meant `content/blogs/keva/keva_small.mp4`
 * was automatically published at `/blogs/keva/keva_small.mp4`, so raw
 * `<video src="keva_small.mp4">` tags inside the markdown just worked.
 * Astro's content collections only process referenced images via
 * `astro:assets` and treat everything else (videos, PDFs, PSDs, zips,
 * notebook downloads) as inert — relative `<video>` `src`es 404, and
 * `[…](file.zip)` links break.
 *
 * This integration restores the Hugo behaviour:
 *   - In dev (`astro dev`), a Vite middleware streams the file straight
 *     from `content/<type>/<slug>/<file>` whenever the URL matches.
 *   - In build (`astro build`), the same files are copied into `dist/`
 *     so the static deploy keeps working.
 *
 * Markdown / image-pipeline files are deliberately skipped:
 *   - `.md` / `.mdx` are content, not assets.
 *   - Images (`png`, `jpg`, `jpeg`, `webp`, `gif`, `svg`) are already
 *     processed by `astro:assets` for `![]()` markdown references; we
 *     don't want a duplicate, unoptimised copy in the output. The rare
 *     `[link](image.png)` text-link case keeps needing a manual copy
 *     into `astro-public/` (only `2025_01_cover_art/layout.png` so far).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT_TYPES = ['blogs', 'tutorials', 'reviews'];

const SKIP_EXT = new Set([
  '.md', '.mdx',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg',
]);

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.pdf': 'application/pdf',
  '.psd': 'image/vnd.adobe.photoshop',
  '.zip': 'application/zip',
  '.csv': 'text/csv; charset=utf-8',
  '.ipynb': 'application/x-ipynb+json',
  '.txt': 'text/plain; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/** @param {string} ext */
function shouldServe(ext) {
  return ext.length > 0 && !SKIP_EXT.has(ext.toLowerCase());
}

/**
 * Map a request URL like `/blogs/keva/keva_small.mp4` to the on-disk
 * source path, returning `null` if the URL doesn't look like a content
 * asset or the file isn't present.
 *
 * @param {string} urlPath
 * @param {string} repoRoot
 */
function resolveContentAsset(urlPath, repoRoot) {
  const clean = urlPath.split('?')[0].split('#')[0];
  const parts = clean.replace(/^\/+/, '').split('/');
  if (parts.length < 3) return null;
  const [type, slug, ...rest] = parts;
  if (!CONTENT_TYPES.includes(type)) return null;
  if (rest.length === 0) return null;
  // Defence in depth against `..` segments that would escape `content/`.
  if (rest.some((seg) => seg === '..' || seg === '')) return null;
  const filename = rest.join('/');
  const ext = path.extname(filename);
  if (!shouldServe(ext)) return null;
  const filepath = path.resolve(repoRoot, 'content', type, slug, filename);
  if (!filepath.startsWith(path.resolve(repoRoot, 'content') + path.sep)) return null;
  if (!fs.existsSync(filepath)) return null;
  return filepath;
}

/**
 * Walk all content asset files (post-extension-filter) and yield
 * `{ source, relativeUrl }` tuples for the build step.
 *
 * @param {string} repoRoot
 */
function* walkContentAssets(repoRoot) {
  for (const type of CONTENT_TYPES) {
    const base = path.resolve(repoRoot, 'content', type);
    if (!fs.existsSync(base)) continue;
    for (const slug of fs.readdirSync(base)) {
      const slugDir = path.join(base, slug);
      if (!fs.statSync(slugDir).isDirectory()) continue;
      // Use a stack so nested directories (rare but possible — e.g.
      // notebook checkpoints — get covered too).
      const stack = [slugDir];
      while (stack.length) {
        const dir = stack.pop();
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            stack.push(full);
            continue;
          }
          if (!entry.isFile()) continue;
          const ext = path.extname(entry.name);
          if (!shouldServe(ext)) continue;
          const rel = path.relative(slugDir, full);
          yield {
            source: full,
            // URL-style separators on Windows too.
            relativeUrl: `${type}/${slug}/${rel.split(path.sep).join('/')}`,
          };
        }
      }
    }
  }
}

export function contentAssets() {
  let repoRoot = process.cwd();

  return {
    name: 'content-assets',
    hooks: {
      'astro:config:setup': ({ config, updateConfig }) => {
        repoRoot = fileURLToPath(config.root);
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'content-assets:dev',
                apply: 'serve',
                configureServer(server) {
                  server.middlewares.use((req, res, next) => {
                    if (!req.url) return next();
                    const filepath = resolveContentAsset(req.url, repoRoot);
                    if (!filepath) return next();
                    const ext = path.extname(filepath).toLowerCase();
                    const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
                    res.setHeader('Content-Type', mime);
                    res.setHeader('Cache-Control', 'no-cache');
                    fs.createReadStream(filepath).pipe(res);
                  });
                },
              },
            ],
          },
        });
      },
      'astro:build:done': ({ dir, logger }) => {
        const distDir = fileURLToPath(dir);
        let copied = 0;
        for (const { source, relativeUrl } of walkContentAssets(repoRoot)) {
          const dest = path.join(distDir, relativeUrl);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(source, dest);
          copied += 1;
        }
        logger.info(`copied ${copied} content asset${copied === 1 ? '' : 's'}`);
      },
    },
  };
}
