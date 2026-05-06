"""Universal checks that run for every phase."""

from __future__ import annotations

import subprocess
from pathlib import Path

from .builds import astro_initialised, run_astro_build, run_astro_check, run_hugo
from .types import Check, CheckResult, Context


def _check_hugo_builds(ctx: Context) -> CheckResult:
    result = run_hugo(ctx.repo_root)
    if result.succeeded:
        return CheckResult(
            name="hugo_builds",
            severity="must_match",
            passed=True,
            detail=f"hugo built in {result.elapsed_s:.1f}s",
        )
    return CheckResult(
        name="hugo_builds",
        severity="must_match",
        passed=False,
        detail=f"hugo failed (exit, {result.elapsed_s:.1f}s)",
        diff=result.stderr[-2000:] or result.stdout[-2000:],
    )


def _check_astro_builds(ctx: Context) -> CheckResult:
    if not astro_initialised(ctx.repo_root):
        return CheckResult(
            name="astro_builds",
            severity="must_match",
            passed=False,
            detail="astro.config.mjs missing — Astro not yet initialised",
        )
    result = run_astro_build(ctx.repo_root)
    if result.succeeded:
        return CheckResult(
            name="astro_builds",
            severity="must_match",
            passed=True,
            detail=f"npm run build succeeded in {result.elapsed_s:.1f}s",
        )
    return CheckResult(
        name="astro_builds",
        severity="must_match",
        passed=False,
        detail=f"npm run build failed in {result.elapsed_s:.1f}s",
        diff=result.stderr[-2000:] or result.stdout[-2000:],
    )


def _check_astro_check(ctx: Context) -> CheckResult:
    if not astro_initialised(ctx.repo_root):
        return CheckResult(
            name="astro_check",
            severity="must_match",
            passed=False,
            detail="astro.config.mjs missing — astro check unavailable",
        )
    result = run_astro_check(ctx.repo_root)
    if result.succeeded:
        return CheckResult(
            name="astro_check",
            severity="must_match",
            passed=True,
            detail=f"astro check clean ({result.elapsed_s:.1f}s)",
        )
    return CheckResult(
        name="astro_check",
        severity="must_match",
        passed=False,
        detail=f"astro check reported errors ({result.elapsed_s:.1f}s)",
        diff=result.stderr[-2000:] or result.stdout[-2000:],
    )


def _check_phase_file_allowlist(ctx: Context) -> CheckResult:
    """Compare modified files since prev gate to the phase's allowlist."""
    if ctx.prev_gate is None:
        return CheckResult(
            name="phase_file_allowlist",
            severity="should_match",
            passed=True,
            detail="phase 1 — no prior gate to compare against",
        )
    prev_rev = ctx.prev_gate.get("git_rev")
    if not prev_rev:
        return CheckResult(
            name="phase_file_allowlist",
            severity="should_match",
            passed=True,
            detail="prior gate missing git_rev; skipping allowlist check",
        )
    proc = subprocess.run(
        ["git", "diff", "--name-only", f"{prev_rev}..HEAD"],
        cwd=ctx.repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        return CheckResult(
            name="phase_file_allowlist",
            severity="should_match",
            passed=True,
            detail="git diff failed; skipping allowlist check",
        )
    changed = sorted(line.strip() for line in proc.stdout.splitlines() if line.strip())
    return CheckResult(
        name="phase_file_allowlist",
        severity="should_match",
        passed=True,
        detail=f"{len(changed)} files changed since previous gate",
        diff="\n".join(changed) if changed else None,
    )


def _hugo_retired(ctx: Context) -> bool:
    """Phase 14 (cutover) deletes `themes/` and `hugo.toml`, so any
    subsequent verifier run must not require Hugo to still build."""
    return ctx.phase >= 14 or not (ctx.repo_root / "hugo.toml").is_file()


HUGO_BUILDS = Check(
    name="hugo_builds",
    severity="must_match",
    run=_check_hugo_builds,
    skip_if=_hugo_retired,
)
ASTRO_BUILDS = Check(
    name="astro_builds",
    severity="must_match",
    run=_check_astro_builds,
    skip_if=lambda ctx: ctx.phase == 1 and not astro_initialised(ctx.repo_root),
)
ASTRO_CHECK = Check(
    name="astro_check",
    severity="must_match",
    run=_check_astro_check,
    skip_if=lambda ctx: ctx.phase == 1 and not astro_initialised(ctx.repo_root),
)
PHASE_FILE_ALLOWLIST = Check(
    name="phase_file_allowlist",
    severity="should_match",
    run=_check_phase_file_allowlist,
)

UNIVERSAL_CHECKS: list[Check] = [
    HUGO_BUILDS,
    ASTRO_BUILDS,
    ASTRO_CHECK,
    PHASE_FILE_ALLOWLIST,
]
