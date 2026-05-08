# cosmiccoding.com.au — Claude Code Guide

**Stack:** Astro v5 (static) · Svelte 5 islands · Tailwind v4 · TypeScript strict · MDX · GitHub Pages

```
make blog          # local dev server (astro dev)
make prod          # clean build → dist/
astro check        # TypeScript + svelte-check
npm run build      # production build
npm run preview    # serve dist/ locally on :4321
```

## Agents

Specialist sub-agents live in `.claude/agents/`. Invoke them by name in any task
or let the orchestrating `ship-feature` skill choose the right one automatically.

| Agent | Purpose |
|---|---|
| [astro-dev](.claude/agents/astro-dev.md) | Routing, content collections, layouts, MDX, images, integrations |
| [svelte-dev](.claude/agents/svelte-dev.md) | Svelte 5 islands, runes, reactive stores, Astro↔Svelte boundary |
| [browser-tester](.claude/agents/browser-tester.md) | Visual & E2E tests via Playwright MCP, screenshot review |

## Skills

Invoke any skill with `/skill-name` or describe the task and Claude will pick the right one.

| Skill | Trigger |
|---|---|
| [ship-feature](.claude/skills/ship-feature/SKILL.md) | "ship X", "implement X", "build X end-to-end" |
| [astro-best-practices](.claude/skills/astro-best-practices/SKILL.md) | Authoring `.astro` files, content collections, routing |
| [svelte-best-practices](.claude/skills/svelte-best-practices/SKILL.md) | Authoring `.svelte` / `.svelte.ts` files |
| [book-review](.claude/skills/book-review/SKILL.md) | Scaffold a new book review |
| [find-artists](.claude/skills/find-artists/SKILL.md) | Refresh cover artist data from Reddit |
| [humanizer](.claude/skills/humanizer/SKILL.md) | Remove AI-writing patterns from text |
| [parse-flowchart](.claude/skills/parse-flowchart/SKILL.md) | Translate Figma flowchart image → `flowchart.ts` |
| [sync-review-voice](.claude/skills/sync-review-voice/SKILL.md) | Recalibrate humanizer voice from review corpus |

## Plans

All feature plans live in [docs/plans/](docs/plans/). The `ship-feature` skill
writes the plan there before building. See [docs/plans/README.md](docs/plans/README.md)
for naming conventions and the plan template.

## Architectural Decisions

Non-obvious design choices are recorded in [docs/DECISIONS.md](docs/DECISIONS.md).
Consult it before proposing alternatives to established patterns. Add to it when
a significant tradeoff is made that isn't obvious from the code.

## Testing

See [docs/testing.md](docs/testing.md) for the full testing strategy (Playwright
E2E via the `browser-tester` agent, `astro check` for type safety, visual review
via screenshots).

## Key rules (never violate)

- **Zero JS by default.** Render in `.astro`; reach for Svelte only for real interactivity.
- **Svelte 5 runes only.** No `export let`, `$:`, `on:event`, or `createEventDispatcher`.
- **Content collections for all structured content.** Zod schema required.
- **`astro check && npm run build` must pass** before any feature is declared done.
- **`<Image />` / `<Picture />` for all images in `src/`.** No manual `<img>` tags.
- **Tailwind v4 via `@tailwindcss/vite`.** Never `@astrojs/tailwind`.
- **Plans in `docs/plans/`.** All non-trivial work gets a plan file.
- **ADRs in `docs/DECISIONS.md`.** Record significant tradeoffs when you make them.
