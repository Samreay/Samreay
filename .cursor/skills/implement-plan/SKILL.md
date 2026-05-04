---
name: implement-plan
description: Drive the Hugo→Astro migration phase by phase. Read each `plans/N-*.md`, implement the work, run the matching `verify.py --phase N` gate (URL parity, structural HTML diff vs Hugo, CSS audit, Playwright visual diff, behavioural smoke), and refuse to advance until that gate passes. Use when the user asks to start, continue, resume, or finish the migration; to implement a specific phase; or to verify a phase that was implemented in a previous session.
---

# Implement-plan: phased migration with side-by-side verification

This skill drives a **single long auto-looping session** that walks through `plans/0-overview.md` → `plans/14-cutover.md`. Hugo stays the source of truth until Phase 14, so most checks compare Astro's `dist/` against Hugo's `public/`.

Read [`references/gates-by-phase.md`](references/gates-by-phase.md) for the full table of what each phase verifies. Read [`references/html-normalization.md`](references/html-normalization.md) before debugging any structural diff. Read [`references/visual-diff-policy.md`](references/visual-diff-policy.md) before regenerating any baseline.

## The loop

For each phase N starting at the current cursor:

1. **Read state.** Open `state/cursor.json`. If absent, start at phase 1. Confirm `state/phase-(N-1)-passed.json` exists (skip this check for N=1). If it doesn't, refuse to start phase N — go back and finish the predecessor first.
2. **Read the plan.** Open `plans/N-*.md` and read every section (Tasks, Files added, Files unchanged, Acceptance criteria, Out of scope).
   - Then **read every skill listed in that plan's "Skills to load before starting" section** before writing any code. Every phase calls out [`astro-best-practices`](../astro-best-practices/SKILL.md); phases 8 and 9 also require [`svelte-best-practices`](../svelte-best-practices/SKILL.md). When a plan lists a skill, read its `SKILL.md` from end to end, plus any of its `references/*.md` files that match the work you're about to do.
3. **Implement.** Touch only the files that the plan's "Files added" / "Files being ported" sections cover. If you have to touch anything outside that allowlist, mention it explicitly to the user before doing so.
4. **Verify.** Run:
   ```bash
   make verify-phase-N
   ```
   This is a wrapper around `uv run .cursor/skills/implement-plan/scripts/verify.py --phase N`. It writes a structured report to `state/phase-N-report.json` and prints a human summary.
5. **Triage failures.** Each failed check has a `severity`:
   - `must_match` failures block advancement. Fix and re-run `make verify-phase-N`.
   - `should_match` failures print as warnings. Decide whether the divergence is intentional (e.g. Astro emits a different srcset) and either fix or document the exception in `scripts/phases/phase_N.py`.
   - `expected_to_differ` failures are silently dropped — they exist only to record known divergences in the source.
6. **Gate.** Once all `must_match` checks pass, `verify.py` writes `state/phase-N-passed.json` containing the git rev, URL counts, build hashes, and timestamp.
7. **Pause.** Use the `AskQuestion` tool to ask the user whether to advance to phase N+1, retry phase N (e.g. for additional polish), or stop the session. Do not auto-advance.
8. **Loop.** On "advance", update `state/cursor.json` to N+1 and go back to step 1.

## First-run setup

Before phase 1, run once:

```bash
make implement-plan-setup       # installs Playwright + chromium under the skill
npm install                     # restores Hugo's existing JS deps (alpine, aos, etc.)
```

Then confirm the **prerequisites** for the universal `hugo_builds` gate:

1. **Hugo 0.134.1 extended** is on PATH (matches `.github/workflows/gh-pages.yml`). Check `hugo version` reports `0.134.1` and `+extended`. Install via:
   ```bash
   curl -fsSL -o /tmp/hugo.tar.gz \
     https://github.com/gohugoio/hugo/releases/download/v0.134.1/hugo_extended_0.134.1_darwin-universal.tar.gz
   tar -xzf /tmp/hugo.tar.gz hugo && mv hugo /opt/homebrew/bin/hugo
   ```
   Phase 13 swaps the workflow to Astro and retires Hugo entirely; until then, keep this version pinned to match CI.
