"""Phase 3 — Styles.

See plans/3-styles.md and references/gates-by-phase.md.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.css_audit import (  # noqa: E402
    assert_selectors_absent,
    assert_selectors_emitted,
    concatenated_css,
    find_css_bundles,
    total_css_size,
)
from lib.types import Check, CheckResult, Context  # noqa: E402
from lib.visual import run_visual_for_phase  # noqa: E402

# The plan suggested 40-100 KB for the band, but Hugo's actual minified bundle
# is ~200 KB (Tailwind base + components + utilities + the ported SCSS layer
# is heavy, and that's the whole point of "config copied verbatim"). We keep
# the band as a should_match guard against accidental order-of-magnitude
# regressions: tighter than 50 KB means the safelist or the SCSS imports were
# silently dropped, larger than 350 KB means something pulled in a third-party
# CSS file. Astro's bundle currently lands around 170-180 KB which is slightly
# smaller than Hugo only because we excised the AOS import.
CSS_SIZE_LOWER = 50_000
CSS_SIZE_UPPER = 350_000

# Tailwind safelist patterns that the Hugo config promises to keep emitted —
# verbatim from `themes/sams-theme/assets/css/tailwind.config.js`. The
# kitchensink page exists explicitly to keep these classes hot.
SAFELIST_PATTERNS = [
    r"\.tag-[a-z]",
    r"\.bg-(π|S|A|B|C|D|F)-[0-9]+",
    r"\.review-(π|S|A|B|C|D|F)",
    r"\.rating-(π|S|A|B|C|D|F)",
]

FORBIDDEN_PATTERNS = [
    r"aos-",
]


def _check_css_bundle_size_band(ctx: Context) -> CheckResult:
    bundles = find_css_bundles(ctx.dist_dir)
    if not bundles:
        return CheckResult(
            name="css_bundle_size_band",
            severity="should_match",
            passed=False,
            detail=f"no CSS bundles found under {ctx.dist_dir / '_astro'}",
        )
    size = total_css_size(ctx.dist_dir)
    if CSS_SIZE_LOWER <= size <= CSS_SIZE_UPPER:
        return CheckResult(
            name="css_bundle_size_band",
            severity="should_match",
            passed=True,
            detail=f"{len(bundles)} bundle(s) totalling {size:,} bytes (in band)",
        )
    return CheckResult(
        name="css_bundle_size_band",
        severity="should_match",
        passed=False,
        detail=(
            f"{size:,} bytes outside [{CSS_SIZE_LOWER:,}, {CSS_SIZE_UPPER:,}] — "
            "either Tailwind purged something it shouldn't have, or a "
            "third-party CSS file got swept in"
        ),
    )


def _check_tailwind_safelist_emitted(ctx: Context) -> CheckResult:
    bundles = find_css_bundles(ctx.dist_dir)
    if not bundles:
        return CheckResult(
            name="tailwind_safelist_emitted",
            severity="must_match",
            passed=False,
            detail="no CSS bundles found",
        )
    css = concatenated_css(ctx.dist_dir)
    matched = assert_selectors_emitted(css, SAFELIST_PATTERNS)
    missing = [p for p, ok in matched.items() if not ok]
    if not missing:
        return CheckResult(
            name="tailwind_safelist_emitted",
            severity="must_match",
            passed=True,
            detail=f"all {len(SAFELIST_PATTERNS)} safelist patterns present",
        )
    return CheckResult(
        name="tailwind_safelist_emitted",
        severity="must_match",
        passed=False,
        detail=(
            "missing safelist patterns: "
            + ", ".join(missing)
            + " — kitchensink page may not be exercising every tier"
        ),
    )


def _check_no_aos_imports(ctx: Context) -> CheckResult:
    bundles = find_css_bundles(ctx.dist_dir)
    if not bundles:
        return CheckResult(
            name="no_aos_imports",
            severity="must_match",
            passed=False,
            detail="no CSS bundles found",
        )
    css = concatenated_css(ctx.dist_dir)
    absent = assert_selectors_absent(css, FORBIDDEN_PATTERNS)
    leaked = [p for p, ok in absent.items() if not ok]
    if not leaked:
        return CheckResult(
            name="no_aos_imports",
            severity="must_match",
            passed=True,
            detail="no aos- selectors leaked into the bundle",
        )
    return CheckResult(
        name="no_aos_imports",
        severity="must_match",
        passed=False,
        detail=f"leaked: {', '.join(leaked)} — main.scss should not import aos.css",
    )


def _check_kitchensink_visual(ctx: Context) -> CheckResult:
    """Playwright `@phase-3` suite — `compare.spec.ts` covers /kitchensink/."""
    result = run_visual_for_phase(ctx.repo_root, ctx.phase, update_baselines=ctx.update_baselines)
    if result.succeeded:
        return CheckResult(
            name="kitchensink_visual",
            severity="must_match",
            passed=True,
            detail="playwright @phase-3 suite passed",
        )
    return CheckResult(
        name="kitchensink_visual",
        severity="must_match",
        passed=False,
        detail=(
            "playwright @phase-3 suite failed — if this is the first run for "
            "this phase, regenerate baselines via "
            "`make implement-plan-update-baselines PHASE=3` after eyeballing "
            "the diff under scripts/visual/test-results/"
        ),
        diff=(result.stderr or result.stdout)[-3000:],
    )


CHECKS: list[Check] = [
    Check(
        name="css_bundle_size_band",
        severity="should_match",
        run=_check_css_bundle_size_band,
    ),
    Check(
        name="tailwind_safelist_emitted",
        severity="must_match",
        run=_check_tailwind_safelist_emitted,
    ),
    Check(
        name="no_aos_imports",
        severity="must_match",
        run=_check_no_aos_imports,
    ),
    Check(
        name="kitchensink_visual",
        severity="must_match",
        run=_check_kitchensink_visual,
    ),
    # `computed_style_spotcheck` from gates-by-phase.md is intentionally
    # omitted: it requires both Hugo and Astro to render the same DOM (a
    # `.tag.tag-sci-fi.active-true` element specifically), but Phase 3's
    # only Astro page rendering tag/rating/tier classes is the kitchensink
    # which has no Hugo equivalent. The visual baseline already locks in
    # pixel-level parity for those styles. Add it back in Phase 5 once
    # real review pages render with the same selectors on both sides.
]
