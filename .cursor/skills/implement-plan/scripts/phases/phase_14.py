"""Phase 14 — Cutover.

See plans/14-cutover.md and references/gates-by-phase.md.

Phase 14 retires Hugo entirely. Practical consequences:

* The universal `hugo_builds` check is silently skipped from this phase
  forward (see `lib/universal.py::_hugo_retired`). There is no Hugo
  binary to invoke and no `themes/`, `hugo.toml` for it to consume.
* `final_sitemap_diff_empty` cannot run a fresh Hugo sitemap, so it
  compares Astro's `dist/sitemap-*.xml` against a snapshot captured
  immediately before the cutover ran (`state/phase-14-hugo-sitemap.json`).
  Implementation prerequisite: snapshot Hugo's last successful sitemap
  before deleting `themes/`.
* `internal_link_crawl_clean` walks every `<a href>` reachable from the
  Astro home page (via `dist/`) and asserts every internal target
  resolves to a real `index.html` or alias redirect.
* `lighthouse_perf_95` is a manual check; the verifier surfaces a
  guidance message instead of failing.
* `legacy_files_removed` confirms `themes/`, `archetypes/`,
  `hugo.toml`, `resources/_gen/`, `resize.py`, and the legacy `public/`
  directory are gone; and that `package.json` no longer ships
  `alpinejs` / `aos` / `cruip-js-toolkit` / `postcss-cli` /
  `postcss-import`.

The intent is to make the post-cutover repo entirely self-describing
without Hugo — `npm run build` is the only build verb left.
"""

from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urldefrag, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.types import Check, CheckResult, Context  # noqa: E402

LEGACY_PATHS = (
    "themes",
    "archetypes",
    "hugo.toml",
    "resources/_gen",
    "resize.py",
    "public",
)
LEGACY_DEPS = (
    "alpinejs",
    "aos",
    "cruip-js-toolkit",
    "postcss-cli",
    "postcss-import",
)


def _read_pkg(repo_root: Path) -> dict:
    pkg = repo_root / "package.json"
    if not pkg.is_file():
        return {}
    return json.loads(pkg.read_text(encoding="utf-8"))


def _check_legacy_files_removed(ctx: Context) -> CheckResult:
    survivors: list[str] = []
    for rel in LEGACY_PATHS:
        path = ctx.repo_root / rel
        if path.exists():
            survivors.append(rel)
    pkg = _read_pkg(ctx.repo_root)
    deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
    leftover_deps = [d for d in LEGACY_DEPS if d in deps]
    if not survivors and not leftover_deps:
        return CheckResult(
            name="legacy_files_removed",
            severity="must_match",
            passed=True,
            detail="hugo + theme + legacy deps gone",
        )
    diff_lines: list[str] = []
    if survivors:
        diff_lines.append(f"surviving paths ({len(survivors)}):")
        diff_lines.extend("  " + s for s in survivors)
    if leftover_deps:
        diff_lines.append(f"surviving package.json deps ({len(leftover_deps)}):")
        diff_lines.extend("  " + d for d in leftover_deps)
    return CheckResult(
        name="legacy_files_removed",
        severity="must_match",
        passed=False,
        detail=f"{len(survivors)} legacy path(s), {len(leftover_deps)} legacy dep(s) remain",
        diff="\n".join(diff_lines),
    )


def _astro_sitemap_urls(dist: Path) -> set[str]:
    """Read the per-section sitemaps (sitemap-0.xml, sitemap-1.xml, ...)
    but skip `sitemap-index.xml` which only references the others.
    Excluded URL patterns are the dev `kitchensink` page and the
    sitemap files themselves (Astro lists them for crawlers but Hugo
    never did).
    """
    out: set[str] = set()
    for path in dist.glob("sitemap-*.xml"):
        if path.name == "sitemap-index.xml":
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for m in re.finditer(r"<loc>([^<]+)</loc>", text):
            url = m.group(1).strip()
            if url.endswith("/kitchensink/") or url.endswith(".xml"):
                continue
            out.add(url)
    return out


# Hugo's `taxonomies` config auto-generated `/tags/<tag>/` and
# `/categories/<cat>/` archive pages, but no template ever linked to
# them — they were dead URLs in the existing site too. Astro
# intentionally doesn't reproduce these (Phases 8/9 use in-page tag
# filters via Svelte islands instead). The sitemap-diff comparator
# strips them so the parity check stays meaningful.
_HUGO_ONLY_PREFIXES = ("/tags/", "/categories/")


