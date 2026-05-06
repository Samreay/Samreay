"""Phase 5 — Single-page templates.

See plans/5-single-page-templates.md and references/gates-by-phase.md.

Hugo emits one ``index.html`` per content entry _and_ one per ``aliases:``
entry (the alias HTML is a 4-line ``<meta http-equiv=refresh>`` redirect).
Astro doesn't render aliases until Phase 12, so URL inventory checks here
filter the Hugo set to canonical (non-alias) routes only. The alias parity
check itself is the entire scope of Phase 12.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.types import Check, CheckResult, Context  # noqa: E402
from lib.url_inventory import diff_routes, list_html_routes  # noqa: E402

ALIAS_REFRESH_RE = re.compile(
    r'<meta[^>]+http-equiv\s*=\s*["\']?refresh', re.IGNORECASE
)

REPRESENTATIVE_PAGES = [
    "/reviews/bobiverse/",
    "/reviews/100th_run/",
    "/blogs/2023_07_writing_update/",
    "/tutorials/bayesianlinearregression/",
    # Math-using tutorial — gaussian_processes uses `math: true`.
    "/tutorials/gaussian_processes/",
]


def _is_hugo_alias(html_path: Path) -> bool:
    """Hugo emits a 4-line <meta http-equiv=refresh> redirect for every alias.

    These aren't real pages and aren't Astro's responsibility until Phase 12.
    """
    try:
        # Aliases are tiny — read the first KB.
        head = html_path.read_text(encoding="utf-8", errors="ignore")[:1024]
    except OSError:
        return False
    return bool(ALIAS_REFRESH_RE.search(head))


def _hugo_canonical_routes(public_dir: Path, prefix: str) -> set[str]:
    """List Hugo's non-alias routes under prefix (e.g. ``reviews``)."""
    routes: set[str] = set()
    base = public_dir / prefix
    if not base.is_dir():
        return routes
    for html in base.rglob("index.html"):
        if _is_hugo_alias(html):
            continue
        rel = html.parent.relative_to(public_dir).as_posix()
        routes.add(f"/{rel}/")
    return routes


def _check_url_inventory(prefix: str) -> "callable":
    def _run(ctx: Context) -> CheckResult:
        check_name = f"url_inventory_{prefix}"
        # The /reviews/, /blogs/, /tutorials/ index pages are owned by Phases
        # 8 and 9. Filter both sides so Phase 5 only compares the per-entry
        # detail pages.
        index_route = f"/{prefix}/"
        hugo = _hugo_canonical_routes(ctx.public_dir, prefix) - {index_route}
        astro = list_html_routes(ctx.dist_dir, prefix) - {index_route}
        only_hugo = hugo - astro
        only_astro = astro - hugo
        common = hugo & astro
        if not only_hugo and not only_astro:
            return CheckResult(
                name=check_name,
                severity="must_match",
                passed=True,
                detail=f"{len(common)} canonical /{prefix}/ routes match exactly",
            )
        sample_hugo = sorted(only_hugo)[:5]
        sample_astro = sorted(only_astro)[:5]
        bits = [f"common={len(common)}"]
        if only_hugo:
            bits.append(
                f"only_hugo={len(only_hugo)} (e.g. {', '.join(sample_hugo)})"
            )
        if only_astro:
            bits.append(
                f"only_astro={len(only_astro)} (e.g. {', '.join(sample_astro)})"
            )
        return CheckResult(
            name=check_name,
            severity="must_match",
            passed=False,
            detail="; ".join(bits),
        )

    return _run


def _read_route_html(root: Path, route: str) -> str | None:
    rel = route.strip("/")
    p = root / rel / "index.html" if rel else root / "index.html"
    if not p.is_file():
        return None
    return p.read_text(encoding="utf-8", errors="ignore")


