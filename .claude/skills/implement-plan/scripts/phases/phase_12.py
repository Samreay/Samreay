"""Phase 12 — Aliases as redirects.

See plans/12-aliases-redirects.md and references/gates-by-phase.md.

Hugo treated every entry under `aliases:` in a page's frontmatter as a
redirect, emitting a tiny `<meta http-equiv=refresh>` HTML stub at the
alias URL that points at the canonical page. Astro doesn't read
frontmatter for this — `astro.config.mjs` exposes a flat `redirects`
map. Phase 12 wires `scripts/collect-redirects.mjs` into that map and
this verifier confirms parity with Hugo.

Three gates, all `must_match`:

1. `every_alias_in_config` — every non-self-looping, non-canonical-
   colliding alias from `content/{reviews,blogs,tutorials}/*/index.{md,mdx}`
   appears as a key in the resolved `astro.config.mjs.redirects` map.
2. `every_alias_emits_html` — for each entry in that map, `dist/` has a
   redirect HTML file with `http-equiv="refresh"` at the alias path.
3. `alias_url_parity` — set diff of alias paths vs Hugo's emitted alias
   files (in `public/`) is empty (both directions).

The matchers are deliberately tolerant of path-shape differences:
`trailingSlash: 'always'` means Astro emits redirect *folders* with an
`index.html` inside (`/foo/bar.html/index.html`), whereas Hugo writes a
literal file (`/foo/bar.html`). The verifier normalises both to a
canonical "alias path with trailing-slash unless the basename ends in
`.html`" form so the comparison is meaningful.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.types import Check, CheckResult, Context  # noqa: E402

CONTENT_GLOBS = (
    "content/reviews",
    "content/blogs",
    "content/tutorials",
)

REFRESH_RE = re.compile(r"http-equiv\s*=\s*[\"']?refresh", re.IGNORECASE)


def _normalise_alias(value: str) -> str:
    """Replicate `scripts/collect-redirects.mjs::normalise`."""
    if not value:
        return ""
    out = value.strip()
    if not out.startswith("/"):
        out = "/" + out
    if not out.endswith("/"):
        out += "/"
    return out


def _parse_frontmatter(path: Path) -> dict[str, Any] | None:
    text = path.read_text(encoding="utf-8", errors="ignore")
    if not text.startswith("---"):
        return None
    closing = text.find("\n---", 3)
    if closing == -1:
        return None
    block = text[3:closing].lstrip("\n")
    try:
        return yaml.safe_load(block) or {}
    except yaml.YAMLError:
        return None


def _expected_aliases(repo_root: Path) -> tuple[dict[str, str], set[str]]:
    """Walk every content entry and produce the alias→target map exactly
    like the JS collector does, plus the canonical URL set used to skip
    collisions.
    """
    canonical: set[str] = set()
    entries: list[tuple[str, str, list[str]]] = []
    for sub in CONTENT_GLOBS:
        for index in (repo_root / sub).glob("*/index.*"):
            if index.suffix not in {".md", ".mdx"}:
                continue
            collection = index.parent.parent.name
            slug = index.parent.name
            target = _normalise_alias(f"/{collection}/{slug}")
            canonical.add(target)
            data = _parse_frontmatter(index) or {}
            raw = data.get("aliases")
            if raw is None:
                continue
            if isinstance(raw, str):
                raw = [raw]
            entries.append((target, str(index.relative_to(repo_root)), [str(a) for a in raw]))

    aliases: dict[str, str] = {}
    for target, _src, raw in entries:
        for alias in raw:
            from_ = _normalise_alias(alias)
            if not from_ or from_ == target:
                continue
            if from_ in canonical:
                continue  # real-content collision; Hugo also drops these
            if from_ in aliases and aliases[from_] != target:
                continue  # first-claim wins, matching the JS collector
            aliases[from_] = target
    return aliases, canonical


def _astro_config_redirects(repo_root: Path) -> dict[str, str]:
    """Spawn Node and import `astro.config.mjs` to resolve the actual
    redirects object. Going through the live config (rather than re-
    parsing it) means we cover the case where someone bypasses the
    collector and adds a static `redirects: { ... }` map.
    """
    node = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            (
                "const { default: cfg } = await import("
                "  new URL('./astro.config.mjs', 'file://' + process.cwd() + '/').href"
                ");\n"
                "process.stdout.write(JSON.stringify(cfg.redirects ?? {}));\n"
            ),
        ],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if node.returncode != 0:
        raise RuntimeError(f"failed to resolve astro.config.mjs redirects: {node.stderr.strip()}")
    parsed = json.loads(node.stdout or "{}")
    out: dict[str, str] = {}
    for k, v in parsed.items():
        if isinstance(v, str):
            out[k] = v
        elif isinstance(v, dict) and "destination" in v:
            out[k] = v["destination"]
    return out


def _redirect_paths_in(dir_: Path) -> set[str]:
    """All paths under `dir_` whose HTML contains an
    `http-equiv=refresh` meta tag, normalised to a canonical alias form
    so Astro folders and Hugo literal files line up.
    """
    out: set[str] = set()
    if not dir_.is_dir():
        return out
    for html in dir_.rglob("*.html"):
        try:
            text = html.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if "http-equiv" not in text:
            continue
        if not REFRESH_RE.search(text):
            continue
        rel = html.relative_to(dir_).as_posix()
        # Hugo writes literal `.html` files for aliases that already end
        # in `.html`; Astro wraps them in a folder. Normalise to a single
        # form (trailing slash, no `index.html` suffix, drop the trailing
        # slash if the alias's basename ends in `.html`).
        if rel.endswith("/index.html"):
            rel = rel[: -len("index.html")]  # keep the trailing slash
        path = "/" + rel
        if path.endswith(".html/"):
            path = path[:-1]
        out.add(path)
    return out


def _alias_keys_for_compare(aliases: dict[str, str]) -> set[str]:
    """Match the normalisation in `_redirect_paths_in`."""
    out: set[str] = set()
    for key in aliases:
        norm = key
        if norm.endswith(".html/"):
            norm = norm[:-1]
        out.add(norm)
    return out


def _check_every_alias_in_config(ctx: Context) -> CheckResult:
    expected, _ = _expected_aliases(ctx.repo_root)
    try:
        configured = _astro_config_redirects(ctx.repo_root)
    except RuntimeError as exc:
        return CheckResult(
            name="every_alias_in_config",
            severity="must_match",
            passed=False,
            detail=str(exc),
        )
    missing = sorted(set(expected) - set(configured))
    mismatched = sorted(
        f"{k}: expected -> {expected[k]}, got -> {configured[k]}"
        for k in expected
        if k in configured and configured[k] != expected[k]
    )
    if not missing and not mismatched:
        return CheckResult(
            name="every_alias_in_config",
            severity="must_match",
            passed=True,
            detail=f"{len(expected)} aliases declared in frontmatter all present in redirects map",
        )
    diff_lines: list[str] = []
    if missing:
        diff_lines.append(f"missing {len(missing)} alias(es):")
        diff_lines.extend("  " + m for m in missing[:20])
        if len(missing) > 20:
            diff_lines.append(f"  ...and {len(missing) - 20} more")
    if mismatched:
        diff_lines.append(f"target mismatch on {len(mismatched)} alias(es):")
        diff_lines.extend("  " + m for m in mismatched[:20])
    return CheckResult(
        name="every_alias_in_config",
        severity="must_match",
        passed=False,
        detail=f"{len(missing)} missing, {len(mismatched)} retargeted",
        diff="\n".join(diff_lines),
    )


def _check_every_alias_emits_html(ctx: Context) -> CheckResult:
    try:
        configured = _astro_config_redirects(ctx.repo_root)
    except RuntimeError as exc:
        return CheckResult(
            name="every_alias_emits_html",
            severity="must_match",
            passed=False,
            detail=str(exc),
        )
    expected_keys = _alias_keys_for_compare(configured)
    emitted = _redirect_paths_in(ctx.dist_dir)
    missing = sorted(expected_keys - emitted)
    if not missing:
        return CheckResult(
            name="every_alias_emits_html",
            severity="must_match",
            passed=True,
            detail=f"{len(expected_keys)} redirect HTML stubs all present in dist/",
        )
    diff_lines = [f"missing {len(missing)} stub(s):"] + ["  " + m for m in missing[:20]]
    if len(missing) > 20:
        diff_lines.append(f"  ...and {len(missing) - 20} more")
    return CheckResult(
        name="every_alias_emits_html",
        severity="must_match",
        passed=False,
        detail=f"{len(missing)}/{len(expected_keys)} aliases not emitted to dist/",
        diff="\n".join(diff_lines),
    )


def _check_alias_url_parity(ctx: Context) -> CheckResult:
    astro_paths = _redirect_paths_in(ctx.dist_dir)
    hugo_paths = _redirect_paths_in(ctx.public_dir)
    only_astro = sorted(astro_paths - hugo_paths)
    only_hugo = sorted(hugo_paths - astro_paths)
    if not only_astro and not only_hugo:
        return CheckResult(
            name="alias_url_parity",
            severity="must_match",
            passed=True,
            detail=f"both Hugo and Astro emit the same {len(astro_paths)} alias URL(s)",
        )
    diff_lines: list[str] = []
    if only_astro:
        diff_lines.append(f"only in Astro ({len(only_astro)}):")
        diff_lines.extend("  " + p for p in only_astro[:20])
    if only_hugo:
        diff_lines.append(f"only in Hugo ({len(only_hugo)}):")
        diff_lines.extend("  " + p for p in only_hugo[:20])
    return CheckResult(
        name="alias_url_parity",
        severity="must_match",
        passed=False,
        detail=f"alias URL set differs (only_astro={len(only_astro)}, only_hugo={len(only_hugo)})",
        diff="\n".join(diff_lines),
    )


def _check_sitemap_excludes_redirects(ctx: Context) -> CheckResult:
    """Belt-and-braces: confirm `dist/sitemap-0.xml` doesn't list any of
    the alias URLs (search engines should index the canonical only).
    `@astrojs/sitemap` already excludes redirects by default; this check
    catches future regressions if anyone toggles that off.
    """
    sitemap = ctx.dist_dir / "sitemap-0.xml"
    if not sitemap.is_file():
        # Some setups produce only `sitemap-index.xml`; fall back.
        sitemap = ctx.dist_dir / "sitemap-index.xml"
    if not sitemap.is_file():
        return CheckResult(
            name="sitemap_excludes_redirects",
            severity="should_match",
            passed=False,
            detail="no sitemap file in dist/",
        )
    try:
        configured = _astro_config_redirects(ctx.repo_root)
    except RuntimeError as exc:
        return CheckResult(
            name="sitemap_excludes_redirects",
            severity="should_match",
            passed=False,
            detail=str(exc),
        )
    text = sitemap.read_text(encoding="utf-8", errors="ignore")
    # `@astrojs/sitemap` emits `<loc>https://cosmiccoding.com.au/path/</loc>`
    # entries. Pull the full `<loc>` set so a substring like `/wordle`
    # doesn't match `/tutorials/wordle/`.
    locs = {m.group(1) for m in re.finditer(r"<loc>([^<]+)</loc>", text)}
    paths_in_sitemap = set()
    for loc in locs:
        path = re.sub(r"^https?://[^/]+", "", loc)
        if not path.endswith("/"):
            path += "/"
        paths_in_sitemap.add(path)
    leaks = sorted(alias for alias in configured if alias in paths_in_sitemap)
    if not leaks:
        return CheckResult(
            name="sitemap_excludes_redirects",
            severity="should_match",
            passed=True,
            detail=f"sitemap contains 0 of {len(configured)} alias URLs",
        )
    diff = "\n".join("  " + leak for leak in leaks[:20])
    return CheckResult(
        name="sitemap_excludes_redirects",
        severity="should_match",
        passed=False,
        detail=f"{len(leaks)} alias URL(s) leaked into sitemap",
        diff=diff,
    )


CHECKS: list[Check] = [
    Check(
        name="every_alias_in_config",
        severity="must_match",
        run=_check_every_alias_in_config,
    ),
    Check(
        name="every_alias_emits_html",
        severity="must_match",
        run=_check_every_alias_emits_html,
    ),
    Check(name="alias_url_parity", severity="must_match", run=_check_alias_url_parity),
    Check(
        name="sitemap_excludes_redirects",
        severity="should_match",
        run=_check_sitemap_excludes_redirects,
    ),
]
