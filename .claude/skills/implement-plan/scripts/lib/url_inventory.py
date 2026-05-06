"""URL set diff between Hugo's public/ and Astro's dist/."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class InventoryDiff:
    only_hugo: set[str]
    only_astro: set[str]
    common: set[str]

    @property
    def equal(self) -> bool:
        return not self.only_hugo and not self.only_astro

    def summary(self) -> str:
        return (
            f"common={len(self.common)} "
            f"only_hugo={len(self.only_hugo)} "
            f"only_astro={len(self.only_astro)}"
        )


def list_html_routes(root: Path, prefix: str = "") -> set[str]:
    """List every route ending in /index.html under root.

    `prefix` filters to a subdirectory: ``prefix='reviews'`` returns only routes
    under ``/reviews/...``. Returned paths are URL-style with leading and trailing
    slashes (``/reviews/bobiverse/``).
    """
    if not root.is_dir():
        return set()
    base = root / prefix if prefix else root
    if not base.is_dir():
        return set()
    routes: set[str] = set()
    for html in base.rglob("index.html"):
        rel = html.parent.relative_to(root).as_posix()
        url = "/" if rel == "." else f"/{rel}/"
        routes.add(url)
    return routes


def diff_routes(hugo_root: Path, dist_root: Path, prefix: str = "") -> InventoryDiff:
    hugo = list_html_routes(hugo_root, prefix)
    astro = list_html_routes(dist_root, prefix)
    return InventoryDiff(
        only_hugo=hugo - astro,
        only_astro=astro - hugo,
        common=hugo & astro,
    )
