"""Bridge to Astro's content-collections API via a small node script."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

NODE_BRIDGE_REL = ".claude/skills/implement-plan/scripts/collection_counts.mjs"


def get_collection_counts(repo_root: Path) -> dict[str, int]:
    """Invoke node bridge, return {collection_name: count}.

    Returns an empty dict if Astro isn't initialised yet or the bridge fails.
    """
    bridge = repo_root / NODE_BRIDGE_REL
    if not bridge.exists():
        return {}
    proc = subprocess.run(
        ["node", str(bridge)],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        return {}
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {}


def count_markdown_files(content_root: Path, section: str) -> int:
    """Count <section>/*/index.md{,x} entries directly off disk."""
    base = content_root / section
    if not base.is_dir():
        return 0
    return sum(1 for _ in base.glob("*/index.md")) + sum(1 for _ in base.glob("*/index.mdx"))
