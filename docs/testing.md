# Testing Strategy

This project uses a layered testing approach: **static analysis first, visual
review second, E2E last**. There are no unit tests for static content rendering —
if `astro check` and `npm run build` pass, the static output is correct by
construction (Zod validates all content at build time).

---

## Layer 1 — Static analysis (always run, fast)

```bash
astro check          # TypeScript strict + svelte-check (delegates to svelte-check)
npm run build        # full build; Zod errors, missing images, broken imports all fail here
```

These two commands catch the majority of regressions. Run them before marking any
feature done.

---

## Layer 2 — Visual review via `browser-tester` agent

The `browser-tester` agent (`.claude/agents/browser-tester.md`) mounts the
Playwright MCP server and can:

1. Start the preview server (`npm run preview` after a build).
2. Navigate to any URL and take a screenshot.
3. Interact with interactive widgets (type in search, click filter chips, etc.).
4. Report visual anomalies back to the main conversation using Claude's image
   understanding.

**When to use it:**

- After any change to a layout, component, or global stylesheet.
- After adding a new Svelte island.
- After modifying the flowchart data or positions.
- Whenever the `ship-feature` skill requests a visual sign-off step.

**Key pages to check:**

| Page | What to look for |
|---|---|
| `/` | Hero, featured reviews, section links |
| `/reviews/` | ReviewsExplorer filter chips and search |
| `/reviews/flowchart/` | Flowchart renders, nodes draggable |
| `/artists/` | ArtistsExplorer search and grid |
| `/kitchensink/` | Full visual-regression playground (typography, components, colour swatches) |

**How to invoke:**

In any conversation, mention: "use the browser-tester agent to check the reviews
page" — or the `ship-feature` skill calls it automatically in its verify step.

---

## Layer 3 — Playwright E2E (ad-hoc, not yet in CI)

Playwright (`^1.59.1`) is installed. A `playwright.config.ts` is not yet committed
but can be created for specific test runs.

**Quick config for a one-off test run:**

```typescript
// playwright.config.ts (not committed — create locally as needed)
import { defineConfig } from '@playwright/test';

export default defineConfig({
  webServer: {
    command: 'npm run preview',
    port: 4321,
    reuseExistingServer: !process.env.CI,
  },
  testDir: 'tests',
  use: {
    baseURL: 'http://localhost:4321',
  },
});
```

Always test against the **production build** (`npm run build && npm run preview`),
not the dev server. The dev server uses HMR and may behave differently from the
static output.

**Svelte component tests (Vitest — not yet set up):**

For non-trivial Svelte islands that need unit-level testing:

```bash
npm install -D vitest vitest-browser-svelte @vitest/browser-playwright
```

```typescript
// vite.config.ts (or vitest.config.ts)
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    environment: 'browser',
    browser: { enabled: true, provider: 'playwright', instances: [{ browser: 'chromium' }] },
  },
});
```

At the moment, the Svelte islands are simple enough that `astro check` + visual
review is sufficient. Add Vitest when an island has logic complex enough to warrant
isolated unit testing.

---

## Adding Playwright to CI

When ready to add automated E2E to GitHub Actions:

```yaml
# .github/workflows/e2e.yml
name: E2E
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npx playwright test
```

Record this decision in `docs/DECISIONS.md` as ADR-008 when it's implemented.

---

## Notes on image-based review

The `browser-tester` agent uses Playwright MCP in **snapshot mode** by default
(accessibility tree, no vision). For genuine pixel-level visual comparison — colour
palette, layout alignment, text rendering — it switches to **screenshot mode**
(`browser_take_screenshot`) and passes the image to Claude's image understanding.

This is the primary mechanism for visual regression checking during `ship-feature`
runs. It is not a pixel-diff tool (no baseline images are stored); it is a
sanity-check powered by Claude's visual reasoning.
