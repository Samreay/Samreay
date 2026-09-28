import { readFile, writeFile } from 'node:fs/promises';

/** Fetch the graph's existing module tree while the browser parses its HTML. */
export function flowchartPreload() {
  /** @type {Map<string, string[]>} */
  const imports = new Map();

  return {
    name: 'flowchart-preload',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'flowchart-module-imports',
                apply: 'build',
                // Vite removes CSS-only chunks during generateBundle.
                writeBundle(_options, bundle) {
                  for (const output of Object.values(bundle)) {
                    if (output.type === 'chunk') imports.set(output.fileName, output.imports);
                  }
                },
              },
            ],
          },
        });
      },
      'astro:build:done': async ({ dir, logger }) => {
        const page = new URL('reviews/flowchart/index.html', dir);
        const html = await readFile(page, 'utf8');
        const island = [...html.matchAll(/<astro-island\b[^>]*>/g)]
          .map(([tag]) => tag)
          .find((tag) => /component-url="[^"]*\/Flowchart\.[^"]+"/.test(tag));
        if (!island) throw new Error('Flowchart island missing from the generated page');

        const entrypoints = ['component-url', 'renderer-url'].map((attribute) => {
          const url = island.match(new RegExp(`${attribute}="([^"]+)"`))?.[1];
          if (!url?.startsWith('/_astro/')) throw new Error(`Unexpected flowchart ${attribute}: ${url}`);
          return url.slice(1);
        });
        const modules = new Set();
        function visit(filename) {
          if (modules.has(filename)) return;
          const dependencies = imports.get(filename);
          if (!dependencies) throw new Error(`Flowchart module absent from the client bundle: ${filename}`);
          modules.add(filename);
          for (const dependency of dependencies) visit(dependency);
        }
        for (const entrypoint of entrypoints) visit(entrypoint);
        const links = [...modules]
          .map((filename) => `<link rel="modulepreload" href="/${filename}" fetchpriority="low">`)
          .join('');
        await writeFile(page, html.replace('</head>', `${links}</head>`));
        logger.info(`preloaded ${modules.size} flowchart modules`);
      },
    },
  };
}
