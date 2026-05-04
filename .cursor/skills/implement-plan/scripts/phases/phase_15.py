"""Phase 15 — Best-practice & post-Hugo cleanup.

See plans/15-best-practice-cleanup.md.

This phase doesn't add functionality; it sweeps the repo for stale Hugo /
AlpineJS / AOS references, swaps the legacy Mailchimp form for Mailerlite,
trims unused Python deps, removes the now-orphaned `data/artists.yml`, and
filters the `/kitchensink/` dev page out of the production sitemap.

The verifier treats those changes as acceptance criteria — re-running the
gate after a regression should fail the relevant check.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.types import Check, CheckResult, Context  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAILERLITE_ACTION = (
    "https://assets.mailerlite.com/jsonp/2036924/forms/176526142171252164/subscribe"
)
MAILERLITE_CALLBACK = "ml_webform_success_35716688"

# Substrings that should not appear anywhere under `src/` (case-insensitive).
# Each entry is `(needle, allow_glob)` where allow_glob is a list of repo-
# relative path prefixes that are allowed to keep matching (e.g. asset
# filenames that happen to contain "alpine"). Empty list means no exemption.
FORBIDDEN_SUBSTRINGS: tuple[tuple[str, tuple[str, ...]], ...] = (
    # Mailchimp specifically — the new form is Mailerlite.
    ("mailchimp", ()),
    ("mc-embedded", ()),
    ("list-manage.com", ()),
    # AlpineJS / AOS / cruip — replaced by Svelte islands.
    ("alpinejs", ()),
    ("x-data=", ()),
    ("x-show=", ()),
    ("data-aos=", ()),
    ("cruip-js-toolkit", ()),
)

# Stems of the data files whose Phase-4 mirror header must no longer claim
# Hugo is the source of truth.
DATA_TS_FILES: tuple[str, ...] = (
    "artists",
    "books",
    "categories",
    "courses",
    "other",
    "podcasts",
    "status",
)

# Python deps that were Hugo-pipeline specific and shouldn't be in
# pyproject.toml anymore.
RETIRED_PY_DEPS: tuple[str, ...] = (
    "jupyter-contrib-nbextensions",
    "notebook==6.4.12",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def _walk_text_files(root: Path, skip_dirs: tuple[str, ...]) -> list[Path]:
    """Iterate text-ish files under `root`, skipping anything inside
    `skip_dirs`."""
    out: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in skip_dirs for part in path.parts):
            continue
        # Skip obvious binaries
        if path.suffix.lower() in {
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".gif",
            ".ico",
            ".pdf",
            ".mp4",
            ".woff",
            ".woff2",
            ".zip",
        }:
            continue
        out.append(path)
    return out


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------


def _check_artists_yml_removed(ctx: Context) -> CheckResult:
    """`data/artists.yml` was a Hugo-era YAML mirror; the canonical roster
    lives at `src/data/artists.ts` and the `find-artists` skill writes
    there directly."""
    yml = ctx.repo_root / "data" / "artists.yml"
    parent = ctx.repo_root / "data"
    leftovers: list[str] = []
    if yml.exists():
        leftovers.append(str(yml.relative_to(ctx.repo_root)))
    if parent.is_dir() and any(parent.iterdir()):
        leftovers.append(
            f"{parent.relative_to(ctx.repo_root)}/ still has entries: "
            f"{[p.name for p in parent.iterdir()]}"
        )
    if leftovers:
        return CheckResult(
            name="artists_yml_removed",
            severity="must_match",
            passed=False,
            detail="data/artists.yml or data/ should be gone",
            diff="\n".join(leftovers),
        )
    return CheckResult(
        name="artists_yml_removed",
        severity="must_match",
        passed=True,
        detail="data/artists.yml absent and data/ removed",
    )


def _check_newsletter_is_mailerlite(ctx: Context) -> CheckResult:
    """The single `<NewsletterForm>` component must point at the Mailerlite
    endpoint and the home-page Books section must use it (no inline form)."""
    newsletter = ctx.repo_root / "src" / "components" / "NewsletterForm.astro"
    books = ctx.repo_root / "src" / "components" / "sections" / "Books.astro"
    failures: list[str] = []

    nl_text = _read(newsletter)
    if MAILERLITE_ACTION not in nl_text:
        failures.append(f"NewsletterForm.astro missing action {MAILERLITE_ACTION}")
    if MAILERLITE_CALLBACK not in nl_text:
        failures.append(f"NewsletterForm.astro missing callback {MAILERLITE_CALLBACK}()")

    books_text = _read(books)
    if "NewsletterForm" not in books_text:
        failures.append("Books.astro does not import/render <NewsletterForm>")
    if "list-manage.com" in books_text or "mc-embedded" in books_text:
        failures.append("Books.astro still ships an inline Mailchimp form")
    # The whole point of consolidation is that Books.astro stops carrying
    # form markup itself.
    if "<form" in books_text:
        failures.append("Books.astro still has an inline <form> (should defer to NewsletterForm)")

    if failures:
        return CheckResult(
            name="newsletter_is_mailerlite",
            severity="must_match",
            passed=False,
            detail="newsletter form is not consolidated/mailerlite-backed",
            diff="\n".join(failures),
        )
    return CheckResult(
        name="newsletter_is_mailerlite",
        severity="must_match",
        passed=True,
        detail="<NewsletterForm> uses Mailerlite and Books.astro consumes it",
    )


def _check_dist_pages_render_mailerlite(ctx: Context) -> CheckResult:
    """Built sample pages must contain the Mailerlite endpoint, callback,
    and the Mailerlite field name `fields[email]` (vs. Mailchimp's
    `EMAIL`)."""
    samples = (
        ctx.dist_dir / "reviews" / "bobiverse" / "index.html",
        ctx.dist_dir / "blogs" / "2023_07_writing_update" / "index.html",
        ctx.dist_dir / "index.html",  # home page Books section
    )
    needles = (
        MAILERLITE_ACTION,
        MAILERLITE_CALLBACK,
        'name="fields[email]"',
    )
    failures: list[str] = []
    for sample in samples:
        if not sample.is_file():
            failures.append(f"missing built page: {sample.relative_to(ctx.repo_root)}")
            continue
        text = _read(sample)
        for needle in needles:
            if needle not in text:
                failures.append(
                    f"{sample.relative_to(ctx.dist_dir)} missing {needle!r}"
                )
        for stale in ("mc-embedded-subscribe", "list-manage.com"):
            if stale in text:
                failures.append(
                    f"{sample.relative_to(ctx.dist_dir)} still references {stale!r}"
                )
    if failures:
        return CheckResult(
            name="dist_pages_render_mailerlite",
            severity="must_match",
            passed=False,
            detail="rendered pages don't show the Mailerlite form cleanly",
            diff="\n".join(failures),
        )
    return CheckResult(
        name="dist_pages_render_mailerlite",
        severity="must_match",
        passed=True,
        detail="3 sample pages render the Mailerlite form with no Mailchimp leftovers",
    )


def _check_no_hugo_or_alpine_in_src(ctx: Context) -> CheckResult:
    """Sweep `src/`, `astro.config.mjs`, `Makefile`, `package.json`, and
    `scripts/` for any forbidden substring (Mailchimp, AlpineJS attrs,
    AOS attrs, cruip)."""
    targets: list[Path] = []
    targets.extend(_walk_text_files(ctx.repo_root / "src", skip_dirs=()))
    for extra in ("astro.config.mjs", "Makefile", "package.json"):
        path = ctx.repo_root / extra
        if path.is_file():
            targets.append(path)
    scripts_dir = ctx.repo_root / "scripts"
    if scripts_dir.is_dir():
        targets.extend(_walk_text_files(scripts_dir, skip_dirs=()))

    offenders: list[str] = []
    for path in targets:
        text = _read(path).lower()
        for needle, _allow in FORBIDDEN_SUBSTRINGS:
            if needle in text:
                # Allow the migration plan/doc files inside src/ (none today).
                rel = path.relative_to(ctx.repo_root)
                offenders.append(f"{rel}: contains {needle!r}")
    if offenders:
        return CheckResult(
            name="no_hugo_or_alpine_in_src",
            severity="must_match",
            passed=False,
            detail=f"{len(offenders)} forbidden references survive in src/scripts/config",
            diff="\n".join(offenders[:30]),
        )
    return CheckResult(
        name="no_hugo_or_alpine_in_src",
        severity="must_match",
        passed=True,
        detail="src/, scripts/, astro.config.mjs, Makefile, package.json are clean",
    )


def _check_no_hugo_generator_meta(ctx: Context) -> CheckResult:
    """The site should advertise itself as Astro, not Hugo. Spot-check a
    handful of built pages."""
    samples = (
        ctx.dist_dir / "index.html",
        ctx.dist_dir / "reviews" / "bobiverse" / "index.html",
        ctx.dist_dir / "blogs" / "2023_07_writing_update" / "index.html",
    )
    failures: list[str] = []
    for sample in samples:
        if not sample.is_file():
            continue
        text = _read(sample)
        m = re.search(r'<meta\s+name="generator"[^>]*content="([^"]+)"', text)
        if not m:
            failures.append(f"{sample.relative_to(ctx.dist_dir)}: no generator meta")
            continue
        content = m.group(1)
        if "Hugo" in content:
            failures.append(f"{sample.relative_to(ctx.dist_dir)}: generator='{content}' (still Hugo)")
        elif "Astro" not in content:
            failures.append(f"{sample.relative_to(ctx.dist_dir)}: generator='{content}' (not Astro)")
    if failures:
        return CheckResult(
            name="no_hugo_generator_meta",
            severity="must_match",
            passed=False,
            detail="<meta name='generator'> still claims Hugo",
            diff="\n".join(failures),
        )
    return CheckResult(
        name="no_hugo_generator_meta",
        severity="must_match",
        passed=True,
        detail="generator meta is Astro on sampled pages",
    )


def _check_data_ts_headers_updated(ctx: Context) -> CheckResult:
    """`src/data/*.ts` headers should no longer claim 'Hugo still reads the
    source YAML'."""
    failures: list[str] = []
    for stem in DATA_TS_FILES:
        path = ctx.repo_root / "src" / "data" / f"{stem}.ts"
        if not path.is_file():
            failures.append(f"src/data/{stem}.ts missing")
            continue
        head = _read(path).splitlines()[:5]
        for line in head:
            if "Hugo still reads" in line:
                failures.append(f"src/data/{stem}.ts: header still says 'Hugo still reads…'")
                break
            if re.search(r"Generated from data/.*\.yml \(Phase 4 mirror\)", line):
                failures.append(
                    f"src/data/{stem}.ts: header still claims it's a generated mirror"
                )
                break
    if failures:
        return CheckResult(
            name="data_ts_headers_updated",
            severity="must_match",
            passed=False,
            detail="src/data/*.ts headers still describe the file as a Hugo mirror",
            diff="\n".join(failures),
        )
    return CheckResult(
        name="data_ts_headers_updated",
        severity="must_match",
        passed=True,
        detail=f"{len(DATA_TS_FILES)} data files describe themselves as canonical",
    )


