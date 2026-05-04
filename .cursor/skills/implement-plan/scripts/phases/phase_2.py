"""Phase 2 — Layout shell.

See plans/2-layout-shell.md and references/gates-by-phase.md.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.structural_diff import (  # noqa: E402
    diff_html,
    extract_meta_map,
    extract_nav_links,
)
from lib.types import Check, CheckResult, Context  # noqa: E402
from lib.visual import run_visual_for_phase  # noqa: E402

GA_ID = "G-GRX6QE03YR"


def _read_index(root: Path) -> str | None:
    p = root / "index.html"
    if not p.exists():
        return None
    return p.read_text(encoding="utf-8", errors="replace")


def _check_head_meta_parity(ctx: Context) -> CheckResult:
    hugo = _read_index(ctx.public_dir)
    astro = _read_index(ctx.dist_dir)
    if hugo is None or astro is None:
        return CheckResult(
            name="head_meta_parity",
            severity="must_match",
            passed=False,
            detail=f"missing index.html — hugo={hugo is not None}, astro={astro is not None}",
        )
    hugo_meta = extract_meta_map(hugo)
    astro_meta = extract_meta_map(astro)
    only_hugo = sorted(set(hugo_meta) - set(astro_meta))
    only_astro = sorted(set(astro_meta) - set(hugo_meta))
    differing = sorted(
        k for k in set(hugo_meta) & set(astro_meta) if hugo_meta[k] != astro_meta[k]
    )
    if not (only_hugo or only_astro or differing):
        return CheckResult(
            name="head_meta_parity",
            severity="must_match",
            passed=True,
            detail=f"{len(hugo_meta)} meta tags identical",
        )
    parts: list[str] = []
    if only_hugo:
        parts.append("only in hugo: " + ", ".join(only_hugo))
    if only_astro:
        parts.append("only in astro: " + ", ".join(only_astro))
    if differing:
        parts.append("differing values: " + ", ".join(differing))
    return CheckResult(
        name="head_meta_parity",
        severity="must_match",
        passed=False,
        detail=" | ".join(parts),
        diff="\n".join(
            [
                "--- hugo ---",
                *(f"{k} = {hugo_meta[k]}" for k in sorted(hugo_meta)),
                "--- astro ---",
                *(f"{k} = {astro_meta[k]}" for k in sorted(astro_meta)),
            ]
        ),
    )


def _check_nav_link_parity(ctx: Context) -> CheckResult:
    hugo = _read_index(ctx.public_dir)
    astro = _read_index(ctx.dist_dir)
    if hugo is None or astro is None:
        return CheckResult(
            name="nav_link_parity",
            severity="must_match",
            passed=False,
            detail=f"missing index.html — hugo={hugo is not None}, astro={astro is not None}",
        )
    hugo_links = extract_nav_links(hugo)
    astro_links = extract_nav_links(astro)
    if hugo_links == astro_links:
        return CheckResult(
            name="nav_link_parity",
            severity="must_match",
            passed=True,
            detail=f"{len(hugo_links)} nav links match",
        )
    diff_lines = [
        "--- hugo ---",
        *(f"{label!r} -> {href}" for label, href in hugo_links),
        "--- astro ---",
        *(f"{label!r} -> {href}" for label, href in astro_links),
    ]
    return CheckResult(
        name="nav_link_parity",
        severity="must_match",
        passed=False,
        detail=f"hugo={len(hugo_links)} astro={len(astro_links)} links",
        diff="\n".join(diff_lines),
    )


def _check_analytics_prod_present(ctx: Context) -> CheckResult:
    astro = _read_index(ctx.dist_dir)
    if astro is None:
        return CheckResult(
            name="analytics_prod_present",
            severity="must_match",
            passed=False,
            detail="dist/index.html missing",
        )
    if GA_ID in astro:
        return CheckResult(
            name="analytics_prod_present",
            severity="must_match",
            passed=True,
            detail=f"GA tracking id {GA_ID} present in dist/index.html",
        )
    return CheckResult(
        name="analytics_prod_present",
        severity="must_match",
        passed=False,
        detail=f"GA tracking id {GA_ID} not found in dist/index.html",
    )


def _check_analytics_dev_absent(ctx: Context) -> CheckResult:
    """Looks at the source: Analytics.astro should be guarded by import.meta.env.PROD."""
    candidates = list((ctx.repo_root / "src" / "components").rglob("Analytics.astro"))
    if not candidates:
        return CheckResult(
            name="analytics_dev_absent",
            severity="must_match",
            passed=False,
            detail="src/components/Analytics.astro missing",
        )
    text = candidates[0].read_text(encoding="utf-8")
    if "import.meta.env.PROD" not in text:
        return CheckResult(
            name="analytics_dev_absent",
            severity="must_match",
            passed=False,
            detail="Analytics.astro should guard the GA snippet with import.meta.env.PROD",
            diff=text[:1000],
        )
    return CheckResult(
        name="analytics_dev_absent",
        severity="must_match",
        passed=True,
        detail="GA snippet guarded by import.meta.env.PROD",
    )


def _check_base_layout_structure(ctx: Context) -> CheckResult:
    hugo = _read_index(ctx.public_dir)
    astro = _read_index(ctx.dist_dir)
    if hugo is None or astro is None:
        return CheckResult(
            name="base_layout_structure",
            severity="should_match",
            passed=False,
            detail=f"missing index.html — hugo={hugo is not None}, astro={astro is not None}",
        )
    # Both wrappers must appear on the Astro side; on the Hugo side only the
    # outer flex container is required. Hugo's `partials/footer.html` only
    # injects a bundled <script> tag — it never wraps it in a <footer>
    # element — so requiring `<footer` on the Hugo render would always warn.
    # The Astro Footer.astro emits a real <footer> as a forward-looking
    # placeholder for Phase 11 chrome cleanup.
    requirements = [
        ("hugo", hugo, [re.compile(r"flex\s+flex-col\s+min-h-screen")]),
        (
            "astro",
            astro,
            [
                re.compile(r"flex\s+flex-col\s+min-h-screen"),
                re.compile(r"<footer", re.IGNORECASE),
            ],
        ),
    ]
    failures: list[str] = []
    for label, html, patterns in requirements:
        for pattern in patterns:
            if not pattern.search(html):
                failures.append(f"{label} missing /{pattern.pattern}/")
    if failures:
        return CheckResult(
            name="base_layout_structure",
            severity="should_match",
            passed=False,
            detail="; ".join(failures),
        )
    diff = diff_html(
        "index",
        hugo,
        astro,
        keep_normalized=ctx.keep_normalized,
        out_dir=ctx.state_dir / "diffs" / f"phase-{ctx.phase}",
        keep_only=["body"],
        drop_class_attributes=True,
        drop_id_attributes=True,
    )
    if diff.equal:
        return CheckResult(
            name="base_layout_structure",
            severity="should_match",
            passed=True,
            detail="body tree structurally identical (classes/ids ignored)",
        )
    return CheckResult(
        name="base_layout_structure",
        severity="should_match",
        passed=False,
        detail=f"body tree differs: {diff.summary}",
        diff=diff.unified[:6000],
    )


def _check_mobile_menu_toggles(ctx: Context) -> CheckResult:
    """Delegated to Playwright spec tagged @phase-2."""
    result = run_visual_for_phase(ctx.repo_root, ctx.phase, update_baselines=ctx.update_baselines)
    if result.succeeded:
        return CheckResult(
            name="mobile_menu_toggles",
            severity="must_match",
            passed=True,
            detail="playwright @phase-2 suite passed",
        )
    return CheckResult(
        name="mobile_menu_toggles",
        severity="must_match",
        passed=False,
        detail="playwright @phase-2 suite failed",
        diff=(result.stderr or result.stdout)[-3000:],
    )


CHECKS: list[Check] = [
    Check(name="head_meta_parity", severity="must_match", run=_check_head_meta_parity),
    Check(name="nav_link_parity", severity="must_match", run=_check_nav_link_parity),
    Check(name="analytics_dev_absent", severity="must_match", run=_check_analytics_dev_absent),
    Check(name="analytics_prod_present", severity="must_match", run=_check_analytics_prod_present),
    Check(name="mobile_menu_toggles", severity="must_match", run=_check_mobile_menu_toggles),
    Check(name="base_layout_structure", severity="should_match", run=_check_base_layout_structure),
]
