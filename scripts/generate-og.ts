import { chromium } from 'playwright';
import sharp from 'sharp';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { spawn, type ChildProcess } from 'child_process';

const ROOT = resolve(import.meta.dirname, '..');
const OG_DIR = join(ROOT, 'astro-public', 'og');
const CONTENT_DIR = join(ROOT, 'content', 'reviews');
const MANIFEST_PATH = join(OG_DIR, 'manifest.json');
const PORT = 4322;
const BASE_URL = `http://localhost:${PORT}`;
const WIDTH = 1200;
const HEIGHT = 630;

interface Manifest {
  [slug: string]: string;
}

function getReviewSlugs(): string[] {
  return readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function computeHash(slug: string): string {
  const indexPath = join(CONTENT_DIR, slug, 'index.md');
  if (!existsSync(indexPath)) return '';
  const content = readFileSync(indexPath, 'utf-8');
  const frontmatter = content.split('---')[1] ?? '';
  return createHash('md5').update(frontmatter).digest('hex');
}

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) return {};
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
}

function saveManifest(manifest: Manifest): void {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
}

async function startDevServer(): Promise<ChildProcess> {
  const server = spawn('npx', ['astro', 'dev', '--port', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Dev server startup timed out')), 60000);
    const onData = (chunk: Buffer) => {
      if (chunk.toString().includes(`localhost:${PORT}`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout?.on('data', onData);
    server.stderr?.on('data', onData);
    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  // Extra delay for Vite to finish initial compilation
  await new Promise((r) => setTimeout(r, 2000));
  return server;
}

async function run() {
  mkdirSync(OG_DIR, { recursive: true });

  const slugs = getReviewSlugs();
  const oldManifest = loadManifest();
  const newManifest: Manifest = {};

  // Determine which slugs need regeneration
  const toGenerate: string[] = [];
  for (const slug of slugs) {
    const hash = computeHash(slug);
    newManifest[slug] = hash;
    const imgPath = join(OG_DIR, `${slug}.webp`);
    if (oldManifest[slug] === hash && existsSync(imgPath)) {
      continue;
    }
    toGenerate.push(slug);
  }

  if (toGenerate.length === 0) {
    console.log(`All ${slugs.length} OG images are up-to-date.`);
    saveManifest(newManifest);
    return;
  }

  console.log(`Generating ${toGenerate.length} OG images (${slugs.length - toGenerate.length} cached)...`);

  const server = await startDevServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });

  let generated = 0;
  let failed = 0;
  const startTime = Date.now();

  try {
    for (const slug of toGenerate) {
      const page = await context.newPage();
      try {
        const url = `${BASE_URL}/og/${slug}/`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        // Wait a small extra moment for any font rendering
        await page.waitForTimeout(500);

        const pngBuffer = await page.screenshot({ type: 'png' });
        const webpBuffer = await sharp(pngBuffer)
          .resize(WIDTH, HEIGHT, { fit: 'cover' })
          .webp({ quality: 80 })
          .toBuffer();

        writeFileSync(join(OG_DIR, `${slug}.webp`), webpBuffer);
        generated++;
        if (generated % 10 === 0) {
          console.log(`  ${generated}/${toGenerate.length} done...`);
        }
      } catch (err) {
        console.error(`  Failed: ${slug} — ${(err as Error).message}`);
        failed++;
        // Remove from manifest so it retries next run
        delete newManifest[slug];
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }

  saveManifest(newManifest);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s: ${generated} generated, ${slugs.length - toGenerate.length} cached, ${failed} failed.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
