"""Core types used by every check."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Literal

Severity = Literal["must_match", "should_match", "expected_to_differ"]


@dataclass
class Context:
    """Carried into every check.run()."""

    repo_root: Path
    public_dir: Path  # Hugo's build output
    dist_dir: Path  # Astro's build output
    skill_dir: Path  # .cursor/skills/implement-plan/
    state_dir: Path  # .cursor/skills/implement-plan/state/
    phase: int
    prev_gate: dict[str, Any] | None  # parsed phase-(N-1)-passed.json or None for phase 1
    keep_normalized: bool = False
    update_baselines: bool = False


@dataclass
class CheckResult:
    name: str
    severity: Severity
    passed: bool
    detail: str = ""
    diff: str | None = None
    artifacts: list[Path] = field(default_factory=list)

    @property
    def blocking(self) -> bool:
        """A failure that blocks the gate from being written."""
        return self.severity == "must_match" and not self.passed

    @property
    def warning(self) -> bool:
        return self.severity == "should_match" and not self.passed


@dataclass
class Check:
    name: str
    severity: Severity
    run: Callable[[Context], CheckResult]
    skip_if: Callable[[Context], bool] | None = None
