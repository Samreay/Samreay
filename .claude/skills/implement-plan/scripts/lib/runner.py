"""Phase runner: load a phase module, execute checks, write the gate."""

from __future__ import annotations

import importlib.util
import json
import subprocess
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

from .types import Check, CheckResult, Context
from .universal import UNIVERSAL_CHECKS

PHASES_DIR_REL = ".claude/skills/implement-plan/scripts/phases"


def load_phase_checks(skill_dir: Path, phase: int) -> list[Check]:
    """Load `scripts/phases/phase_<N>.py` and return its CHECKS list."""
    import sys

    phases_dir = skill_dir / "scripts" / "phases"
    if str(phases_dir) not in sys.path:
        sys.path.insert(0, str(phases_dir))
    module_path = phases_dir / f"phase_{phase}.py"
    if not module_path.exists():
        return []
    spec = importlib.util.spec_from_file_location(f"phase_{phase}", module_path)
    if spec is None or spec.loader is None:
        return []
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    checks = getattr(module, "CHECKS", [])
    if not isinstance(checks, list):
        return []
    return checks


def run_checks(checks: list[Check], ctx: Context) -> list[CheckResult]:
    results: list[CheckResult] = []
    for check in checks:
        if check.skip_if and check.skip_if(ctx):
            results.append(
                CheckResult(
                    name=check.name,
                    severity=check.severity,
                    passed=True,
                    detail="skipped (skip_if true)",
                )
            )
            continue
        try:
            result = check.run(ctx)
        except Exception as exc:  # noqa: BLE001
            result = CheckResult(
                name=check.name,
                severity=check.severity,
                passed=False,
                detail=f"check raised: {type(exc).__name__}: {exc}",
            )
        results.append(result)
    return results


def gate_path(state_dir: Path, phase: int) -> Path:
    return state_dir / f"phase-{phase}-passed.json"


def report_path(state_dir: Path, phase: int) -> Path:
    return state_dir / f"phase-{phase}-report.json"


def load_prev_gate(state_dir: Path, phase: int) -> dict | None:
    if phase == 1:
        return None
    prev = gate_path(state_dir, phase - 1)
    if not prev.exists():
        return None
    return json.loads(prev.read_text(encoding="utf-8"))


def write_report(state_dir: Path, phase: int, results: list[CheckResult]) -> Path:
    state_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "phase": phase,
        "generated_at": datetime.now(UTC).isoformat(),
        "checks": [
            {
                "name": r.name,
                "severity": r.severity,
                "passed": r.passed,
                "detail": r.detail,
                "diff": r.diff,
                "artifacts": [str(p) for p in r.artifacts],
            }
            for r in results
        ],
    }
    out = report_path(state_dir, phase)
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return out


def write_gate(state_dir: Path, phase: int, repo_root: Path, extras: dict | None = None) -> Path:
    state_dir.mkdir(parents=True, exist_ok=True)
    rev = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    ).stdout.strip()
    payload = {
        "phase": phase,
        "passed_at": datetime.now(UTC).isoformat(),
        "git_rev": rev,
        "extras": extras or {},
    }
    out = gate_path(state_dir, phase)
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return out


def summarise(results: list[CheckResult]) -> str:
    blocking = [r for r in results if r.blocking]
    warnings = [r for r in results if r.warning]
    passed = sum(1 for r in results if r.passed)
    lines = [
        f"\n=== verify summary: {passed}/{len(results)} passed, "
        f"{len(blocking)} blocking, {len(warnings)} warnings ===\n"
    ]
    for r in results:
        marker = "PASS" if r.passed else ("WARN" if r.warning else "FAIL")
        lines.append(f"  [{marker}] [{r.severity:18s}] {r.name:40s} — {r.detail}")
    if blocking:
        lines.append("\n--- Blocking failures detail ---")
        for r in blocking:
            lines.append(f"\n{r.name}: {r.detail}")
            if r.diff:
                lines.append(r.diff[:4000])
    return "\n".join(lines)


def all_universal_and_phase_checks(skill_dir: Path, phase: int) -> list[Check]:
    return [*UNIVERSAL_CHECKS, *load_phase_checks(skill_dir, phase)]


__all__ = [
    "all_universal_and_phase_checks",
    "asdict",
    "load_phase_checks",
    "load_prev_gate",
    "run_checks",
    "summarise",
    "write_gate",
    "write_report",
]
