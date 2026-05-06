"""Phase 8 — Reviews explorer Svelte island.

See plans/8-reviews-explorer.md and references/gates-by-phase.md.

The interactive checks (tier filter, search, combined) live in the Playwright
spec because they require a browser to drive the Svelte island. We aggregate
the spec results under one `reviews_interactive` check; individual failures
appear in the spec output.

The plan's `tier_filter_clicks` check refers to clicking *tier* buttons,
but the explorer doesn't expose tier-letter buttons directly — the tier
view is a layout, not a filter. The Phase 8 plan's intent (filter narrows
visible card count) is covered here by `reviews tag filter narrows results`
in the Playwright spec.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.collections import count_markdown_files  # noqa: E402
from lib.types import Check, CheckResult, Context  # noqa: E402
from lib.visual import run_visual_for_phase  # noqa: E402


def _check_reviews_index_loads(ctx: Context) -> CheckResult:
    p = ctx.dist_dir / "reviews" / "index.html"
    if p.is_file() and p.stat().st_size > 1000:
        return CheckResult(
            name="reviews_index_loads",
            severity="must_match",
            passed=True,
            detail=f"dist/reviews/index.html present ({p.stat().st_size:,} bytes)",
        )
    return CheckResult(
        name="reviews_index_loads",
        severity="must_match",
        passed=False,
        detail="dist/reviews/index.html missing or empty",
    )


def _check_ssr_renders_full_list(ctx: Context) -> CheckResult:
    """The Svelte island runs in SSR mode (`client:load` includes server
    render of the initial HTML). Every review card should appear in the
    raw HTML so search engines and users with JS disabled see the full
    list. We assert ``data-review-card`` count == on-disk review count.
    """
    p = ctx.dist_dir / "reviews" / "index.html"
    if not p.is_file():
        return CheckResult(
            name="ssr_renders_full_list",
            severity="must_match",
            passed=False,
            detail="dist/reviews/index.html missing",
        )
    html = p.read_text(encoding="utf-8", errors="ignore")
    rendered_cards = html.count("data-review-card")
    expected = count_markdown_files(ctx.repo_root / "content", "reviews")
    if rendered_cards == expected and expected > 0:
        return CheckResult(
            name="ssr_renders_full_list",
            severity="must_match",
            passed=True,
            detail=f"{rendered_cards} review cards in SSR HTML (matches disk)",
        )
    return CheckResult(
        name="ssr_renders_full_list",
        severity="must_match",
        passed=False,
        detail=f"SSR rendered {rendered_cards} cards, disk has {expected}",
    )


def _check_reviews_interactive(ctx: Context) -> CheckResult:
    """Run the Playwright `@phase-8` suite — covers visual baseline,
    tag/search/combined interactive filters, and the no-JS SSR fallback.
    """
    result = run_visual_for_phase(
        ctx.repo_root, ctx.phase, update_baselines=ctx.update_baselines
    )
    if result.succeeded:
        return CheckResult(
            name="reviews_interactive",
            severity="must_match",
            passed=True,
            detail=(
                "playwright @phase-8 suite passed"
                + (" (baseline bootstrapped)" if result.bootstrapped else "")
            ),
        )
    return CheckResult(
        name="reviews_interactive",
        severity="must_match",
        passed=False,
        detail=(
            "playwright @phase-8 suite failed — inspect "
            "scripts/visual/test-results/ for the failing spec output"
        ),
        diff=(result.stderr or result.stdout)[-3000:],
    )


CHECKS: list[Check] = [
    Check(
        name="reviews_index_loads",
        severity="must_match",
        run=_check_reviews_index_loads,
    ),
    Check(
        name="ssr_renders_full_list",
        severity="must_match",
        run=_check_ssr_renders_full_list,
    ),
    Check(
        name="reviews_interactive",
        severity="must_match",
        run=_check_reviews_interactive,
    ),
]
