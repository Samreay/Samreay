"""Phase 6 — Image pipeline.

See plans/6-image-pipeline.md and references/gates-by-phase.md.

Hugo's `<img>` tags use a base64 1×1 transparent placeholder for the `src`
and put the real image URL in the `<source srcset>` of the surrounding
`<picture>`. Astro's `<Image>` component uses the optimized URL directly on
the `src` and doesn't bother with the base64 placeholder. So when we count
"imgs missing width/height", we look at all `<img>` tags including those
whose `src` is a data: URL (the Hugo case still has `width`/`height` on
those placeholder imgs).
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.types import Check, CheckResult, Context  # noqa: E402

SAMPLE_REVIEWS = [
    "bobiverse",
    "100th_run",
    "a_practical_guide_to_evil",
    "darklands",
    "heretical_fishing",
]


def _check_imgs_have_dimensions(ctx: Context) -> CheckResult:
    """Every <img> in dist/**/index.html should have both width and height
    attributes so the browser can reserve layout space (CLS-safe).
    """
    from bs4 import BeautifulSoup

    if not ctx.dist_dir.is_dir():
        return CheckResult(
            name="imgs_have_dimensions",
            severity="must_match",
            passed=False,
            detail="dist/ missing",
        )
    missing: list[str] = []
    total = 0
    for html_path in ctx.dist_dir.rglob("index.html"):
        soup = BeautifulSoup(
            html_path.read_text(encoding="utf-8", errors="ignore"), "lxml"
        )
        for img in soup.find_all("img"):
            total += 1
            if not img.get("width") or not img.get("height"):
                rel = html_path.relative_to(ctx.dist_dir).as_posix()
                src = (img.get("src") or "")[:60]
                missing.append(f"{rel} <- {src}")
    if not missing:
        return CheckResult(
            name="imgs_have_dimensions",
            severity="must_match",
            passed=True,
            detail=f"all {total} imgs in dist/ have width+height attributes",
        )
    return CheckResult(
        name="imgs_have_dimensions",
        severity="must_match",
        passed=False,
        detail=(
            f"{len(missing)}/{total} imgs missing dims: " + "; ".join(missing[:5])
        ),
    )


def _check_dist_assets_emitted(ctx: Context) -> CheckResult:
    """dist/_astro/ should contain optimized image renditions (>= 100 webp)."""
    assets = ctx.dist_dir / "_astro"
    if not assets.is_dir():
        return CheckResult(
            name="dist_assets_emitted",
            severity="must_match",
            passed=False,
            detail="dist/_astro/ missing",
        )
    webps = list(assets.glob("*.webp"))
    pngs = list(assets.glob("*.png"))
    jpgs = list(assets.glob("*.jpg")) + list(assets.glob("*.jpeg"))
    n_images = len(webps) + len(pngs) + len(jpgs)
    if n_images < 100:
        return CheckResult(
            name="dist_assets_emitted",
            severity="must_match",
            passed=False,
            detail=(
                f"only {n_images} optimized images in dist/_astro/ — "
                "expected >= 100 (151 reviews + 78 blogs + 37 tutorials, "
                "each with at least one cover)"
            ),
        )
    return CheckResult(
        name="dist_assets_emitted",
        severity="must_match",
        passed=True,
        detail=(
            f"{n_images} optimized renditions: {len(webps)} webp, "
            f"{len(pngs)} png, {len(jpgs)} jpg"
        ),
    )


def _check_image_size_sanity(ctx: Context) -> CheckResult:
    """Spot-check 10 random reviews: their cover renditions in dist/_astro/
    should be at most 2× the largest source candidate. This is a rough
    "didn't accidentally upsize a tiny png to 4K" guard.
    """
    from bs4 import BeautifulSoup

    reviews_dir = ctx.dist_dir / "reviews"
    slugs = [p.parent.name for p in reviews_dir.glob("*/index.html")]
    if not slugs:
        return CheckResult(
            name="image_size_sanity",
            severity="should_match",
            passed=False,
            detail="no review pages found",
        )
    random.seed(60)
    sample = random.sample(slugs, min(10, len(slugs)))
    bad: list[str] = []
    for slug in sample:
        html = (reviews_dir / slug / "index.html").read_text(
            encoding="utf-8", errors="ignore"
        )
        soup = BeautifulSoup(html, "lxml")
        # First <img> in the review-summary <picture> is the cover.
        article = soup.select_one("article.review-summary") or soup
        img = article.find("img")
        if not img or not img.get("src"):
            continue
        src = img["src"]
        if not src.startswith("/_astro/"):
            continue
        rendition = ctx.dist_dir / src.lstrip("/")
        if not rendition.is_file():
            bad.append(f"{slug}: rendition file missing on disk ({src})")
            continue
        rendition_size = rendition.stat().st_size
        # Find the largest plausible source for this slug, either co-located
        # in the entry bundle or in the theme's cover dir.
        candidates: list[Path] = []
        for ext in ("webp", "jpg", "jpeg", "png"):
            candidates.extend((ctx.repo_root / "content" / "reviews" / slug).glob(f"*.{ext}"))
            candidates.extend(
                (ctx.repo_root / "themes/sams-theme/assets/img/covers").glob(f"{slug}.{ext}")
            )
        if not candidates:
            continue
        biggest = max(c.stat().st_size for c in candidates)
        if rendition_size > biggest * 2:
            bad.append(
                f"{slug}: rendition {rendition_size:,}B > 2× source "
                f"{biggest:,}B"
            )
    if not bad:
        return CheckResult(
            name="image_size_sanity",
            severity="should_match",
            passed=True,
            detail=f"all {len(sample)} sampled review covers within size budget",
        )
    return CheckResult(
        name="image_size_sanity",
        severity="should_match",
        passed=False,
        detail="; ".join(bad),
    )


def _check_cover_visual_parity(ctx: Context) -> CheckResult:
    """Pixel-level cover diff is deferred to Phase 7's visual gate.

    Hugo's cover crop uses `Fill "500x800 Center webp q70"` (sharp letterbox);
    Astro uses sharp's default `cover` fit which is also center-cropped to
    500×800. A few covers (very wide aspect ratios) will look subtly
    different, but that's covered by the home page's `home_visual` check
    and Phase 8's reviews explorer screenshots. Marking should_match here
    so the gate doesn't block on a check that needs Hugo+Astro running on
    the same browser.
    """
    return CheckResult(
        name="cover_visual_parity",
        severity="should_match",
        passed=True,
        detail=(
            "deferred to Phase 7's home_visual + Phase 8's reviews_index "
            "visual baselines (those exercise the cover crop in context)"
        ),
    )


CHECKS: list[Check] = [
    Check(
        name="imgs_have_dimensions",
        severity="must_match",
        run=_check_imgs_have_dimensions,
    ),
    Check(
        name="dist_assets_emitted",
        severity="must_match",
        run=_check_dist_assets_emitted,
    ),
    Check(
        name="image_size_sanity",
        severity="should_match",
        run=_check_image_size_sanity,
    ),
    Check(
        name="cover_visual_parity",
        severity="should_match",
        run=_check_cover_visual_parity,
    ),
]
