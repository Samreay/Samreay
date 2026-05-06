"""Wrapper around the Playwright visual-diff project."""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

VISUAL_DIR_REL = ".cursor/skills/implement-plan/scripts/visual"

# Playwright's `webServer.reuseExistingServer` reuses any process listening
# on these ports. After `npm run build` recreates `dist/`, a previously
# spawned `python3 -m http.server` is still serving the now-orphaned inode
# of the old directory — every request returns 404. Killing the stale
# servers up-front forces Playwright to spawn fresh ones against the
# current `dist/` and `public/` snapshots.
PORTS_TO_FREE = (8001, 8002)


@dataclass
class VisualResult:
    succeeded: bool
    stdout: str
    stderr: str
    bootstrapped: bool = False  # True if baselines were created on this run


def visual_dir(repo_root: Path) -> Path:
    return repo_root / VISUAL_DIR_REL


def is_set_up(repo_root: Path) -> bool:
    return (visual_dir(repo_root) / "node_modules").exists()


def _routes_for_phase(vdir: Path, phase: int) -> list[dict]:
    routes_path = vdir / "routes.json"
    if not routes_path.exists():
        return []
    config = json.loads(routes_path.read_text(encoding="utf-8"))
    return [r for r in config.get("routes", []) if r.get("phase") == phase]


def _baselines_present(vdir: Path, phase: int) -> bool:
    """Heuristic: at least one baseline PNG exists for any route in this phase.

    Baselines live under baselines/compare.spec.ts/{name}.png__{project}.png
    per the snapshotPathTemplate in playwright.config.ts.
    """
    routes = _routes_for_phase(vdir, phase)
    if not routes:
        return True  # Phase has no visual tests; nothing to bootstrap
    base_dir = vdir / "baselines" / "compare.spec.ts"
    if not base_dir.exists():
        return False
    for route in routes:
        name = route.get("name")
        if not name:
            continue
        if any(base_dir.glob(f"{name}.png__*.png")):
            return True
    return False


def _kill_stale_webservers() -> None:
    """Find and kill any python http.server processes bound to our ports.

    Uses ``lsof`` because it ships with macOS (the dev box) and most Linux
    distributions; if it isn't present we simply skip the cleanup and let
    Playwright fail loudly.
    """
    if subprocess.run(["which", "lsof"], capture_output=True, check=False).returncode != 0:
        return
    for port in PORTS_TO_FREE:
        proc = subprocess.run(
            ["lsof", "-ti", f"tcp:{port}"], capture_output=True, text=True, check=False
        )
        for pid in proc.stdout.split():
            subprocess.run(["kill", "-9", pid], check=False)


def run_visual_for_phase(repo_root: Path, phase: int, *, update_baselines: bool = False) -> VisualResult:
    """Run `npx playwright test --grep "@phase-N"` in the visual subproject.

    First-run behaviour: if no baseline PNG exists yet for any route in this
    phase, the run is bootstrapped with `--update-snapshots` so a fresh
    baseline is committed instead of failing the gate. Subsequent runs
    diff against that baseline normally; pass `update_baselines=True`
    explicitly to refresh it deliberately.

    The spec also uses a `test.skip(PHASE === 0, ...)` guard so it can be
    run interactively without spamming the dev with hundreds of broken
    snapshots — we always seed the env var here so the verifier path
    works.
    """
    vdir = visual_dir(repo_root)
    if not is_set_up(repo_root):
        return VisualResult(
            succeeded=False,
            stdout="",
            stderr="visual scripts not installed; run `make implement-plan-setup`",
        )
    bootstrapping = update_baselines or not _baselines_present(vdir, phase)
    grep = f"@phase-{phase}"
    args = ["npx", "playwright", "test", "--grep", grep]
    if bootstrapping:
        args.append("--update-snapshots")
    env = {**os.environ, "PHASE": str(phase)}
    _kill_stale_webservers()
    proc = subprocess.run(
        args, cwd=vdir, capture_output=True, text=True, check=False, env=env,
    )
    return VisualResult(
        succeeded=proc.returncode == 0,
        stdout=proc.stdout,
        stderr=proc.stderr,
        bootstrapped=bootstrapping and not update_baselines,
    )
