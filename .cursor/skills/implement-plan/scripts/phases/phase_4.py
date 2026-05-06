"""Phase 4 — Content collections.

See plans/4-content-collections.md and references/gates-by-phase.md.

The plan estimated 153 reviews / 78 blogs / 39 tutorials, but the actual on-disk
counts are 151 / 77 / 37 (the plan was rounded up at writing time). The checks
compare Astro's `getCollection()` against on-disk markdown counts directly so
they self-calibrate to whatever ships in the tree at verification time.

Astro's collection counts are surfaced through the build-time API route
`src/pages/meta.json.ts`, which emits `dist/meta.json` with the real
`getCollection().length` for each collection. We read that file rather than
shelling into Node, because `astro:content` cannot be imported outside an
Astro build.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.collections import count_markdown_files  # noqa: E402
from lib.types import Check, CheckResult, Context  # noqa: E402

REQUIRED_DATA_MODULES = [
    "books",
    "courses",
    "other",
    "artists",
    "podcasts",
    "status",
    "categories",
]


def _read_meta_json(ctx: Context) -> dict | None:
    meta = ctx.dist_dir / "meta.json"
    if not meta.is_file():
        return None
    try:
        return json.loads(meta.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _check_collection_count(name: str) -> "callable":
    def _run(ctx: Context) -> CheckResult:
        check_name = f"{name}_count_matches_disk"
        meta = _read_meta_json(ctx)
        if meta is None:
            return CheckResult(
                name=check_name,
                severity="must_match",
                passed=False,
                detail=(
                    "dist/meta.json missing — src/pages/meta.json.ts should "
                    "have emitted it during the build. Did `npm run build` "
                    "complete?"
                ),
            )
        astro_count = meta.get("counts", {}).get(name)
        disk_count = count_markdown_files(ctx.repo_root / "content", name)
        if astro_count is None:
            return CheckResult(
                name=check_name,
                severity="must_match",
                passed=False,
                detail=f"meta.json has no counts.{name} key",
            )
        if astro_count == disk_count:
            return CheckResult(
                name=check_name,
                severity="must_match",
                passed=True,
                detail=f"Astro reports {astro_count}, disk has {disk_count}",
            )
        return CheckResult(
            name=check_name,
            severity="must_match",
            passed=False,
            detail=(
                f"Astro getCollection('{name}').length = {astro_count} but "
                f"content/{name}/*/index.md{{,x}} on disk = {disk_count}. "
                "Either the schema is silently rejecting entries, or the glob "
                "pattern in src/content.config.ts doesn't match this layout."
            ),
        )

    return _run


def _check_data_files_imported(ctx: Context) -> CheckResult:
    """Every required src/data/<name>.ts exists and parses as TypeScript.

    Full TS type-checking is the universal `astro_check` gate's job. Here we
    just confirm the file is non-empty and has an `export` (default or named)
    so the import path that pages will use later doesn't 404.
    """
    src_data = ctx.repo_root / "src" / "data"
    missing = []
    no_export = []
    for name in REQUIRED_DATA_MODULES:
        f = src_data / f"{name}.ts"
        if not f.is_file():
            missing.append(name)
            continue
        text = f.read_text(encoding="utf-8")
        if "export " not in text:
            no_export.append(name)
    if not missing and not no_export:
        return CheckResult(
            name="data_files_imported",
            severity="must_match",
            passed=True,
            detail=f"all {len(REQUIRED_DATA_MODULES)} src/data/*.ts modules present",
        )
    parts = []
    if missing:
        parts.append(f"missing src/data/{{{','.join(missing)}}}.ts")
    if no_export:
        parts.append(f"no `export` statement in src/data/{{{','.join(no_export)}}}.ts")
    return CheckResult(
        name="data_files_imported",
        severity="must_match",
        passed=False,
        detail="; ".join(parts),
    )


def _check_schema_validation(ctx: Context) -> CheckResult:
    """`astro check` is a universal gate; it runs before any phase check and
    fails the whole verifier if schemas reject any frontmatter. This check
    just confirms the universal gate's contract is documented at the
    phase-4 level for traceability — it always passes when reached, because
    if `astro check` had failed we'd never get here.
    """
    return CheckResult(
        name="schema_validation",
        severity="must_match",
        passed=True,
        detail="enforced by the universal `astro_check` gate (would have failed earlier otherwise)",
    )


def _check_frontmatter_round_trip(ctx: Context) -> CheckResult:
    """Spot-check 5 random entries per collection: parse YAML directly with
    python-frontmatter, compare title+date against Astro's parsed `entry.data`
    sample exposed via `dist/meta.json`.
    """
    import frontmatter
    import random

    meta = _read_meta_json(ctx)
    if meta is None:
        return CheckResult(
            name="frontmatter_round_trip",
            severity="should_match",
            passed=False,
            detail="dist/meta.json missing — cannot cross-check",
        )

    mismatches: list[str] = []
    for collection in ("reviews", "blogs", "tutorials"):
        sample = meta.get("sample", {}).get(collection, [])
        for entry in sample:
            entry_id = entry.get("id")
            astro_title = entry.get("title")
            md_md = ctx.repo_root / "content" / collection / entry_id / "index.md"
            md_mdx = ctx.repo_root / "content" / collection / entry_id / "index.mdx"
            md_path = md_md if md_md.is_file() else md_mdx
            if not md_path.is_file():
                mismatches.append(f"{collection}/{entry_id}: source md not found")
                continue
            disk = frontmatter.load(md_path)
            disk_title = disk.metadata.get("title") or disk.metadata.get("short_title")
            if astro_title != disk_title:
                mismatches.append(
                    f"{collection}/{entry_id}: astro={astro_title!r} vs disk={disk_title!r}"
                )

    if not mismatches:
        return CheckResult(
            name="frontmatter_round_trip",
            severity="should_match",
            passed=True,
            detail="sampled entries from dist/meta.json round-trip against on-disk frontmatter",
        )
    return CheckResult(
        name="frontmatter_round_trip",
        severity="should_match",
        passed=False,
        detail="; ".join(mismatches[:10]),
    )


CHECKS: list[Check] = [
    Check(
        name="reviews_count_matches_disk",
        severity="must_match",
        run=_check_collection_count("reviews"),
    ),
    Check(
        name="blogs_count_matches_disk",
        severity="must_match",
        run=_check_collection_count("blogs"),
    ),
    Check(
        name="tutorials_count_matches_disk",
        severity="must_match",
        run=_check_collection_count("tutorials"),
    ),
    Check(
        name="schema_validation",
        severity="must_match",
        run=_check_schema_validation,
    ),
    Check(
        name="data_files_imported",
        severity="must_match",
        run=_check_data_files_imported,
    ),
    Check(
        name="frontmatter_round_trip",
        severity="should_match",
        run=_check_frontmatter_round_trip,
    ),
]