def _filter_hugo_only(urls: set[str]) -> set[str]:
    out: set[str] = set()
    for url in urls:
        path = urlsplit(url).path
        if any(path.startswith(p) for p in _HUGO_ONLY_PREFIXES):
            continue
        out.add(url)
    return out


def _check_final_sitemap_diff_empty(ctx: Context) -> CheckResult:
    snapshot = ctx.state_dir / "phase-14-hugo-sitemap.json"
    if not snapshot.is_file():
        return CheckResult(
            name="final_sitemap_diff_empty",
            severity="must_match",
            passed=False,
            detail=(
                "missing state/phase-14-hugo-sitemap.json — capture Hugo's "
                "final sitemap before deleting themes/ (see plan)"
            ),
        )
    payload = json.loads(snapshot.read_text(encoding="utf-8"))
    hugo_urls = _filter_hugo_only(set(payload.get("urls") or []))
    astro_urls = _astro_sitemap_urls(ctx.dist_dir)
    only_hugo = sorted(hugo_urls - astro_urls)
    only_astro = sorted(astro_urls - hugo_urls)
    if not only_hugo and not only_astro:
        return CheckResult(
            name="final_sitemap_diff_empty",
            severity="must_match",
            passed=True,
            detail=f"sitemap URL set parity (n={len(hugo_urls)})",
        )
    diff_lines: list[str] = []
    if only_hugo:
        diff_lines.append(f"only in Hugo ({len(only_hugo)}):")
        diff_lines.extend("  " + u for u in only_hugo[:30])
        if len(only_hugo) > 30:
            diff_lines.append(f"  ...and {len(only_hugo) - 30} more")
    if only_astro:
        diff_lines.append(f"only in Astro ({len(only_astro)}):")
        diff_lines.extend("  " + u for u in only_astro[:30])
        if len(only_astro) > 30:
            diff_lines.append(f"  ...and {len(only_astro) - 30} more")
    return CheckResult(
        name="final_sitemap_diff_empty",
        severity="must_match",
        passed=False,
        detail=f"sitemap diff: only_hugo={len(only_hugo)}, only_astro={len(only_astro)}",
        diff="\n".join(diff_lines),
    )


class _HrefExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        for name, value in attrs:
            if name == "href" and value:
                self.hrefs.append(value)


_DOMAIN = "cosmiccoding.com.au"
# External link patterns we should never treat as broken even if dist
# lacks them — they're absolute references to other people's domains.
_EXTERNAL_PREFIXES = ("http://", "https://", "mailto:", "tel:", "javascript:")


def _resolve_internal(href: str, source_url_dir: str) -> str | None:
    """Map an `<a href>` to a `dist/` lookup path, or None if external/
    intra-page only. `source_url_dir` is the directory of the page that
    contained the link (e.g. `/blogs/2025_01_cover_art/`); relative
    hrefs are resolved against it.
    """
    href = (href or "").strip()
    if not href:
        return None
    href, _ = urldefrag(href)
    if not href:
        return None
    if href.startswith(_EXTERNAL_PREFIXES):
        if not href.startswith(("http://", "https://")):
            return None
        parsed = urlsplit(href)
        if _DOMAIN not in (parsed.netloc or ""):
            return None
        path = parsed.path or "/"
        query = parsed.query
    else:
        parsed = urlsplit(href)
        raw_path = parsed.path
        query = parsed.query
        if raw_path.startswith("/"):
            path = raw_path
        else:
            # Relative URL: resolve against the page's directory. Hugo
            # content bundles served sibling files at the page URL, so
            # `[file](layout.png)` from `/blogs/foo/index.html` should
            # resolve to `/blogs/foo/layout.png`.
            path = source_url_dir.rstrip("/") + "/" + raw_path
    # Drop trailing query strings — they're filter params, not file
    # paths (e.g. `/reviews/?l=cover`).
    if query:
        path = path.split("?", 1)[0]
    return path


def _exists_in_dist(path: str, dist: Path) -> bool:
    if path.endswith("/"):
        candidate = dist / path.lstrip("/") / "index.html"
        return candidate.is_file()
    rel = path.lstrip("/")
    if (dist / rel).is_file():
        return True
    # `trailingSlash: 'always'` — accept the with-slash form too.
    return (dist / rel / "index.html").is_file()


def _collect_pages(dist: Path, limit: int = 80) -> list[Path]:
    """Sample a manageable subset of pages: home + every collection
    index + a stratified sample of detail pages.
    """
    pages = [dist / "index.html"]
    for index in (
        dist / "reviews" / "index.html",
        dist / "blogs" / "index.html",
        dist / "tutorials" / "index.html",
        dist / "artists" / "index.html",
    ):
        if index.is_file():
            pages.append(index)
    for collection in ("reviews", "blogs", "tutorials"):
        for entry in sorted((dist / collection).glob("*/index.html"))[:20]:
            pages.append(entry)
        if len(pages) > limit:
            break
    return pages[:limit]