2. **`resize.py` runs cleanly**: `uv run python resize.py` should exit 0. If it reports `Missing N covers in YAML` or `Missing N files`, the artists data has drifted — use the [`find-artists`](../find-artists/SKILL.md) skill (Part Three) to reconcile before starting Phase 1.

The `verify.py` script automatically runs `resize.py && hugo` for the `hugo_builds` gate, so any drift in `data/artists.yml` will surface there too.

## Universal gates (every phase)

These run at the top of every `verify.py --phase N` invocation regardless of N:

- `hugo --gc --minify` exits 0 (Hugo build still produces `public/`).
- `npm run build` exits 0 (Astro build produces `dist/`). Skipped for phase 1 only if Astro hasn't been initialised yet.
- `npx astro check` exits 0. Skipped for phase 1.
- Files modified between `state/phase-(N-1)-passed.json`'s git rev and `HEAD` are all inside the phase's allowlist (warning only, not blocking).

## How to add a new check

Each phase has a Python module in `scripts/phases/phase_N.py` exporting a `CHECKS: list[Check]`. A `Check` is a small dataclass:

```python
@dataclass
class Check:
    name: str
    severity: Severity              # 'must_match' | 'should_match' | 'expected_to_differ'
    run: Callable[[Context], CheckResult]
```

The `Context` carries paths to `public/`, `dist/`, and the parsed `phase-(N-1)-passed.json`. Add a check by writing a small function and appending it to `CHECKS`.

## What to do when verify fails after implementation looks correct

1. Re-run `hugo --gc --minify && npm run build` cleanly to make sure both outputs are fresh. Stale `public/` is the most common false positive.
2. For structural HTML diffs, run with `--keep-normalized` to inspect the normalized inputs side-by-side under `state/diffs/phase-N/`.
3. For visual diffs, open `.cursor/skills/implement-plan/scripts/visual/test-results/` and inspect the `actual.png`, `expected.png`, and `diff.png` triplet.
4. If a divergence is intentional (e.g. Astro's content-hash is different — that's normalized away, but a new srcset format isn't), downgrade the check's severity in `scripts/phases/phase_N.py` from `must_match` to `should_match` and document why in a comment.

## Anti-patterns to refuse

- Skipping `verify-phase-N` and writing `state/phase-N-passed.json` by hand. Don't.
- Touching the previous phase's gate file. Once written, gates are immutable.
- Implementing two phases in one PR. Each phase is one verifiable unit.
- Editing baselines without running `make implement-plan-update-baselines` and reviewing the resulting PNG diffs.
- Using `client:load` to "make a Svelte test pass". The plan specifies the right hydration directive per island.

## Files in this skill

```
.cursor/skills/implement-plan/
├── SKILL.md                     # this file
├── references/
│   ├── gates-by-phase.md        # full per-phase check inventory
│   ├── html-normalization.md    # rules applied before structural diff
│   └── visual-diff-policy.md    # thresholds, ignore regions, baseline workflow
├── scripts/
│   ├── verify.py                # entry point
│   ├── lib/                     # shared check infrastructure
│   ├── phases/                  # phase_N.py modules; one per phase
│   ├── collection_counts.mjs    # node bridge to astro:content
│   └── visual/                  # Playwright project (own package.json)
│       ├── playwright.config.ts
│       ├── compare.spec.ts
│       ├── routes.json          # route lists per phase
│       └── baselines/           # committed PNG goldens (per route, per viewport)
└── state/                       # gate files + cursor; gitignored output dirs
```

The skill is deliberately self-contained. Its `scripts/visual/package.json` is separate from the project's `package.json` so the migration's dependency tree is not coupled to Playwright.