def _check_pyproject_trimmed(ctx: Context) -> CheckResult:
    """`pyproject.toml` should not list any Hugo-pipeline-specific deps."""
    pyproject = ctx.repo_root / "pyproject.toml"
    if not pyproject.is_file():
        return CheckResult(
            name="pyproject_trimmed",
            severity="must_match",
            passed=False,
            detail="pyproject.toml missing",
        )
    text = _read(pyproject)
    offenders = [dep for dep in RETIRED_PY_DEPS if dep in text]
    if offenders:
        return CheckResult(
            name="pyproject_trimmed",
            severity="must_match",
            passed=False,
            detail="pyproject.toml still pins retired Hugo-pipeline deps",
            diff="\n".join(offenders),
        )
    return CheckResult(
        name="pyproject_trimmed",
        severity="must_match",
        passed=True,
        detail=f"pyproject.toml drops {len(RETIRED_PY_DEPS)} Hugo-era deps",
    )


def _check_uv_lock_in_sync(ctx: Context) -> CheckResult:
    """`uv lock --check` exits zero when the lockfile is in sync."""
    proc = subprocess.run(
        ["uv", "lock", "--check"],
        cwd=ctx.repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode == 0:
        return CheckResult(
            name="uv_lock_in_sync",
            severity="must_match",
            passed=True,
            detail="uv lock --check passes",
        )
    return CheckResult(
        name="uv_lock_in_sync",
        severity="must_match",
        passed=False,
        detail="uv lock --check failed; run `uv lock` to refresh",
        diff=(proc.stderr or proc.stdout)[-1500:],
    )


def _check_kitchensink_excluded_from_sitemap(ctx: Context) -> CheckResult:
    """`/kitchensink/` is a visual-test playground. The page itself must
    still build (Playwright targets it directly), but it must not be
    advertised in the production sitemap."""
    page = ctx.dist_dir / "kitchensink" / "index.html"
    if not page.is_file():
        return CheckResult(
            name="kitchensink_excluded_from_sitemap",
            severity="must_match",
            passed=False,
            detail="dist/kitchensink/index.html is missing — Playwright baseline would 404",
        )
    sitemaps = list(ctx.dist_dir.glob("sitemap*.xml"))
    if not sitemaps:
        return CheckResult(
            name="kitchensink_excluded_from_sitemap",
            severity="must_match",
            passed=False,
            detail="dist/sitemap*.xml not generated",
        )
    leaks: list[str] = []
    for sitemap in sitemaps:
        text = _read(sitemap)
        if "/kitchensink" in text:
            leaks.append(sitemap.name)
    if leaks:
        return CheckResult(
            name="kitchensink_excluded_from_sitemap",
            severity="must_match",
            passed=False,
            detail="/kitchensink/ is leaking into the production sitemap",
            diff="\n".join(leaks),
        )
    return CheckResult(
        name="kitchensink_excluded_from_sitemap",
        severity="must_match",
        passed=True,
        detail="kitchensink ships to dist/ but is filtered out of sitemap*.xml",
    )


def _check_readme_not_empty(ctx: Context) -> CheckResult:
    """Empty `README.md` was a long-standing irritant. Phase 15 fills it
    with at least a one-paragraph description plus dev commands."""
    readme = ctx.repo_root / "README.md"
    if not readme.is_file():
        return CheckResult(
            name="readme_not_empty",
            severity="must_match",
            passed=False,
            detail="README.md missing",
        )
    text = _read(readme)
    stripped = text.strip()
    if len(stripped) < 200:
        return CheckResult(
            name="readme_not_empty",
            severity="must_match",
            passed=False,
            detail=f"README.md is too short ({len(stripped)} chars after strip)",
        )
    needles_any = ("Astro", "astro")
    needles_dev = ("npm run build", "make blog", "make prod", "npm run dev")
    if not any(n in text for n in needles_any):
        return CheckResult(
            name="readme_not_empty",
            severity="must_match",
            passed=False,
            detail="README.md doesn't mention Astro",
        )
    if not any(n in text for n in needles_dev):
        return CheckResult(
            name="readme_not_empty",
            severity="must_match",
            passed=False,
            detail="README.md doesn't surface a local dev command",
        )
    return CheckResult(
        name="readme_not_empty",
        severity="must_match",
        passed=True,
        detail=f"README.md is non-empty ({len(stripped)} chars) and mentions Astro + dev commands",
    )


CHECKS: list[Check] = [
    Check(name="artists_yml_removed", severity="must_match", run=_check_artists_yml_removed),
    Check(
        name="newsletter_is_mailerlite",
        severity="must_match",
        run=_check_newsletter_is_mailerlite,
    ),
    Check(
        name="dist_pages_render_mailerlite",
        severity="must_match",
        run=_check_dist_pages_render_mailerlite,
    ),
    Check(
        name="no_hugo_or_alpine_in_src",
        severity="must_match",
        run=_check_no_hugo_or_alpine_in_src,
    ),
    Check(
        name="no_hugo_generator_meta",
        severity="must_match",
        run=_check_no_hugo_generator_meta,
    ),
    Check(
        name="data_ts_headers_updated",
        severity="must_match",
        run=_check_data_ts_headers_updated,
    ),
    Check(name="pyproject_trimmed", severity="must_match", run=_check_pyproject_trimmed),
    Check(name="uv_lock_in_sync", severity="must_match", run=_check_uv_lock_in_sync),
    Check(
        name="kitchensink_excluded_from_sitemap",
        severity="must_match",
        run=_check_kitchensink_excluded_from_sitemap,
    ),
    Check(name="readme_not_empty", severity="must_match", run=_check_readme_not_empty),
]