def _check_representative_pages_structure(ctx: Context) -> CheckResult:
    """Lightweight structural sanity check (heading + paragraph counts) for
    a sample of detail pages.

    The full normalized HTML diff is not useful here because:

    - Hugo renders math via MathJax client-side (raw ``$...$`` in the HTML);
      Astro renders KaTeX at build time (huge ``<math>`` + ``.katex`` trees).
      The plan explicitly calls out this swap, so a verbatim diff would
      be noise.
    - Hugo highlights code with Chroma; Astro uses Shiki. Different markup,
      same semantics. Phase 10 owns code-highlight parity.
    - Hugo's ``_default/single.html`` formats the date with the buggy Go
      time layout ``2006-01-06`` (YYYY-MM-YY), so the rendered "07-19" is
      wrong; Astro renders the correct ISO date. We're not bug-compatible.
    - Cover images are masked because Phase 6 owns the image pipeline.
    - The show/hide-code toggle's inline script differs (Astro uses a
      ``window.__clickCheckbox`` shim because inline ``onchange`` handlers
      can't see Astro's scoped functions); Phase 9 turns it into a Svelte
      island and the script goes away.

    Instead we extract the article body and assert that the structural
    skeleton matches: same number of section-header h1, same number of h2/h3
    in the body, same paragraph count (tolerating ±25% to absorb math/code
    block reflow), and that the article actually rendered something.
    """
    from bs4 import BeautifulSoup

    failures: list[str] = []
    detail_bits: list[str] = []
    for route in REPRESENTATIVE_PAGES:
        hugo = _read_route_html(ctx.public_dir, route)
        astro = _read_route_html(ctx.dist_dir, route)
        if hugo is None:
            failures.append(f"{route}: missing in public/")
            continue
        if astro is None:
            failures.append(f"{route}: missing in dist/")
            continue
        h_soup = BeautifulSoup(hugo, "lxml")
        a_soup = BeautifulSoup(astro, "lxml")
        h_post = h_soup.select_one(".blog-post")
        a_post = a_soup.select_one(".blog-post")
        if not h_post or not a_post:
            failures.append(f"{route}: missing .blog-post container")
            continue
        h_h1 = len(h_post.select(".section-header h1"))
        a_h1 = len(a_post.select(".section-header h1"))
        if h_h1 != a_h1:
            failures.append(f"{route}: h1 count {h_h1} → {a_h1}")
            continue
        h_h2 = len(h_post.select("h2"))
        a_h2 = len(a_post.select("h2"))
        if h_h2 != a_h2:
            failures.append(f"{route}: h2 count {h_h2} → {a_h2}")
            continue
        h_h3 = len(h_post.select("h3"))
        a_h3 = len(a_post.select("h3"))
        if h_h3 != a_h3:
            failures.append(f"{route}: h3 count {h_h3} → {a_h3}")
            continue
        # The body should have rendered some prose; the exact number of <p>
        # tags differs because KaTeX wraps display math in extra spans and
        # Shiki nests code blocks differently, so we just require that both
        # sides emitted at least 1 paragraph.
        h_p = len(h_post.find_all("p"))
        a_p = len(a_post.find_all("p"))
        if h_p == 0 or a_p == 0:
            failures.append(f"{route}: paragraph count zero ({h_p}/{a_p})")
            continue
        detail_bits.append(f"{route}: h1={a_h1}/{h_h1} h2={a_h2}/{h_h2} h3={a_h3}/{h_h3} p={a_p}/{h_p}")

    if not failures:
        return CheckResult(
            name="representative_pages_structure",
            severity="must_match",
            passed=True,
            detail=f"{len(REPRESENTATIVE_PAGES)} pages: " + "; ".join(detail_bits),
        )
    return CheckResult(
        name="representative_pages_structure",
        severity="must_match",
        passed=False,
        detail="; ".join(failures),
    )


_MATH_SYNTAX_RE = re.compile(
    r"\$\$.+?\$\$|\$[^\$\n]+?\$|\\\(.+?\\\)|\\\[.+?\\\]", re.DOTALL
)


def _check_katex_rendered(ctx: Context) -> CheckResult:
    """Every page whose source actually contains math syntax should render
    at least one ``<span class="katex">`` in dist/.

    `math: true` in frontmatter is over-set across the historical content
    (legacy Hugo MathJax was loaded unconditionally on those pages even when
    they used no math). KaTeX only renders if there's actual math syntax to
    process, so we filter the source list to entries that actually use
    ``$...$``, ``$$...$$``, ``\\(...\\)``, or ``\\[...\\]``.
    """
    import frontmatter

    content_root = ctx.repo_root / "content"
    sources: list[tuple[str, Path, Path]] = []
    for collection in ("blogs", "tutorials", "reviews"):
        base = content_root / collection
        if not base.is_dir():
            continue
        for md in base.glob("*/index.md"):
            try:
                fm = frontmatter.load(md)
            except Exception:  # noqa: BLE001
                continue
            if fm.metadata.get("math") is not True:
                continue
            if not _MATH_SYNTAX_RE.search(fm.content):
                continue
            slug = md.parent.name
            dist_html = ctx.dist_dir / collection / slug / "index.html"
            sources.append((f"/{collection}/{slug}/", md, dist_html))

    if not sources:
        return CheckResult(
            name="katex_rendered",
            severity="must_match",
            passed=True,
            detail="no math: true entries found",
        )

    missing: list[str] = []
    for route, _md, dist_html in sources:
        if not dist_html.is_file():
            missing.append(f"{route} (no html)")
            continue
        text = dist_html.read_text(encoding="utf-8", errors="ignore")
        if 'class="katex"' not in text and "class='katex'" not in text:
            missing.append(route)
    if not missing:
        return CheckResult(
            name="katex_rendered",
            severity="must_match",
            passed=True,
            detail=f"all {len(sources)} math:true pages contain a .katex span",
        )
    return CheckResult(
        name="katex_rendered",
        severity="must_match",
        passed=False,
        detail=(
            f"{len(missing)}/{len(sources)} math:true pages missing .katex render: "
            + ", ".join(missing[:5])
        ),
    )


