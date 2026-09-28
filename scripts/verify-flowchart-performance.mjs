import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, webkit } from 'playwright';

// Run against a production preview. --baseline compares the complete serialized
// graph and fallback with a previous run, independently of mounted elements.
const { values } = parseArgs({
  options: {
    'base-url': { type: 'string', default: 'http://127.0.0.1:4331' },
    output: { type: 'string' },
    baseline: { type: 'string' },
    browsers: { type: 'string', default: 'chromium,webkit' },
    profiles: { type: 'string', default: 'desktop,mobile' },
    dev: { type: 'boolean', default: false },
  },
});
assert(values.output, 'Use a fresh --output directory');
const output = path.resolve(values.output);
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'results.json'), '[]\n', { flag: 'wx' });
const baseline = values.baseline ? JSON.parse(await readFile(values.baseline, 'utf8')) : null;
const results = [];
const browsers = { chromium, webkit };
const nodeSelector = (id) => `.svelte-flow__node[data-id="${id}"]`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function graphModel(page) {
  return page.evaluate(() => {
    const revive = ([type, value]) => {
      if (type === 1) return value.map(revive);
      if (type === 0)
        return value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]))
          : value;
      throw new Error(`Unexpected Astro serialization type ${type}`);
    };
    const props = JSON.parse(document.querySelector('astro-island[component-url*="Flowchart"]').getAttribute('props'));
    return {
      nodes: revive(props.nodes),
      edges: revive(props.edges),
      fallback: document.querySelector('[aria-label="Flowchart as a list"]').innerHTML,
    };
  });
}

function pathToBook(model, target = 'b_cradle', start = 'd_start') {
  const queue = [[start]];
  while (queue.length) {
    const ids = queue.shift();
    if (ids.at(-1) === target) return ids;
    for (const edge of model.edges.filter((e) => e.source === ids.at(-1))) {
      if (!ids.includes(edge.target)) queue.push([...ids, edge.target]);
    }
  }
  throw new Error(`No path from ${start} to ${target}`);
}

async function transform(page) {
  return page.locator('.svelte-flow__viewport').evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
}

async function inView(page, ids) {
  await page.waitForFunction((ids) => {
    const c = document.querySelector('.flowchart-canvas').getBoundingClientRect();
    return ids.every((id) => {
      const el = document.querySelector(`.svelte-flow__node[data-id="${id}"]`);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.left >= c.left - 2 && r.right <= c.right + 2 && r.top >= c.top - 2 && r.bottom <= c.bottom + 2;
    });
  }, ids);
}

async function coversDecoded(page, ids) {
  await page.waitForFunction(
    (ids) =>
      ids.every((id) => {
        const img = document.querySelector(`.svelte-flow__node[data-id="${id}"] img`);
        return img?.complete && img.naturalWidth > 0;
      }),
    ids
  );
  await page.evaluate(async (ids) => {
    await Promise.all(ids.map((id) => document.querySelector(`.svelte-flow__node[data-id="${id}"] img`).decode()));
  }, ids);
}

