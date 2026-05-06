"""Phase 7 — Home page.

See plans/7-home-page.md and references/gates-by-phase.md.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.types import Check, CheckResult, Context  # noqa: E402
from lib.visual import run_visual_for_phase  # noqa: E402


def _read_index(root: Path) -> str | None:
    p = root / "index.html"
    if not p.is_file():
        return None
    return p.read_text(encoding="utf-8", errors="ignore")


def _check_book_card_count(ctx: Context) -> CheckResult:
    """Both home pages should emit the same number of book cards in the
    Books section.

    Hugo's selector is the literal markup `article.fancy_card`, but Hugo
    also wraps the newsletter CTA in a `.fancy_card`. We count the actual
    book articles by combining `article.fancy_card` minus the CTA card.
    Astro emits the same structure via `BookCard.astro`.
    """
    from bs4 import BeautifulSoup

    hugo = _read_index(ctx.public_dir)
    astro = _read_index(ctx.dist_dir)
    if hugo is None or astro is None:
        return CheckResult(
            name="book_card_count",
            severity="must_match",
            passed=False,
            detail="missing /index.html on one side",
        )
    h = BeautifulSoup(hugo, "lxml")
    a = BeautifulSoup(astro, "lxml")
    # Book articles have `card_overlay_motion` inside, the CTA card doesn't.
    h_books = len(h.select("article.fancy_card .card_overlay_motion"))
    a_books = len(a.select("article.fancy_card .card_overlay_motion"))
    if h_books == a_books and h_books > 0:
        return CheckResult(
            name="book_card_count",
            severity="must_match",
            passed=True,
            detail=f"{a_books} book cards on both sides",
        )
    return CheckResult(
        name="book_card_count",
        severity="must_match",
        passed=False,
        detail=f"hugo={h_books} astro={a_books}",
    )


def _check_course_card_count(ctx: Context) -> CheckResult:
    """Course articles use `article.relative.max-w-md` (the only place that
    selector appears on the home page).
    """
    from bs4 import BeautifulSoup

    hugo = _read_index(ctx.public_dir)
    astro = _read_index(ctx.dist_dir)
    if hugo is None or astro is None:
        return CheckResult(
            name="course_card_count",
            severity="must_match",
            passed=False,
            detail="missing /index.html on one side",
        )
    h = BeautifulSoup(hugo, "lxml")
    a = BeautifulSoup(astro, "lxml")
    h_n = len(h.select("article.relative.max-w-md"))
    a_n = len(a.select("article.relative.max-w-md"))
    if h_n == a_n and h_n > 0:
        return CheckResult(
            name="course_card_count",
            severity="must_match",
            passed=True,
            detail=f"{a_n} course cards on both sides",
        )
    return CheckResult(
        name="course_card_count",
        severity="must_match",
        passed=False,
        detail=f"hugo={h_n} astro={a_n}",
    )


def _check_section_anchors(ctx: Context) -> CheckResult:
    """`#books` and `#courses` should be addressable on the Astro home page.

    Hugo only emits `#courses` (the Books section had no anchor); Astro adds
    `#books` so the in-page link from About actually scrolls. We therefore
    only assert presence on the Astro side.
    """
    from bs4 import BeautifulSoup

    astro = _read_index(ctx.dist_dir)
    if astro is None:
        return CheckResult(
            name="section_anchors",
            severity="must_match",
            passed=False,
            detail="dist/index.html missing",
        )
    a = BeautifulSoup(astro, "lxml")
    missing = [a_id for a_id in ("books", "courses") if not a.select_one(f"#{a_id}")]
    if not missing:
        return CheckResult(
            name="section_anchors",
            severity="must_match",
            passed=True,
            detail="#books and #courses both present in dist/index.html",
        )
    return CheckResult(
        name="section_anchors",
        severity="must_match",
        passed=False,
        detail=f"missing anchors: {', '.join(missing)}",
    )


def _check_home_visual(ctx: Context) -> CheckResult:
    """Playwright `@phase-7` suite — `compare.spec.ts` covers `/`."""
    result = run_visual_for_phase(
        ctx.repo_root, ctx.phase, update_baselines=ctx.update_baselines
    )
    if result.succeeded:
        return CheckResult(
            name="home_visual",
            severity="must_match",
            passed=True,
            detail=(
                "playwright @phase-7 suite passed"
                + (" (baseline bootstrapped)" if result.bootstrapped else "")
            ),
        )
    return CheckResult(
        name="home_visual",
        severity="must_match",
        passed=False,
        detail=(
            "playwright @phase-7 suite failed — eyeball the diffs under "
            "scripts/visual/test-results/ and either fix the home page or "
            "regenerate baselines via "
            "`make implement-plan-update-baselines PHASE=7`"
        ),
        diff=(result.stderr or result.stdout)[-3000:],
    )


CHECKS: list[Check] = [
    Check(
        name="book_card_count",
        severity="must_match",
        run=_check_book_card_count,
    ),
    Check(
        name="course_card_count",
        severity="must_match",
        run=_check_course_card_count,
    ),
    Check(
        name="section_anchors",
        severity="must_match",
        run=_check_section_anchors,
    ),
    Check(
        name="home_visual",
        severity="must_match",
        run=_check_home_visual,
    ),
]
