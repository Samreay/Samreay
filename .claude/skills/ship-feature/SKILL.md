---
name: ship-feature
description: >
  End-to-end feature implementation orchestrator for cosmiccoding.com.au.
  Researches the codebase, writes a plan to docs/plans/, implements the feature
  using the right specialist agents (astro-dev, svelte-dev), verifies with
  astro check + build + browser-tester visual review, and records any architectural
  decisions in docs/DECISIONS.md. Use when the user says "ship X", "build X",
  "implement X", "add X to the site", or hands you a feature description to execute
  end-to-end.
---

# ship-feature

This skill implements features end-to-end on cosmiccoding.com.au following a
**Research → Plan → Build → Verify** loop.

## Phase 0 — Read context

Before anything else, read:

1. `CLAUDE.md` — project overview, agent/skill index, hard rules.
2. `docs/DECISIONS.md` — established architectural decisions.
3. The relevant portions of the codebase the feature touches (use Explore or Grep).

Do not skip this step. Building without understanding the existing patterns wastes
time on rework.

## Phase 1 — Research

Answer these questions before writing the plan:

- Which files will be created or modified?
- Does this touch content collections? (read `src/content.config.ts`)
- Does this require a Svelte island? (client-side state, browser APIs, filter UI)
- Does this require a new page or layout? (file-based routing in `src/pages/`)
- Does this touch `astro.config.mjs` (new integration, redirect, build config)?
- Are there existing components or patterns to reuse?
- Is there an open question that needs a decision recorded in `docs/DECISIONS.md`?

Use the **Explore** agent for broad codebase searches. Use `Grep` / `Read`
directly for targeted lookups.

## Phase 2 — Write the plan

Write the plan to `docs/plans/YYYY-MM-DD-<slug>.md` using today's date and a
short slug derived from the feature name.

Use the template at [references/plan-template.md](references/plan-template.md).

The plan must include:
- **Goal** — one sentence: what will be true when done?
- **Affected files** — list every file to create or modify
- **Tasks** — ordered, each with an explicit file target
- **Verification** — exact commands to run + what the browser-tester should check
- **ADR** — any decision to record (can be "none")

Show the plan to the user and confirm before proceeding to Phase 3.
If the feature is small (≤3 files, no architectural decisions), you may proceed
without explicit confirmation but state the plan clearly in your response.

## Phase 3 — Build

Implement each task in the plan in order.

### Route tasks to the right agent

| Task involves | Use agent |
|---|---|
| `.astro` files, content collections, `astro.config.mjs`, routing, MDX | `astro-dev` |
| `.svelte` or `.svelte.ts` files, islands, reactive stores | `svelte-dev` |
| Both Astro scaffolding + Svelte island | astro-dev first (scaffold the page + island mount), then svelte-dev (implement the island) |

You may implement straightforward tasks yourself without delegating to a subagent
— delegate when the task is complex or when you want strict best-practice
enforcement via the agent's loaded skills.

### Build rules (always enforced)

- **Zero JS by default.** If it can be `.astro`, it must be.
- **Svelte 5 runes only.** Enforce the anti-patterns from svelte-best-practices.
- **`<Image />` / `<Picture />`** for all images in `src/`.
- **Zod schema** on every new content collection field.
- **TypeScript strict** — no `any`, no skipped types.

### After each significant task

Run a quick sanity check:
```bash
astro check
```
Fix errors before moving to the next task. Do not batch errors across tasks.

## Phase 4 — Verify

### Static analysis (required)

```bash
astro check && npm run build
```

Both must pass with no errors or warnings. If either fails, fix before proceeding.

### Visual review (required for UI changes)

If the feature touches any rendered page:

1. Run `npm run preview` (the build from above).
2. Delegate to the **browser-tester** agent:
   - Standard smoke check (home, reviews, flowchart, artists, kitchensink).
   - Targeted check of the specific page/component added or changed.
3. Review the screenshots. Fix any visual anomalies.

Skip the browser-tester only if the change is purely backend/config with no
rendered output (e.g., adding a redirect rule, changing a Zod schema).

### Completion criteria

- [ ] `astro check` passes
- [ ] `npm run build` passes
- [ ] Visual review passed (or skipped with explicit reason)
- [ ] Plan file exists in `docs/plans/`
- [ ] Any new ADR appended to `docs/DECISIONS.md`

## Phase 5 — Record decisions

If any non-obvious architectural decision was made during the build:

Append to `docs/DECISIONS.md`:

```markdown
## ADR-NNN: Short title

**Context:** Why did this come up?

**Decision:** What was chosen?

**Consequences:** What does this mean going forward?
```

Increment the ADR number from the last entry in the file.

---

## Quick reference

```
Phase 0: Read CLAUDE.md + DECISIONS.md + relevant code
Phase 1: Research — which files? what patterns? what decisions?
Phase 2: Write plan → docs/plans/YYYY-MM-DD-slug.md
Phase 3: Build — astro-dev (Astro) / svelte-dev (Svelte)
Phase 4: Verify — astro check + build + browser-tester screenshots
Phase 5: Record — append ADR to docs/DECISIONS.md if needed
```