for (const browserName of values.browsers.split(',')) {
  assert(browsers[browserName], `Unknown browser ${browserName}`);
  for (const profile of values.profiles.split(',')) {
    assert(['mobile', 'desktop'].includes(profile));
    const mobile = profile === 'mobile';
    const row = { browser: browserName, profile, checks: [], errors: [] };
    results.push(row);
    let browser, context, page, currentStep;
    const prefix = `${browserName}-${profile}`;
    const screenshot = (name) => page.screenshot({ path: path.join(output, `${prefix}-${name}.png`) });
    try {
      browser = await browsers[browserName].launch();
      row.version = browser.version();
      context = await browser.newContext({
        viewport: mobile ? { width: 412, height: 823 } : { width: 1350, height: 940 },
        hasTouch: mobile,
        isMobile: mobile,
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
      });
      // Track live observations, not just construction count, to detect leaked
      // subscriptions after navigating. Instrumentation is regression-only.
      await context.addInitScript(() => {
        window.__observedTargets = {};
        for (const name of ['IntersectionObserver', 'ResizeObserver']) {
          const Native = window[name];
          const subscriptions = new Map();
          window.__observedTargets[name] = subscriptions;
          window[name] = class extends Native {
            observe(el, options) {
              if (!subscriptions.has(this)) subscriptions.set(this, new Set());
              subscriptions.get(this).add(el);
              return super.observe(el, options);
            }
            unobserve(el) {
              const targets = subscriptions.get(this);
              targets?.delete(el);
              if (!targets?.size) subscriptions.delete(this);
              return super.unobserve(el);
            }
            disconnect() {
              subscriptions.delete(this);
              return super.disconnect();
            }
          };
        }
      });
      page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', (e) => row.errors.push(String(e.stack ?? e)));
      const base = `${values['base-url']}/reviews/flowchart/`;
      const search = page.getByRole('searchbox', { name: 'Search the flowchart' });
      const button = (name) => page.getByRole('button', { name, exact: true });
      const ready = async (suffix = '') => {
        await page.goto(base + suffix, { waitUntil: 'domcontentloaded' });
        await page.locator(nodeSelector('d_start')).waitFor();
        await page.waitForFunction(() => !document.querySelector('astro-island[component-url*="Flowchart"][ssr]'));
      };
      const step = async (name, run) => {
        currentStep = name;
        await run();
        row.checks.push(name);
        console.log(`${prefix}: ${name}`);
      };
      await ready();
      const model = JSON.parse(JSON.stringify(await graphModel(page)));
      if (baseline) assert.deepEqual(model, baseline, 'Serialized graph content/geometry/fallback changed');
      await writeFile(path.join(output, 'graph-inventory.json'), JSON.stringify(model, null, 2));
      const books = model.nodes.filter((n) => n.type === 'book');
      const book = books.find((n) => n.id === 'b_cradle');
      assert(book);
      const distantBook = books.toSorted(
        (a, b) => Math.hypot(b.position.x, b.position.y) - Math.hypot(a.position.x, a.position.y)
      )[0];
      const quizPath = pathToBook(model);
      row.quizPath = quizPath;

      const clear = async () => {
        await button('Clear search').click();
        await page.waitForFunction(() => !document.querySelector('.flowchart-dim'));
      };
      let fitCount = 0;
      const fit = async (query, ids) => {
        await search.fill(query);
        await button('Zoom to show all matched books').click();
        if (fitCount < 2) {
          await sleep(160);
          await screenshot(`fit-in-flight-${fitCount++}`);
        }
        await sleep(950);
        await inView(page, ids);
        await coversDecoded(page, ids);
      };
      const movingPulse = async () => {
        await page.waitForFunction(() => document.querySelectorAll('.svelte-flow__edge circle').length > 0);
        const signature = await page
          .locator('.svelte-flow__edge circle')
          .evaluateAll((els) => els.map((el) => `${el.getAttribute('cx')},${el.getAttribute('cy')}`).join(';'));
        await page.waitForFunction((previous) => {
          const current = [...document.querySelectorAll('.svelte-flow__edge circle')]
            .map((el) => `${el.getAttribute('cx')},${el.getAttribute('cy')}`)
            .join(';');
          return current.length > 0 && current !== previous;
        }, signature);
      };
      const rendering = async () => {
        const failures = await page.evaluate(({ nodes, edges }) => {
          const issues = [];
          const byId = new Map(nodes.map((n) => [n.id, n]));
          const viewport = new DOMMatrix(getComputedStyle(document.querySelector('.svelte-flow__viewport')).transform);
          const canvas = document.querySelector('.flowchart-canvas');
          const visible = (n) =>
            n.position.x * viewport.a + viewport.e < canvas.clientWidth &&
            (n.position.x + n.width) * viewport.a + viewport.e > 0 &&
            n.position.y * viewport.a + viewport.f < canvas.clientHeight &&
            (n.position.y + n.height) * viewport.a + viewport.f > 0;
          const point = (n, side) => ({
            x: n.position.x + (side === 'left' ? 0 : side === 'right' ? n.width : n.width / 2),
            y: n.position.y + (side === 'top' ? 0 : side === 'bottom' ? n.height : n.height / 2),
          });
          for (const e of edges) {
            const p = document.getElementById(e.id);
            if (!p) {
              if (visible(byId.get(e.source)) || visible(byId.get(e.target)))
                issues.push(`Missing visible edge: ${e.id}`);
              continue;
            }
            const length = p.getTotalLength();
            for (const [actual, expected] of [
              [p.getPointAtLength(0), point(byId.get(e.source), e.sourceHandle)],
              [p.getPointAtLength(length), point(byId.get(e.target), e.targetHandle)],
            ]) {
              if (Math.hypot(actual.x - expected.x, actual.y - expected.y) > 6) issues.push(`Endpoint: ${e.id}`);
            }
            const swatch = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            swatch.style.stroke = e.data.lineColor;
            if (p.style.stroke !== swatch.style.stroke) issues.push(`Color: ${e.id}`);
          }
          for (const n of nodes) {
            const el = document.querySelector(`.svelte-flow__node[data-id="${n.id}"]`);
            if (!el) continue;
            if (Math.abs(el.offsetWidth - n.width) > 1 || Math.abs(el.offsetHeight - n.height) > 1)
              issues.push(`Size: ${n.id}`);
            if (n.type === 'book' && el.querySelector('a').getAttribute('href') !== n.data.link)
              issues.push(`Link: ${n.id}`);
          }
          const labels = [...document.querySelectorAll('.svelte-flow__edge-label')]
            .map((el) => el.textContent.trim())
            .sort();
          const expectedLabels = edges
            .filter((e) => e.label && document.getElementById(e.id))
            .map((e) => e.label)
            .sort();
          if (JSON.stringify(labels) !== JSON.stringify(expectedLabels)) issues.push('Rendered edge labels differ');
          return issues;
        }, model);
        assert.deepEqual(failures, []);
        assert.equal(
          await page.locator('.svelte-flow__minimap-node').count(),
          model.nodes.length,
          'Minimap must retain the whole graph'
        );
      };

      await step('initial view, graph geometry, fallback and production boundary', async () => {
        await inView(page, ['d_start']);
        assert.equal(
          await page.locator('[aria-label="Flowchart as a list"] section').count(),
          model.nodes.length - books.length
        );
        await rendering();
        await movingPulse();
        if (!values.dev) {
          assert.equal(await page.locator('.dev-toolbar').count(), 0);
          const response = await context.request.get(`${values['base-url']}/api/flowchart-positions.json`);
          assert(response.status() >= 400, 'Production must not expose position authoring');
        }
        await screenshot('initial');
      });
      if (values.dev) {
        await step('authoring drag, discard and isolated save/reset requests', async () => {
          await search.fill('Cradle');
          const node = page.locator(nodeSelector('d_start'));
          const original = await node.evaluate((el) => {
            const m = new DOMMatrix(getComputedStyle(el).transform);
            return { x: m.e, y: m.f };
          });
          const box = await node.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 40, { steps: 10 });
          await page.mouse.up();
          const dragged = await node.evaluate((el) => {
            const m = new DOMMatrix(getComputedStyle(el).transform);
            return { x: m.e, y: m.f };
          });
          assert(Math.hypot(dragged.x - original.x, dragged.y - original.y) > 20);
          await button('Discard unsaved drags and revert to last saved positions').click();
          await page.waitForFunction(
            ({ selector, original }) => {
              const m = new DOMMatrix(getComputedStyle(document.querySelector(selector)).transform);
              return Math.hypot(m.e - original.x, m.f - original.y) < 0.01;
            },
            { selector: nodeSelector('d_start'), original }
          );
          const authoredRequests = [];
          await page.route('**/api/flowchart-positions.json', async (route) => {
            authoredRequests.push(route.request().postDataJSON());
            await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
          });
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 40, { steps: 10 });
          await page.mouse.up();
          const savedResponse = page.waitForResponse((res) => res.url().endsWith('/api/flowchart-positions.json'));
          await button('Save current node positions to disk').click();
          await savedResponse;
          const saved = authoredRequests[0];
          assert.equal(saved.refine, false);
          assert.deepEqual(Object.keys(saved.positions).sort(), model.nodes.map((n) => n.id).sort());
          for (const n of model.nodes) {
            const expected = n.id === 'd_start' ? dragged : n.position;
            assert(Math.hypot(saved.positions[n.id].x - expected.x, saved.positions[n.id].y - expected.y) < 0.01);
          }
          await clear();
          page.once('dialog', (dialog) => dialog.accept());
          const resetResponse = page.waitForResponse((res) => res.url().endsWith('/api/flowchart-positions.json'));
          const resetNavigation = page.waitForEvent('domcontentloaded');
          await button('Wipe the positions cache and re-run the full layout pipeline from scratch').click();
          await resetResponse;
          await resetNavigation;
          await page.locator(nodeSelector('d_start')).waitFor();
          assert.deepEqual(authoredRequests[1], { reset: true });
          await page.unroute('**/api/flowchart-positions.json');
        });
        assert.deepEqual(row.errors, [], 'Unexpected browser runtime errors');
        row.status = 'passed';
        continue;
      }
      await step('title, multi-word, case, decision, edge and empty search; keyboard', async () => {
        for (const query of [
          'Cradle',
          'DUNGEON CRAWLER',
          'die without stats',
          String(model.edges.find((e) => e.label?.length > 15).label),
          'zzzz-no-such-title',
        ]) {
          await search.fill(query);
          const tokens = query.toLowerCase().split(/\s+/);
          const ids = model.nodes
            .filter((n) => tokens.every((t) => n.data.searchHaystack.includes(t)))
            .map((n) => n.id);
          const matchingEdges = model.edges.filter(
            (e) =>
              tokens.every((t) => e.data.searchHaystack.includes(t)) ||
              (ids.includes(e.source) && ids.includes(e.target))
          );
          if (ids.length + matchingEdges.length) {
            assert.match(
              await button('Zoom to show all matched books').innerText(),
              new RegExp(`^${books.filter((n) => ids.includes(n.id)).length} books?`)
            );
            await page.waitForFunction(
              ({ ids }) =>
                [...document.querySelectorAll('.svelte-flow__node')].every((el) => {
                  const content = el.querySelector('.book-node,.decision-node');
                  const opacity = Number(getComputedStyle(el).opacity) * Number(getComputedStyle(content).opacity);
                  return Math.abs(opacity - (ids.includes(el.dataset.id) ? 1 : 0.2)) < 0.01;
                }),
              { ids }
            );
            const litEdges = await page
              .locator('.svelte-flow__edge-path:not(.flowchart-dim)')
              .evaluateAll((els) => els.map((el) => el.id));
            assert(
              litEdges.every((id) => matchingEdges.some((edge) => edge.id === id)),
              'Unexpected undimmed edge'
            );
          } else {
            await page.getByText('No matches', { exact: true }).waitFor();
            assert.equal(await page.locator('.flowchart-dim').count(), 0);
          }
          await clear();
        }
        await search.blur();
        await page.keyboard.press('/');
        assert(await search.evaluate((el) => el === document.activeElement));
        await search.fill('Cradle');
        await page.keyboard.press('Escape');
        assert.equal(await search.inputValue(), '');
        assert.equal(await search.evaluate((el) => el === document.activeElement), false);
      });
      await step('offscreen single fit, decoded cover, hover, keyboard link', async () => {
        await fit(distantBook.data.title, [distantBook.id]);
        await clear();
        await fit(book.data.title, [book.id]);
        const link = page.locator(nodeSelector(book.id)).getByRole('link');
        await link.focus();
        assert(await link.evaluate((el) => el === document.activeElement));
        await link.hover();
        if (!mobile)
          assert.equal(
            await page
              .locator(`${nodeSelector(book.id)} .fancy_card`)
              .evaluate((el) => el.style.getPropertyValue('--o')),
            '1'
          );
        await screenshot('single-fit');
        assert.equal(await link.getAttribute('href'), book.data.link);
        await clear();
      });
      await step('distant multiple results and fit below mobile minimum', async () => {
        const ids = books.filter((n) => n.data.searchHaystack.includes('a')).map((n) => n.id);
        assert(ids.length > 20);
        await fit('a', ids);
        if (mobile) assert((await transform(page)).zoom < 0.12);
        await screenshot('multi-fit');
        await clear();
      });
      await step('whole-graph fit, zoom, pan, minimap, resize and revisit', async () => {
        await button('Fit View').click();
        await sleep(500);
        await rendering();
        let previous = await transform(page);
        await button('Zoom In').click();
        await sleep(350);
        assert((await transform(page)).zoom > previous.zoom);
        previous = await transform(page);
        await button('Zoom Out').click();
        await sleep(350);
        assert((await transform(page)).zoom < previous.zoom);
        const box = await page.locator('.svelte-flow__pane').boundingBox();
        previous = await transform(page);
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 12 });
        await page.mouse.up();
        assert.notDeepEqual(await transform(page), previous);
        if (!mobile) {
          previous = await transform(page);
          const map = await page.locator('.svelte-flow__minimap-svg').boundingBox();
          await page.mouse.move(map.x + 100, map.y + 75);
          await page.mouse.down();
          await page.mouse.move(map.x + 130, map.y + 95, { steps: 10 });
          await page.mouse.up();
          await sleep(300);
          assert.notDeepEqual(await transform(page), previous);
        } else assert.equal(await page.locator('.svelte-flow__minimap-svg').isVisible(), false);
        await page.setViewportSize(mobile ? { width: 823, height: 412 } : { width: 1100, height: 800 });
        await fit(book.data.title, [book.id]);
        await clear();
        await page.setViewportSize(mobile ? { width: 412, height: 823 } : { width: 1350, height: 940 });
        for (let i = 0; i < 2; i++) {
          await fit(
            'a',
            books.filter((n) => n.data.searchHaystack.includes('a')).map((n) => n.id)
          );
          await clear();
          await fit('Cradle', [book.id]);
          await clear();
        }
        await rendering();
        await movingPulse();
        const observers = await page.evaluate(() =>
          Object.fromEntries(
            Object.entries(window.__observedTargets).map(([name, subscriptions]) => {
              const targets = [...subscriptions.values()].flatMap((set) => [...set]);
              return [name, { count: targets.length, detached: targets.filter((el) => !el.isConnected).length }];
            })
          )
        );
        for (const observer of Object.values(observers)) {
          assert.equal(observer.detached, 0);
          assert(observer.count <= (await page.locator('.svelte-flow__node').count()) + 10);
        }
        row.observers = observers;
      });
      if (mobile)
        await step('touch tap and Chromium protocol pan/pinch', async () => {
          await ready();
          await page.getByRole('button', { name: 'Start Here — click to start quiz', exact: true }).tap();
          await page.getByRole('region', { name: 'Quiz choices' }).waitFor();
          await button('Exit quiz mode').tap();
          if (browserName === 'chromium') {
            const cdp = await context.newCDPSession(page);
            const box = await page.locator('.svelte-flow__pane').boundingBox();
            const x = box.x + box.width * 0.45,
              y = box.y + box.height * 0.55;
            const before = await transform(page);
            const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
            await touch('touchStart', [{ x, y, id: 0 }]);
            for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: x + i * 8, y: y + i * 5, id: 0 }]);
            await touch('touchEnd', []);
            assert.notDeepEqual(await transform(page), before);
            const z = (await transform(page)).zoom;
            await touch('touchStart', [
              { x: x - 25, y, id: 0 },
              { x: x + 25, y, id: 1 },
            ]);
            for (let i = 1; i <= 8; i++)
              await touch('touchMove', [
                { x: x - 25 - i * 6, y, id: 0 },
                { x: x + 25 + i * 6, y, id: 1 },
              ]);
            await touch('touchEnd', []);
            assert((await transform(page)).zoom > z);
            await cdp.detach();
          } else
            row.touchLimit =
              'WebKit touch taps; Playwright has no public WebKit multi-touch gesture API. No physical device.';
        });
      const walk = async (ids) => {
        for (let i = 0; i < ids.length - 1; i++) {
          const current = model.nodes.find((n) => n.id === ids[i]);
          assert.equal(await page.locator('.quiz-hud__question').innerText(), current.data.prompt);
          const outgoing = model.edges.filter((e) => e.source === current.id);
          assert.deepEqual(
            await page.locator('.quiz-hud__choice').allTextContents(),
            outgoing.map((e) => e.label ?? '→')
          );
          const edge = outgoing.find((e) => e.target === ids[i + 1]);
          await page
            .locator('.quiz-hud')
            .getByRole('button', { name: edge.label ?? edge.id, exact: true })
            .click();
          await sleep(1500);
          const rendered = page.locator(`path[id="${edge.id}"]`);
          if (await rendered.count()) assert.match(await rendered.getAttribute('class'), /quiz-trail/);
        }
        await page.getByRole('dialog', { name: 'Book recommendation result' }).waitFor();
        assert.equal(await page.locator('.quiz-result__title').innerText(), book.data.title);
        assert.equal(await page.getByRole('link', { name: 'View Review →' }).getAttribute('href'), book.data.link);
        await inView(page, [book.id]);
        await coversDecoded(page, [book.id]);
      };
      await step('quiz root, choices, trail, completion, back, restart, exit and re-entry', async () => {
        await ready();
        await page.getByRole('button', { name: 'Start Here — click to start quiz', exact: true }).click();
        await walk(quizPath);
        await screenshot('quiz-result');
        await button('← Back').click();
        await sleep(1500);
        assert.equal(new URL(page.url()).searchParams.get('path'), quizPath.slice(0, -1).join(','));
        await walk(quizPath.slice(-2));
        await button('Start Over').click();
        assert.equal(new URL(page.url()).searchParams.get('path'), 'd_start');
        await button('Exit quiz mode').click();
        assert.equal(new URL(page.url()).searchParams.has('path'), false);
        assert.equal(await page.locator('.quiz-trail').count(), 0);
        await ready(`?path=${quizPath[1]}`);
        await page.getByRole('region', { name: 'Quiz choices' }).waitFor();
        await sleep(1500);
        await button('Exit quiz mode').click();
        const second = model.nodes.find((n) => n.id === quizPath[1]);
        await page.getByRole('button', { name: `Start quiz from: ${second.data.prompt}`, exact: true }).click();
        await walk(quizPath.slice(1));
        await button('Explore Map').click();
        await fit('Cradle', [book.id]);
        await clear();
      });
      await step('valid, partial-invalid, unknown and nonadjacent deep links', async () => {
        for (const ids of [quizPath, ['unknown', ...quizPath], ['d_start', book.id]]) {
          await ready(`?path=${encodeURIComponent(ids.join(','))}`);
          await page.getByRole('dialog', { name: 'Book recommendation result' }).waitFor();
          await sleep(1500);
          await inView(page, [book.id]);
          await coversDecoded(page, [book.id]);
          assert.equal(await page.locator('.quiz-result__title').innerText(), book.data.title);
          await button('Explore Map').click();
          await fit('Cradle', [book.id]);
          await clear();
        }
        await ready('?path=unknown,also_unknown');
        await sleep(1200);
        assert.equal(await page.locator('.quiz-hud,.quiz-result').count(), 0);
        await search.waitFor();
      });
      await step('delayed and failed cover geometry; distant revisit', async () => {
        let releaseCover;
        const coverGate = new Promise((resolve) => {
          releaseCover = resolve;
        });
        await page.route(`**${book.data.cover.src}`, async (route) => {
          await coverGate;
          await route.continue();
        });
        await ready();
        await search.fill('Cradle');
        await button('Zoom to show all matched books').click();
        await sleep(900);
        await rendering();
        // WebKit's fonts.ready can wait for load, which the held image prevents.
        const previousFontWait = process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
        process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
        try {
          await screenshot('cover-in-flight');
        } finally {
          if (previousFontWait === undefined) delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
          else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = previousFontWait;
        }
        assert.equal(await page.locator(`${nodeSelector(book.id)} img`).evaluate((img) => img.naturalWidth), 0);
        releaseCover();
        await coversDecoded(page, [book.id]);
        await screenshot('cover-loaded');
        await clear();
        await page.unroute(`**${book.data.cover.src}`);
        await page.route(`**${book.data.cover.src}`, (route) => route.abort());
        await ready(`?path=${encodeURIComponent(quizPath.join(','))}`);
        await page.getByRole('dialog', { name: 'Book recommendation result' }).waitFor();
        await sleep(1600);
        await inView(page, [book.id]);
        await rendering();
        assert.equal(await page.locator(`${nodeSelector(book.id)} img`).evaluate((img) => img.naturalWidth), 0);
        await button('Explore Map').click();
        await fit(
          'a',
          books.filter((n) => n.data.searchHaystack.includes('a') && n.id !== book.id).map((n) => n.id)
        );
        await clear();
        await page.unroute(`**${book.data.cover.src}`);
        await ready();
        await fit('Cradle', [book.id]);
        await clear();
      });
      assert.deepEqual(row.errors, [], 'Unexpected browser runtime errors');
      row.status = 'passed';
    } catch (error) {
      row.status = 'failed';
      row.failedStep = currentStep;
      row.failure = String(error.stack ?? error);
      process.exitCode = 1;
      console.error(`${prefix}: ${currentStep}: ${error}`);
      if (page) await screenshot('failure').catch(() => {});
    } finally {
      await browser?.close();
      await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    }
  }
}
