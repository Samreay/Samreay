"""Phase 11 — Carry-overs.

See plans/11-carry-overs.md and references/gates-by-phase.md.

Phase 11 wires up the static-asset bridge (favicons, manifest, CV PDF,
robots.txt, joined videos) into Astro's `astro-public/`, confirms the
newsletter form survived, and asserts the AOS / Arrow.js dead-code
removal stuck.

Hugo still consumes the original copies under
`themes/sams-theme/static/` until Phase 14 cutover, so we *copy* into
`astro-public/` rather than `git mv` per the plan. The verifier asserts
both sides resolve.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.types import Check, CheckResult, Context  # noqa: E402

# Files the verifier expects in dist/ (i.e. shipped via astro-public/).
REQUIRED_ASSETS = (
    "CNAME",
    "favicon.ico",
    "favicon-16x16.png",
    "favicon-32x32.png",
    "apple-touch-icon.png",
    "android-chrome-192x192.png",
    "android-chrome-512x512.png",
    "mstile-150x150.png",
    "safari-pinned-tab.svg",
    "site.webmanifest",
    "browserconfig.xml",
    "robots.txt",
    "joined.mp4",
    "joined2.mp4",
    "static/resume/Samuel_Hinton_CV.pdf",
)


def _check_required_static_assets_present(ctx: Context) -> CheckResult:
    missing: list[str] = []
    for relpath in REQUIRED_ASSETS:
        if not (ctx.dist_dir / relpath).is_file():
            missing.append(relpath)
    if not missing:
        return CheckResult(
            name="required_static_assets_present",
            severity="must_match",
            passed=True,
            detail=f"{len(REQUIRED_ASSETS)} required static assets shipped to dist/",
        )
    return CheckResult(
        name="required_static_assets_present",
        severity="must_match",
        passed=False,
        detail=f"{len(missing)} required asset(s) missing from dist/",
        diff="\n".join(missing),
    )


def _check_cname_value(ctx: Context) -> CheckResult:
    cname_path = ctx.dist_dir / "CNAME"
    if not cname_path.is_file():
        return CheckResult(
            name="cname_value",
            severity="must_match",
            passed=False,
            detail="dist/CNAME missing",
        )
    expected = "cosmiccoding.com.au"
    actual = cname_path.read_text(encoding="utf-8").strip()
    if actual == expected:
        return CheckResult(
            name="cname_value",
            severity="must_match",
            passed=True,
            detail=f"dist/CNAME = {expected!r}",
        )
    return CheckResult(
        name="cname_value",
        severity="must_match",
        passed=False,
        detail=f"dist/CNAME = {actual!r} (expected {expected!r})",
    )


def _check_no_aos_in_src(ctx: Context) -> CheckResult:
    src = ctx.repo_root / "src"
    pattern = re.compile(r"\bdata-aos\b|aos\.css|window\.AOS\b|AOS\.init\b|new AOS\b")
    offenders: list[str] = []
    for path in src.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in {".astro", ".svelte", ".ts", ".tsx", ".js", ".jsx", ".scss", ".css"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if pattern.search(text):
            offenders.append(str(path.relative_to(ctx.repo_root)))
    if not offenders:
        return CheckResult(
            name="no_aos_in_src",
            severity="must_match",
            passed=True,
            detail="no AOS references in src/",
        )
    return CheckResult(
        name="no_aos_in_src",
        severity="must_match",
        passed=False,
        detail=f"{len(offenders)} files reference AOS",
        diff="\n".join(offenders),
    )


def _check_no_arrow_js_in_src(ctx: Context) -> CheckResult:
    """`arrow*.js` was the homegrown reactivity lib that powered the
    pre-Svelte interactive pages. Phase 8/9 replaced every usage; this
    check makes sure no copy survived in `src/` or `astro-public/`.
    """
    candidates = list((ctx.repo_root / "src").rglob("arrow*.js"))
    candidates += list((ctx.repo_root / "astro-public").rglob("arrow*.js"))
    if not candidates:
        return CheckResult(
            name="no_arrow_js_in_src",
            severity="must_match",
            passed=True,
            detail="no arrow*.js files found in src/ or astro-public/",
        )
    return CheckResult(
        name="no_arrow_js_in_src",
        severity="must_match",
        passed=False,
        detail=f"{len(candidates)} arrow*.js files still present",
        diff="\n".join(str(p.relative_to(ctx.repo_root)) for p in candidates),
    )


def _check_no_hugo_shortcodes_in_content(ctx: Context) -> CheckResult:
    """`{{< highlight ... >}}`, `{{< ico ... >}}` won't render under
    Astro's MDX/markdown pipeline. The plan asserts there are zero
    occurrences in content; this check guards against regressions.
    """
    content = ctx.repo_root / "content"
    pattern = re.compile(r"\{\{[<%]\s*(highlight|ico)\b")
    offenders: list[str] = []
    for path in content.rglob("*.md"):
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if pattern.search(text):
            offenders.append(str(path.relative_to(ctx.repo_root)))
            if len(offenders) > 10:
                break
    for path in content.rglob("*.mdx"):
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if pattern.search(text):
            offenders.append(str(path.relative_to(ctx.repo_root)))
            if len(offenders) > 10:
                break
    if not offenders:
        return CheckResult(
            name="no_hugo_shortcodes_in_content",
            severity="must_match",
            passed=True,
            detail="no Hugo shortcode calls in content/",
        )
    return CheckResult(
        name="no_hugo_shortcodes_in_content",
        severity="must_match",
        passed=False,
        detail=f"{len(offenders)} files still call Hugo shortcodes",
        diff="\n".join(offenders),
    )


def _check_newsletter_form_present(ctx: Context) -> CheckResult:
    """`<NewsletterForm />` ships on every review detail page. Sample
    one and verify the Mailchimp action URL plus success/error sentinel.
    """
    sample = ctx.dist_dir / "reviews" / "bobiverse" / "index.html"
    if not sample.is_file():
        return CheckResult(
            name="newsletter_form_present",
            severity="must_match",
            passed=False,
            detail="dist/reviews/bobiverse/index.html missing",
        )
    html = sample.read_text(encoding="utf-8", errors="ignore")
    needles = (
        "Cosmiccoding.us5.list-manage.com",
        "mce-success-response",
        'name="EMAIL"',
    )
    missing = [n for n in needles if n not in html]
    if not missing:
        return CheckResult(
            name="newsletter_form_present",
            severity="must_match",
            passed=True,
            detail="Mailchimp newsletter form rendered on sample review page",
        )
    return CheckResult(
        name="newsletter_form_present",
        severity="must_match",
        passed=False,
        detail=f"newsletter form sentinels missing: {', '.join(missing)}",
    )


def _check_discord_link_consistent(ctx: Context) -> CheckResult:
    """All references to the Discord invite should use a single URL —
    https://discord.gg/tfn4HVEaDz. Mismatched copies show up if a
    component was forked and never re-synced.
    """
    src = ctx.repo_root / "src"
    expected = "tfn4HVEaDz"
    discord_re = re.compile(r"discord\.gg/([A-Za-z0-9]+)")
    seen: set[str] = set()
    for path in src.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in {".astro", ".svelte", ".ts", ".tsx", ".js", ".jsx"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for match in discord_re.findall(text):
            seen.add(match)
    if not seen:
        # No discord references at all — odd, but not necessarily a bug.
        return CheckResult(
            name="discord_link_consistent",
            severity="should_match",
            passed=False,
            detail="no Discord URLs found in src/",
        )
    if seen == {expected}:
        return CheckResult(
            name="discord_link_consistent",
            severity="must_match",
            passed=True,
            detail=f"all Discord URLs use the canonical invite ({expected})",
        )
    return CheckResult(
        name="discord_link_consistent",
        severity="must_match",
        passed=False,
        detail=f"multiple Discord invites in use: {sorted(seen)}",
    )


CHECKS: list[Check] = [
    Check(
        name="required_static_assets_present",
        severity="must_match",
        run=_check_required_static_assets_present,
    ),
    Check(name="cname_value", severity="must_match", run=_check_cname_value),
    Check(name="no_aos_in_src", severity="must_match", run=_check_no_aos_in_src),
    Check(name="no_arrow_js_in_src", severity="must_match", run=_check_no_arrow_js_in_src),
    Check(
        name="no_hugo_shortcodes_in_content",
        severity="must_match",
        run=_check_no_hugo_shortcodes_in_content,
    ),
    Check(
        name="newsletter_form_present",
        severity="must_match",
        run=_check_newsletter_form_present,
    ),
    Check(
        name="discord_link_consistent",
        severity="must_match",
        run=_check_discord_link_consistent,
    ),
]
