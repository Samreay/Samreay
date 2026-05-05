/**
 * Astro integration that exposes a dev-only authoring endpoint for the
 * recommendation flowchart's position cache.
 *
 * Why this is a Vite middleware and not a normal Astro endpoint at
 * `src/pages/api/flowchart-positions.json.ts`:
 *
 * The site is `output: 'static'`, so every Astro route prerenders by
 * default. POST requests against a prerendered route are rejected with
 * the runtime warning:
 *
 *   "POST requests are not available in static endpoints. Mark this
 *    page as server-rendered (`export const prerender = false;`) or
 *    update your config to `output: 'server'`."
 *
 * Setting `prerender = false` on the route is supposed to fix that, but
 * Astro's static analysis only reliably picks up *literal* `true`/`false`
 * exports. Anything computed (`!import.meta.env.DEV`, an env-gated
 * branch, etc.) gets the default treatment in static mode and the
 * endpoint stays prerendered. A literal `prerender = false` *would* work
 * in dev — but breaks `astro build` with `NoAdapterInstalled`, because
 * `output: 'static'` without an SSR adapter forbids any non-prerendered
 * route. Installing an adapter just to get a dev-only POST handler is
 * disproportionate for the static GitHub-Pages deploy this site uses.
 *
 * A Vite middleware sidesteps the entire Astro routing layer:
 *   - In dev (`apply: 'serve'`), it intercepts the URL before Astro's
 *     router sees it. POST works without any prerender games.
 *   - In build (`astro build`), `apply: 'serve'` means Vite never even
 *     loads the plugin — there is no production artefact to deploy.
 *
 * The middleware uses `server.ssrLoadModule` to call into the same
 * `src/lib/flowchart-positions.ts` and `src/lib/flowchart-layout.ts`
 * modules the rest of the site uses, so there's no logic duplication.
 *
 * POST body shape (unchanged from the previous Astro endpoint):
 *   { positions: Record<id, { x, y }>, refine?: boolean }
 *
 * If `refine` is true, the middleware persists the supplied positions
 * and then runs `getLayoutedElements(flowchart, { refine: true })`,
 * which skips ELK and re-runs the Verlet relax over the just-saved
 * positions, then writes the cleaned-up coordinates back to disk.
 *
 * Alternative POST body shape (mutually exclusive with `positions`):
 *   { reset: true }
 *
 * The `reset` form skips position parsing entirely: the middleware
 * deletes the on-disk cache via `clearPositions()` and then invokes
 * `getLayoutedElements(flowchart)` (no `refine`), which sees the
 * missing cache, runs the full ELK + sporeOverlap + Verlet pipeline
 * from scratch, and writes the freshly-computed coordinates back to
 * disk. The Svelte toolbar follows the response with a page reload so
 * the user immediately sees the new layout.
 */

const ENDPOINT_PATH = '/api/flowchart-positions.json';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function sendJson(res, status, payload) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(JSON_HEADERS)) res.setHeader(k, v);
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Validate the POST body shape and project it into a `Map<id, {x, y}>`.
 * Returns either `{ ok: true, map, refine }` or `{ ok: false, status,
 * error }` so the caller can short-circuit with the right HTTP status.
 *
 * @param {unknown} parsed
 */
function parsePositionsPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, status: 400, error: 'body must be a JSON object' };
  }
  const positionsField = parsed.positions;
  if (!positionsField || typeof positionsField !== 'object') {
    return {
      ok: false,
      status: 400,
      error: '`positions` must be an object of { id: { x, y } }',
    };
  }
  const map = new Map();
  for (const [id, value] of Object.entries(positionsField)) {
    if (!value || typeof value !== 'object') {
      return { ok: false, status: 400, error: `entry "${id}" is not an object` };
    }
    const { x, y } = value;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return { ok: false, status: 400, error: `entry "${id}" has non-finite x/y` };
    }
    map.set(id, { x, y });
  }
  return { ok: true, map, refine: parsed.refine === true };
}

