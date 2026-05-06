#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "beautifulsoup4>=4.12",
#   "lxml>=5.1",
#   "python-frontmatter>=1.0",
#   "pyyaml>=6.0",
# ]
# ///
"""Run the verification gate for one phase of the migration.

Usage:
    uv run .claude/skills/implement-plan/scripts/verify.py --phase N
    uv run .claude/skills/implement-plan/scripts/verify.py --phase N --keep-normalized
    uv run .claude/skills/implement-plan/scripts/verify.py --phase N --update-baselines

Exit codes:
    0   all `must_match` checks passed; gate written to state/phase-N-passed.json
    1   one or more `must_match` checks failed; report written but no gate
    2   precondition failure (no prior gate, missing phase module, etc.)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from lib.runner import (  # noqa: E402
    all_universal_and_phase_checks,
    load_prev_gate,
    run_checks,
    summarise,
    write_gate,
    write_report,
)
from lib.types import Context  # noqa: E402


def _resolve_repo_root() -> Path:
    skill_dir = SCRIPT_DIR.parent
    return skill_dir.parent.parent.parent


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", type=int, required=True)
    parser.add_argument("--keep-normalized", action="store_true")
    parser.add_argument("--update-baselines", action="store_true")
    parser.add_argument(
        "--skip-prev-gate-check",
        action="store_true",
        help="Verify a phase even if the previous phase's gate file is missing.",
    )
    args = parser.parse_args()

    repo_root = _resolve_repo_root()
    skill_dir = SCRIPT_DIR.parent
    state_dir = skill_dir / "state"
    state_dir.mkdir(parents=True, exist_ok=True)

    prev_gate = load_prev_gate(state_dir, args.phase)
    if args.phase > 1 and prev_gate is None and not args.skip_prev_gate_check:
        print(
            f"phase {args.phase} requires state/phase-{args.phase - 1}-passed.json. "
            "Finish the previous phase first, or pass --skip-prev-gate-check.",
            file=sys.stderr,
        )
        return 2

    ctx = Context(
        repo_root=repo_root,
        public_dir=repo_root / "public",
        dist_dir=repo_root / "dist",
        skill_dir=skill_dir,
        state_dir=state_dir,
        phase=args.phase,
        prev_gate=prev_gate,
        keep_normalized=args.keep_normalized,
        update_baselines=args.update_baselines,
    )

    checks = all_universal_and_phase_checks(skill_dir, args.phase)
    if not checks:
        print(
            f"no checks defined for phase {args.phase} "
            f"(scripts/phases/phase_{args.phase}.py missing or empty)",
            file=sys.stderr,
        )
        return 2

    results = run_checks(checks, ctx)
    report = write_report(state_dir, args.phase, results)
    print(summarise(results))
    print(f"\nstructured report → {report.relative_to(repo_root)}")

    blocking = [r for r in results if r.blocking]
    if blocking:
        return 1

    extras = {
        "checks_run": len(results),
        "warnings": sum(1 for r in results if r.warning),
    }
    gate = write_gate(state_dir, args.phase, repo_root, extras)
    print(f"gate written → {gate.relative_to(repo_root)}")
    cursor_path = state_dir / "cursor.json"
    cursor_path.write_text(
        json.dumps({"current_phase": args.phase + 1, "last_passed": args.phase}, indent=2),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
