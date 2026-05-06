"""Build runners for Hugo and Astro."""

from __future__ import annotations

import os
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass
class BuildResult:
    name: str
    succeeded: bool
    elapsed_s: float
    stdout: str
    stderr: str
    output_dir: Path | None


def run_hugo(repo_root: Path) -> BuildResult:
    """Run resize.py (if present) and then hugo --gc --minify.

    `resize.py` populates `resources/` so Hugo's image processing has inputs.
    The `make blog` target chains them; `make prod` doesn't, but CI relies on
    a populated `resources/` already on disk. We always run resize.py first
    locally to match `make blog` behaviour and keep CI parity.
    """
    started = time.monotonic()
    resize_py = repo_root / "resize.py"
    resize_stderr = ""
    if resize_py.exists():
        try:
            resize = subprocess.run(
                ["uv", "run", "python", "resize.py"],
                cwd=repo_root,
                capture_output=True,
                text=True,
                check=False,
            )
            if resize.returncode != 0:
                resize_stderr = resize.stderr or resize.stdout
        except FileNotFoundError:
            resize_stderr = "uv not on PATH (needed to run resize.py)"
    try:
        proc = subprocess.run(
            ["hugo", "--gc", "--minify"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ, "HUGO_ENVIRONMENT": "production", "HUGO_ENV": "production"},
        )
    except FileNotFoundError:
        return BuildResult(
            name="hugo",
            succeeded=False,
            elapsed_s=time.monotonic() - started,
            stdout="",
            stderr="hugo binary not on PATH; install via `make install_casks` or download v0.136.4 extended",
            output_dir=None,
        )
    elapsed = time.monotonic() - started
    combined_stderr = "\n".join(s for s in [resize_stderr, proc.stderr] if s)
    return BuildResult(
        name="hugo",
        succeeded=proc.returncode == 0,
        elapsed_s=elapsed,
        stdout=proc.stdout,
        stderr=combined_stderr,
        output_dir=repo_root / "public" if proc.returncode == 0 else None,
    )


def _safe_run(args: list[str], repo_root: Path, missing_msg: str) -> tuple[subprocess.CompletedProcess[str] | None, str | None]:
    try:
        proc = subprocess.run(args, cwd=repo_root, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return None, missing_msg
    return proc, None


def run_astro_build(repo_root: Path) -> BuildResult:
    started = time.monotonic()
    proc, missing = _safe_run(["npm", "run", "build"], repo_root, "npm not on PATH")
    elapsed = time.monotonic() - started
    if missing:
        return BuildResult(name="astro_build", succeeded=False, elapsed_s=elapsed, stdout="", stderr=missing, output_dir=None)
    assert proc is not None
    return BuildResult(
        name="astro_build",
        succeeded=proc.returncode == 0,
        elapsed_s=elapsed,
        stdout=proc.stdout,
        stderr=proc.stderr,
        output_dir=repo_root / "dist" if proc.returncode == 0 else None,
    )


def run_astro_check(repo_root: Path) -> BuildResult:
    started = time.monotonic()
    proc, missing = _safe_run(["npx", "astro", "check"], repo_root, "npx not on PATH")
    elapsed = time.monotonic() - started
    if missing:
        return BuildResult(name="astro_check", succeeded=False, elapsed_s=elapsed, stdout="", stderr=missing, output_dir=None)
    assert proc is not None
    return BuildResult(
        name="astro_check",
        succeeded=proc.returncode == 0,
        elapsed_s=elapsed,
        stdout=proc.stdout,
        stderr=proc.stderr,
        output_dir=None,
    )


def astro_initialised(repo_root: Path) -> bool:
    """Heuristic: Astro is initialised if astro.config.mjs exists at repo root."""
    return (repo_root / "astro.config.mjs").exists()
