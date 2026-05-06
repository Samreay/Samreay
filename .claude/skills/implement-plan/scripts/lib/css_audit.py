"""Audits over the built Astro CSS bundle."""

from __future__ import annotations

import re
from pathlib import Path

CSS_GLOB = "_astro/*.css"


def find_css_bundles(dist_dir: Path) -> list[Path]:
    return sorted(dist_dir.glob(CSS_GLOB))


def total_css_size(dist_dir: Path) -> int:
    return sum(p.stat().st_size for p in find_css_bundles(dist_dir))


def concatenated_css(dist_dir: Path) -> str:
    return "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in find_css_bundles(dist_dir))


def assert_selectors_emitted(css: str, patterns: list[str]) -> dict[str, bool]:
    """Return {pattern: matched} for each regex."""
    return {p: re.search(p, css) is not None for p in patterns}


def assert_selectors_absent(css: str, patterns: list[str]) -> dict[str, bool]:
    """Return {pattern: absent} where True means the pattern did NOT match."""
    return {p: re.search(p, css) is None for p in patterns}
