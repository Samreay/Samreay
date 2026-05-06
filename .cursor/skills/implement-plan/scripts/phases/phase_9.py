"""Phase 9 — Artists + tagged list islands.

See plans/9-artists-and-tagged-lists.md and references/gates-by-phase.md.

This phase ports the remaining Hugo client-side templates to Svelte
islands:

- `/artists/` — `ArtistsExplorer.svelte` shuffle/alphabetical/size toggles.
- `/blogs/` and `/tutorials/` — `TaggedList.svelte` tag-filter card grid.
- `MobileMenu.svelte` replacing the AlpineJS hamburger.
- `ShowCodeToggle.svelte` replacing the inline-script tutorial toggle.

The interactive checks (toggles, tag filters, mobile menu) live in the
Playwright `@phase-9` suite. The Python checks below cover SSR coverage,
data integrity (artist counts, blog/tutorial card counts), and the
"AlpineJS no longer in src/" lint.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.collections import count_markdown_files  # noqa: E402
from lib.types import Check, CheckResult, Context  # noqa: E402
from lib.visual import run_visual_for_phase  # noqa: E402


def _check_artists_index_loads(ctx: Context) -> CheckResult:
    p = ctx.dist_dir / "artists" / "index.html"
    if not p.is_file() or p.stat().st_size < 1000:
        return CheckResult(
            name="artists_index_loads",
            severity="must_match",
            passed=False,
            detail="dist/artists/index.html missing or empty",
        )
    return CheckResult(
        name="artists_index_loads",
        severity="must_match",
        passed=True,
        detail=f"dist/artists/index.html present ({p.stat().st_size:,} bytes)",
    )


def _expected_artist_count(repo_root: Path) -> int:
    raw = (repo_root / "data" / "artists.yml").read_text(encoding="utf-8")
    artists = yaml.safe_load(raw) or []
    return sum(1 for a in artists if not a.get("hidden") and a.get("covers"))


def _check_artists_ssr_covers_everyone(ctx: Context) -> CheckResult:
    p = ctx.dist_dir / "artists" / "index.html"
    if not p.is_file():
        return CheckResult(
            name="artists_ssr_covers_everyone",
            severity="must_match",
            passed=False,
            detail="dist/artists/index.html missing",
        )
    html = p.read_text(encoding="utf-8", errors="ignore")
    rendered = len(re.findall(r'data-artist="[^"]+"', html))
    expected = _expected_artist_count(ctx.repo_root)
    if rendered == expected and expected > 0:
        return CheckResult(
            name="artists_ssr_covers_everyone",
            severity="must_match",
            passed=True,
            detail=f"{rendered} artists rendered (matches data/artists.yml)",
        )
    return CheckResult(
        name="artists_ssr_covers_everyone",
        severity="must_match",
        passed=False,
        detail=f"SSR rendered {rendered} artists, yaml expects {expected}",
    )


def _check_blogs_index_ssr(ctx: Context) -> CheckResult:
    p = ctx.dist_dir / "blogs" / "index.html"
    if not p.is_file():
        return CheckResult(
            name="blogs_index_ssr",
            severity="must_match",
            passed=False,
            detail="dist/blogs/index.html missing",
        )
    html = p.read_text(encoding="utf-8", errors="ignore")
    cards = html.count("data-tagged-card")
    expected = count_markdown_files(ctx.repo_root / "content", "blogs")
    if cards == expected and expected > 0:
        return CheckResult(
            name="blogs_index_ssr",
            severity="must_match",
            passed=True,
            detail=f"{cards} blog cards in SSR HTML (matches disk)",
        )
    return CheckResult(
        name="blogs_index_ssr",
        severity="must_match",
        passed=False,
        detail=f"SSR rendered {cards} blog cards, disk has {expected}",
    )


def _check_tutorials_index_ssr(ctx: Context) -> CheckResult:
    p = ctx.dist_dir / "tutorials" / "index.html"
    if not p.is_file():
        return CheckResult(
            name="tutorials_index_ssr",
            severity="must_match",
            passed=False,
            detail="dist/tutorials/index.html missing",
        )
    html = p.read_text(encoding="utf-8", errors="ignore")
    cards = html.count("data-tagged-card")
    expected = count_markdown_files(ctx.repo_root / "content", "tutorials")
    if cards == expected and expected > 0:
        return CheckResult(
            name="tutorials_index_ssr",
            severity="must_match",
            passed=True,
            detail=f"{cards} tutorial cards in SSR HTML (matches disk)",
        )
    return CheckResult(
        name="tutorials_index_ssr",
        severity="must_match",
        passed=False,
        detail=f"SSR rendered {cards} tutorial cards, disk has {expected}",
    )


_X_DATA_RE = re.compile(r"\bx-(?:data|show|cloak|ref|init|click|model)\b")


def _check_no_alpine_in_src(ctx: Context) -> CheckResult:
    """Plan §5: 'No `Alpine` global referenced in built JS' / 'Search src/
    for any x-data / x-show attributes — there should be none after this
    phase'. We ignore .svelte files because Svelte's own attribute syntax
    overlaps with Alpine's.
    """
    src = ctx.repo_root / "src"
    offenders: list[str] = []
    for path in src.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in {".astro", ".ts", ".tsx", ".js", ".jsx", ".html"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if _X_DATA_RE.search(text):
            offenders.append(str(path.relative_to(ctx.repo_root)))
    if not offenders:
        return CheckResult(
            name="no_alpine_in_src",
            severity="must_match",
            passed=True,
            detail="no AlpineJS attributes found in src/",
        )
    return CheckResult(
        name="no_alpine_in_src",
        severity="must_match",
        passed=False,
        detail=f"{len(offenders)} files still reference AlpineJS attrs",
        diff="\n".join(offenders),
    )


def _check_no_alpine_in_dist_js(ctx: Context) -> CheckResult:
    """Search the built Astro client bundles for the `Alpine` global. The
    Phase 9 plan deletes Alpine usage from `src/`; if anything still imports
    it, Vite's tree-shaking would surface it under `dist/_astro/*.js`.

    Hugo's bundle (mounted at /js/main.<hash>.js inside `public/`) is
    untouched until Phase 14, so we look only inside Astro's `dist/_astro/`.
    """
    astro_dir = ctx.dist_dir / "_astro"
    if not astro_dir.is_dir():
        return CheckResult(
            name="no_alpine_in_dist_js",
            severity="must_match",
            passed=False,
            detail="dist/_astro/ missing — has astro built?",
        )
    pattern = re.compile(r"\balpinejs\b|window\.Alpine\b")
    offenders: list[str] = []
    for js in astro_dir.glob("*.js"):
        try:
            text = js.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if pattern.search(text):
            offenders.append(js.name)
    if not offenders:
        return CheckResult(
            name="no_alpine_in_dist_js",
            severity="must_match",
            passed=True,
            detail="no Alpine global in dist/_astro/*.js",
        )
    return CheckResult(
        name="no_alpine_in_dist_js",
        severity="must_match",
        passed=False,
        detail=f"{len(offenders)} bundle(s) reference Alpine",
        diff="\n".join(offenders),
    )


def _check_islands_interactive(ctx: Context) -> CheckResult:
    """Run the Playwright `@phase-9` suite — covers artist toggles, blog/
    tutorial tag filters, mobile menu open/close, and tutorial show-code
    radio toggle.
    """
    result = run_visual_for_phase(
        ctx.repo_root, ctx.phase, update_baselines=ctx.update_baselines
    )
    if result.succeeded:
        return CheckResult(
            name="islands_interactive",
            severity="must_match",
            passed=True,
            detail=(
                "playwright @phase-9 suite passed"
                + (" (baseline bootstrapped)" if result.bootstrapped else "")
            ),
        )
    return CheckResult(
        name="islands_interactive",
        severity="must_match",
        passed=False,
        detail=(
            "playwright @phase-9 suite failed — inspect "
            "scripts/visual/test-results/ for the failing spec output"
        ),
        diff=(result.stderr or result.stdout)[-3000:],
    )


CHECKS: list[Check] = [
    Check(name="artists_index_loads", severity="must_match", run=_check_artists_index_loads),
    Check(
        name="artists_ssr_covers_everyone",
        severity="must_match",
        run=_check_artists_ssr_covers_everyone,
    ),
    Check(name="blogs_index_ssr", severity="must_match", run=_check_blogs_index_ssr),
    Check(name="tutorials_index_ssr", severity="must_match", run=_check_tutorials_index_ssr),
    Check(name="no_alpine_in_src", severity="must_match", run=_check_no_alpine_in_src),
    Check(name="no_alpine_in_dist_js", severity="must_match", run=_check_no_alpine_in_dist_js),
    Check(
        name="islands_interactive",
        severity="must_match",
        run=_check_islands_interactive,
    ),
]
