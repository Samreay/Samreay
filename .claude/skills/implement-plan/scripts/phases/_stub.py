"""Helpers for not-yet-implemented phase modules."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.types import Check, CheckResult, Context  # noqa: E402


def make_stub(phase: int, summary: str) -> list[Check]:
    """Build a single failing check that prompts the agent to fill in this phase."""

    def _stub(_ctx: Context) -> CheckResult:
        return CheckResult(
            name=f"phase_{phase}_checks_not_implemented",
            severity="must_match",
            passed=False,
            detail=(
                f"Phase {phase} verification is a stub. "
                f"Open scripts/phases/phase_{phase}.py and implement the checks "
                f"described in references/gates-by-phase.md (section: '{summary}'). "
                "Reuse helpers from scripts/lib/."
            ),
        )

    return [
        Check(
            name=f"phase_{phase}_checks_not_implemented",
            severity="must_match",
            run=_stub,
        )
    ]
