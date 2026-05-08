# Feature Plans

All non-trivial feature plans live here. The `ship-feature` skill writes a plan
before building anything; you can also create plans manually.

## Naming convention

```
docs/plans/YYYY-MM-DD-short-slug.md
```

Example: `docs/plans/2026-05-08-reviews-export.md`

## Plan template

See `.claude/skills/ship-feature/references/plan-template.md` for the canonical
template. At minimum a plan should contain:

- **Goal** — one sentence: what will be true when this is done?
- **Context** — what parts of the codebase are involved?
- **Tasks** — ordered steps with explicit file targets
- **Verification** — how to confirm the feature is correct (type-check, build, visual)
- **ADR** — any architectural decision to record in `docs/DECISIONS.md`
