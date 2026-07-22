# Plan Template

Copy this file to `docs/plans/YYYY-MM-DD-<slug>.md` when starting a new feature.
Replace all `<angle bracket>` placeholders. Delete sections that don't apply.

---

# <Feature name>

**Date:** YYYY-MM-DD
**Status:** Draft | In Progress | Done

## Goal

One sentence: what will be true when this feature is complete?

## Context

- Which section of the site is affected? (reviews, blogs, tutorials, artists, flowchart, layout, …)
- Are there existing components or patterns to reuse?
- Any constraints or non-goals?

## Affected files

List every file to be created (`+`) or modified (`~`). Be specific — use exact paths.

```
+ src/pages/example/index.astro
~ src/content.config.ts
~ src/components/islands/ReviewsExplorer.svelte
+ src/lib/stores/newStore.svelte.ts
```

## Tasks

Ordered implementation steps. Each task must name its file target.

- [ ] 1. <Task description> (`<file path>`)
- [ ] 2. <Task description> (`<file path>`)
- [ ] 3. <Task description> (`<file path>`)

## Verification

### Static analysis

```bash
astro check
npm run build
```

Expected: no errors, no warnings.

### Visual review (browser-tester)

Pages to check:
- `http://localhost:4321/<path>` — <what to look for>
- `http://localhost:4321/kitchensink/` — no regressions in existing components

### Manual checks

- [ ] <Anything that must be verified by hand, e.g. "filter chips update URL params">
- [ ] <Edge case to test, e.g. "empty search returns 'No results' message">

## Architectural decision (ADR)

If a non-obvious tradeoff was made, record it here and append to `docs/DECISIONS.md`.

**Decision:** <what was chosen>
**Why:** <rationale>
**Consequences:** <what this means going forward>

If no ADR needed: write "None."