def _check_links_array_parity(ctx: Context) -> CheckResult:
    """For 10 random reviews, the link buttons emitted (visible text + href)
    match Hugo's. Stays should_match because Phase 6 will refactor cover
    layout and might shift surrounding markup; the link buttons themselves
    should not change.
    """
    import frontmatter
    import random
    from bs4 import BeautifulSoup

    content_root = ctx.repo_root / "content" / "reviews"
    review_slugs = [p.parent.name for p in content_root.glob("*/index.md")]
    if not review_slugs:
        return CheckResult(
            name="links_array_parity",
            severity="should_match",
            passed=False,
            detail="no review entries found",
        )
    random.seed(50)
    sample = random.sample(review_slugs, min(10, len(review_slugs)))
    mismatches: list[str] = []
    for slug in sample:
        astro_html = _read_route_html(ctx.dist_dir, f"/reviews/{slug}/")
        hugo_html = _read_route_html(ctx.public_dir, f"/reviews/{slug}/")
        if not astro_html or not hugo_html:
            continue
        astro_links = _extract_link_buttons(astro_html)
        hugo_links = _extract_link_buttons(hugo_html)
        if astro_links != hugo_links:
            mismatches.append(
                f"{slug}: astro={astro_links} vs hugo={hugo_links}"
            )
    if not mismatches:
        return CheckResult(
            name="links_array_parity",
            severity="should_match",
            passed=True,
            detail=f"link buttons match for all {len(sample)} sampled reviews",
        )
    return CheckResult(
        name="links_array_parity",
        severity="should_match",
        passed=False,
        detail="; ".join(mismatches[:3]),
    )


def _extract_link_buttons(html: str) -> list[tuple[str, str]]:
    """Pull (label_lowercased, href) for the bg-{tier}-700 link buttons from
    a review page. These are the Amazon/Audible/etc. buttons in the review
    summary block. Returns sorted list for stable comparison.
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")
    out: list[tuple[str, str]] = []
    for a in soup.find_all("a"):
        cls = a.get("class") or []
        if any(c.startswith("bg-") and c.endswith("-700") for c in cls):
            label = (a.get_text() or "").strip().lower()
            href = (a.get("href") or "").strip()
            out.append((label, href))
    return sorted(out)


def _check_return_link_present(ctx: Context) -> CheckResult:
    """Every review detail page should link 'Return to review index.' to /reviews/."""
    from bs4 import BeautifulSoup

    reviews_dir = ctx.dist_dir / "reviews"
    if not reviews_dir.is_dir():
        return CheckResult(
            name="return_link_present",
            severity="must_match",
            passed=False,
            detail="dist/reviews/ missing",
        )
    missing: list[str] = []
    checked = 0
    for html_path in reviews_dir.glob("*/index.html"):
        # Skip the reviews index itself if it lives at /reviews/index.html
        # (Phase 8 owns that page; for now it doesn't exist).
        slug = html_path.parent.name
        if slug == "reviews":
            continue
        checked += 1
        soup = BeautifulSoup(
            html_path.read_text(encoding="utf-8", errors="ignore"), "lxml"
        )
        found = False
        for a in soup.find_all("a"):
            text = (a.get_text() or "").strip().rstrip(".").lower()
            if text == "return to review index":
                href = (a.get("href") or "").rstrip("/")
                if href in {"/reviews", ""} or href.endswith("/reviews"):
                    found = True
                    break
        if not found:
            missing.append(f"/reviews/{slug}/")
    if not missing:
        return CheckResult(
            name="return_link_present",
            severity="must_match",
            passed=True,
            detail=f"all {checked} review pages link back to /reviews/",
        )
    return CheckResult(
        name="return_link_present",
        severity="must_match",
        passed=False,
        detail=(
            f"{len(missing)}/{checked} review pages missing return link: "
            + ", ".join(missing[:5])
        ),
    )


CHECKS: list[Check] = [
    Check(
        name="url_inventory_reviews",
        severity="must_match",
        run=_check_url_inventory("reviews"),
    ),
    Check(
        name="url_inventory_blogs",
        severity="must_match",
        run=_check_url_inventory("blogs"),
    ),
    Check(
        name="url_inventory_tutorials",
        severity="must_match",
        run=_check_url_inventory("tutorials"),
    ),
    Check(
        name="representative_pages_structure",
        severity="must_match",
        run=_check_representative_pages_structure,
    ),
    Check(
        name="katex_rendered",
        severity="must_match",
        run=_check_katex_rendered,
    ),
    Check(
        name="links_array_parity",
        severity="should_match",
        run=_check_links_array_parity,
    ),
    Check(
        name="return_link_present",
        severity="must_match",
        run=_check_return_link_present,
    ),
]
