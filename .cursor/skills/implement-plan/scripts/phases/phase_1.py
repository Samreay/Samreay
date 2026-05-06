"""Phase 1 — Scaffolding.

See plans/1-scaffolding.md and references/gates-by-phase.md.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.builds import astro_initialised  # noqa: E402
from lib.types import Check, CheckResult, Context  # noqa: E402

REQUIRED_DEPS = [
    "astro",
    "@astrojs/svelte",
    "@astrojs/mdx",
    "@astrojs/sitemap",
    "@astrojs/check",
    "@astrojs/tailwind",
    "svelte",
    "tailwindcss",
    "sass",
    "sharp",
    "remark-math",
    "rehype-katex",
    "katex",
    "js-yaml",
    "gray-matter",
    "glob",
]

REQUIRED_GITIGNORE_ENTRIES = ["dist/", ".astro/", "node_modules/.astro/"]

HUGO_PROTECTED_PATHS = [
    "themes/",
    "hugo.toml",
    "archetypes/",
    "data/",
    "Makefile",
    "builder/",
    "resize.py",
    "pyproject.toml",
]


def _check_dist_index(ctx: Context) -> CheckResult:
    index = ctx.dist_dir / "index.html"
    if not index.exists():
        return CheckResult(
            name="dist_index_exists",
            severity="must_match",
            passed=False,
            detail=f"{index} missing — run `npm run build` first or fix Astro entry",
        )
    if index.stat().st_size == 0:
        return CheckResult(
            name="dist_index_exists",
            severity="must_match",
            passed=False,
            detail="dist/index.html is empty",
        )
    return CheckResult(
        name="dist_index_exists",
        severity="must_match",
        passed=True,
        detail=f"{index.stat().st_size} bytes",
    )


def _check_package_json_deps(ctx: Context) -> CheckResult:
    pkg_path = ctx.repo_root / "package.json"
    if not pkg_path.exists():
        return CheckResult(
            name="package_json_deps",
            severity="must_match",
            passed=False,
            detail="package.json missing",
        )
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    declared = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    missing = [d for d in REQUIRED_DEPS if d not in declared]
    if missing:
        return CheckResult(
            name="package_json_deps",
            severity="must_match",
            passed=False,
            detail=f"missing deps: {', '.join(missing)}",
            diff=json.dumps(declared, indent=2),
        )
    return CheckResult(
        name="package_json_deps",
        severity="must_match",
        passed=True,
        detail=f"all {len(REQUIRED_DEPS)} required deps declared",
    )


def _check_gitignore(ctx: Context) -> CheckResult:
    gi = ctx.repo_root / ".gitignore"
    if not gi.exists():
        return CheckResult(
            name="gitignore_entries",
            severity="must_match",
            passed=False,
            detail=".gitignore missing",
        )
    content = gi.read_text(encoding="utf-8")
    missing = [e for e in REQUIRED_GITIGNORE_ENTRIES if e not in content]
    if missing:
        return CheckResult(
            name="gitignore_entries",
            severity="must_match",
            passed=False,
            detail=f"missing entries: {', '.join(missing)}",
        )
    return CheckResult(
        name="gitignore_entries",
        severity="must_match",
        passed=True,
        detail="dist/, .astro/, node_modules/.astro/ all present",
    )


def _check_astro_config(ctx: Context) -> CheckResult:
    cfg = ctx.repo_root / "astro.config.mjs"
    if not cfg.exists():
        return CheckResult(
            name="astro_config_exists",
            severity="must_match",
            passed=False,
            detail="astro.config.mjs missing",
        )
    text = cfg.read_text(encoding="utf-8")
    requirements = {
        "site cosmiccoding.com.au": "cosmiccoding.com.au" in text,
        "output: 'static'": re.search(r"output:\s*['\"]static['\"]", text) is not None,
        "trailingSlash: 'always'": re.search(r"trailingSlash:\s*['\"]always['\"]", text) is not None,
    }
    missing = [k for k, ok in requirements.items() if not ok]
    if missing:
        return CheckResult(
            name="astro_config_exists",
            severity="must_match",
            passed=False,
            detail=f"missing config: {', '.join(missing)}",
            diff=text[:1000],
        )
    return CheckResult(
        name="astro_config_exists",
        severity="must_match",
        passed=True,
        detail="site, output, trailingSlash all set correctly",
    )


def _check_hugo_files_untouched(ctx: Context) -> CheckResult:
    if ctx.prev_gate is None:
        return CheckResult(
            name="hugo_files_untouched",
            severity="should_match",
            passed=True,
            detail="phase 1 — no prior gate; baseline is the working tree at run time",
        )
    prev_rev = ctx.prev_gate.get("git_rev")
    if not prev_rev:
        return CheckResult(
            name="hugo_files_untouched",
            severity="should_match",
            passed=True,
            detail="prior gate has no git_rev",
        )
    proc = subprocess.run(
        ["git", "diff", "--name-only", f"{prev_rev}..HEAD"],
        cwd=ctx.repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    changed = [line for line in proc.stdout.splitlines() if line.strip()]
    bad = [
        c
        for c in changed
        if any(c == p.rstrip("/") or c.startswith(p) for p in HUGO_PROTECTED_PATHS)
    ]
    if bad:
        return CheckResult(
            name="hugo_files_untouched",
            severity="should_match",
            passed=False,
            detail=f"{len(bad)} Hugo files modified since previous gate",
            diff="\n".join(bad),
        )
    return CheckResult(
        name="hugo_files_untouched",
        severity="should_match",
        passed=True,
        detail="no Hugo files touched",
    )


CHECKS: list[Check] = [
    Check(
        name="dist_index_exists",
        severity="must_match",
        run=_check_dist_index,
        skip_if=lambda ctx: not astro_initialised(ctx.repo_root),
    ),
    Check(
        name="package_json_deps",
        severity="must_match",
        run=_check_package_json_deps,
    ),
    Check(
        name="gitignore_entries",
        severity="must_match",
        run=_check_gitignore,
    ),
    Check(
        name="astro_config_exists",
        severity="must_match",
        run=_check_astro_config,
    ),
    Check(
        name="hugo_files_untouched",
        severity="should_match",
        run=_check_hugo_files_untouched,
    ),
]