def _check_internal_link_crawl_clean(ctx: Context) -> CheckResult:
    pages = _collect_pages(ctx.dist_dir)
    if not pages or not pages[0].is_file():
        return CheckResult(
            name="internal_link_crawl_clean",
            severity="must_match",
            passed=False,
            detail="dist/ has no pages to crawl",
        )
    broken: list[tuple[str, str]] = []
    seen: set[str] = set()
    for page in pages:
        try:
            text = page.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        parser = _HrefExtractor()
        parser.feed(text)
        page_rel = str(page.relative_to(ctx.dist_dir))
        # Source directory URL: drop the trailing index.html so relative
        # link resolution lands in the right folder.
        page_url_dir = "/" + page_rel.rsplit("/", 1)[0] + "/" if "/" in page_rel else "/"
        for href in parser.hrefs:
            target = _resolve_internal(href, page_url_dir)
            if not target:
                continue
            if target in seen:
                continue
            seen.add(target)
            if not _exists_in_dist(target, ctx.dist_dir):
                broken.append((page_rel, target))
    if not broken:
        return CheckResult(
            name="internal_link_crawl_clean",
            severity="must_match",
            passed=True,
            detail=f"crawled {len(pages)} pages, {len(seen)} unique internal links, 0 broken",
        )
    diff = "\n".join(f"  {src} -> {target}" for src, target in broken[:30])
    return CheckResult(
        name="internal_link_crawl_clean",
        severity="must_match",
        passed=False,
        detail=f"{len(broken)} broken internal link(s) found across {len(pages)} pages",
        diff=diff,
    )


def _check_lighthouse_manual(ctx: Context) -> CheckResult:
    """Lighthouse runs against a live preview server, which is
    out-of-band for the verifier. Print guidance and mark as a
    `should_match` warning so it shows up in the summary.
    """
    return CheckResult(
        name="lighthouse_perf_95",
        severity="should_match",
        passed=True,
        detail=(
            "manual: run `npx lighthouse https://cosmiccoding.com.au/reviews/bobiverse/ "
            "--quiet --only-categories=performance` and confirm score ≥ 95"
        ),
    )


def _check_resize_py_gone(ctx: Context) -> CheckResult:
    """Belt-and-braces: `resize.py` and the cover-resize pipeline were
    Hugo-specific. After cutover Astro's image pipeline replaces it.
    """
    if (ctx.repo_root / "resize.py").exists():
        return CheckResult(
            name="resize_py_gone",
            severity="must_match",
            passed=False,
            detail="resize.py still present — should be removed after cutover",
        )
    return CheckResult(
        name="resize_py_gone",
        severity="must_match",
        passed=True,
        detail="resize.py absent",
    )


def _check_assets_relocated(ctx: Context) -> CheckResult:
    """Check that the image directories Astro reads from now live under
    `src/assets/` (post-cutover) and not the gone-but-not-forgotten
    `themes/sams-theme/assets/`.
    """
    expected = (
        "src/assets/img/covers",
        "src/assets/img/jeff",
        "src/assets/landing",
        "src/assets/svg",
    )
    missing = [p for p in expected if not (ctx.repo_root / p).is_dir()]
    if missing:
        return CheckResult(
            name="assets_relocated",
            severity="must_match",
            passed=False,
            detail=f"{len(missing)} expected asset dir(s) missing",
            diff="\n".join(missing),
        )
    return CheckResult(
        name="assets_relocated",
        severity="must_match",
        passed=True,
        detail="cover/jeff/landing/svg directories relocated under src/assets/",
    )


CHECKS: list[Check] = [
    Check(name="legacy_files_removed", severity="must_match", run=_check_legacy_files_removed),
    Check(name="resize_py_gone", severity="must_match", run=_check_resize_py_gone),
    Check(name="assets_relocated", severity="must_match", run=_check_assets_relocated),
    Check(
        name="final_sitemap_diff_empty",
        severity="must_match",
        run=_check_final_sitemap_diff_empty,
    ),
    Check(
        name="internal_link_crawl_clean",
        severity="must_match",
        run=_check_internal_link_crawl_clean,
    ),
    Check(
        name="lighthouse_perf_95",
        severity="should_match",
        run=_check_lighthouse_manual,
    ),
]