export function flowchartPositionsDev() {
  return {
    name: 'flowchart-positions-dev',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'flowchart-positions-dev:middleware',
                apply: 'serve',
                configureServer(server) {
                  server.middlewares.use(async (req, res, next) => {
                    if (!req.url) return next();
                    // Strip query string / hash for the comparison so
                    // future debug helpers like `?cb=…` still route
                    // through this handler.
                    const pathname = req.url.split('?')[0].split('#')[0];
                    if (pathname !== ENDPOINT_PATH) return next();

                    try {
                      const positionsModule = await server.ssrLoadModule(
                        '/src/lib/flowchart-positions.ts',
                      );

                      if (req.method === 'GET') {
                        const file =
                          positionsModule.loadPositions() ?? {
                            version: 1,
                            positions: {},
                          };
                        sendJson(res, 200, file);
                        return;
                      }

                      if (req.method === 'POST') {
                        const raw = await readBody(req);
                        let parsed;
                        try {
                          parsed = JSON.parse(raw);
                        } catch (err) {
                          sendJson(res, 400, {
                            ok: false,
                            error: `invalid JSON body: ${err?.message ?? err}`,
                          });
                          return;
                        }

                        // `{ reset: true }` is handled before the
                        // normal positions parser runs — the body has
                        // no `positions` field on this path, so
                        // `parsePositionsPayload` would otherwise 400
                        // it. Reset deletes the cache and re-runs the
                        // full layout pipeline so the next page load
                        // shows fresh ELK+relax output.
                        if (parsed && typeof parsed === 'object' && parsed.reset === true) {
                          const removed = positionsModule.clearPositions();
                          try {
                            const [layoutModule, dataModule] = await Promise.all([
                              server.ssrLoadModule('/src/lib/flowchart-layout.ts'),
                              server.ssrLoadModule('/src/data/flowchart.ts'),
                            ]);
                            await layoutModule.getLayoutedElements(
                              dataModule.flowchart,
                            );
                          } catch (err) {
                            sendJson(res, 500, {
                              ok: false,
                              reset: true,
                              cleared: removed,
                              error: `relayout after reset failed: ${err?.message ?? String(err)}`,
                            });
                            return;
                          }
                          sendJson(res, 200, {
                            ok: true,
                            reset: true,
                            cleared: removed,
                          });
                          return;
                        }

                        const result = parsePositionsPayload(parsed);
                        if (!result.ok) {
                          sendJson(res, result.status, {
                            ok: false,
                            error: result.error,
                          });
                          return;
                        }

                        positionsModule.savePositions(result.map);

                        if (result.refine) {
                          // Re-run the physics relax over the freshly-
                          // saved positions. We load the layout pipeline
                          // and the data file lazily here (not at module
                          // top) so a malformed flowchart.ts only breaks
                          // refine, not the GET/non-refine POST paths.
                          try {
                            const [layoutModule, dataModule] = await Promise.all([
                              server.ssrLoadModule('/src/lib/flowchart-layout.ts'),
                              server.ssrLoadModule('/src/data/flowchart.ts'),
                            ]);
                            await layoutModule.getLayoutedElements(
                              dataModule.flowchart,
                              { refine: true },
                            );
                          } catch (err) {
                            sendJson(res, 200, {
                              ok: true,
                              count: result.map.size,
                              refine: false,
                              refineError: err?.message ?? String(err),
                            });
                            return;
                          }
                        }

                        sendJson(res, 200, {
                          ok: true,
                          count: result.map.size,
                          refine: result.refine,
                        });
                        return;
                      }

                      // Any other verb: 405 with an Allow header per
                      // RFC 9110 §15.5.6.
                      res.setHeader('Allow', 'GET, POST');
                      sendJson(res, 405, {
                        ok: false,
                        error: `method ${req.method} not allowed`,
                      });
                    } catch (err) {
                      sendJson(res, 500, {
                        ok: false,
                        error: err?.message ?? String(err),
                      });
                    }
                  });
                },
              },
            ],
          },
        });
      },
    },
  };
}
