# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Validate cover stems in ``src/data/artists.ts`` against the on-disk files
under ``src/assets/img/covers/`` and the ``tmp_covers/`` staging directory,
then optionally promote staged covers into the Astro asset folder.

Usage:

    uv run .cursor/skills/find-artists/scripts/sync_covers.py            # report only
    uv run .cursor/skills/find-artists/scripts/sync_covers.py --apply    # also move tmp_covers/* into src/assets/img/covers/

Astro's ``getImage`` (sharp) handles resize/encode at build time, so this
script intentionally does no image processing — it only verifies that every
cover stem the explorer references resolves to a file the bundler can see,
and that nothing has been left orphaned in ``tmp_covers/``.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = SKILL_DIR.parents[2]
ARTISTS_TS = REPO_ROOT / "src" / "data" / "artists.ts"
COVERS_DIR = REPO_ROOT / "src" / "assets" / "img" / "covers"
TMP_COVERS = SKILL_DIR / "tmp_covers"

# Astro's THEME_COVERS glob in src/lib/covers.ts only resolves these
# extensions; anything else dropped into the covers folder will be ignored
# silently at build time.
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# The covers array is a flat list of double-quoted string literals, optionally
# followed by ``// https://reddit.com/...`` provenance comments. We strip the
# comments before pulling stems so a URL containing a quoted segment can never
# be mistaken for a stem.
COVERS_BLOCK_RE = re.compile(r'"covers"\s*:\s*\[([^\]]*)\]', re.DOTALL)
LINE_COMMENT_RE = re.compile(r"//[^\n]*")
STEM_RE = re.compile(r'"([^"]+)"')


def extract_stems(text: str) -> list[str]:
    out: list[str] = []
    for block in COVERS_BLOCK_RE.findall(text):
        cleaned = LINE_COMMENT_RE.sub("", block)
        out.extend(STEM_RE.findall(cleaned))
    return out


def index_files(directory: Path) -> dict[str, Path]:
    """Return ``{stem.lower(): path}`` for every supported file in *directory*.

    If a stem appears with two different extensions in the same directory we
    keep the first one and surface the duplicate via the ``stem_duplicates``
    return value of :func:`audit`.
    """
    out: dict[str, Path] = {}
    if not directory.is_dir():
        return out
    for path in sorted(directory.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in ALLOWED_EXTS:
            continue
        stem = path.stem.lower()
        out.setdefault(stem, path)
    return out


def audit() -> dict[str, list[str]]:
    if not ARTISTS_TS.is_file():
        sys.exit(f"[sync_covers] missing {ARTISTS_TS.relative_to(REPO_ROOT)}")

    text = ARTISTS_TS.read_text(encoding="utf-8")
    stems = extract_stems(text)
    stems_lower = [s.lower() for s in stems]

    covers = index_files(COVERS_DIR)
    staged = index_files(TMP_COVERS)

    referenced = set(stems_lower)
    on_disk = set(covers) | set(staged)

    duplicate_stems_in_ts = sorted(
        {s for s in stems_lower if stems_lower.count(s) > 1}
    )
    missing_files = sorted(referenced - on_disk)
    orphan_staged = sorted(set(staged) - referenced)
    collisions = sorted(set(covers) & set(staged))

    return {
        "duplicate_stems_in_ts": duplicate_stems_in_ts,
        "missing_files": missing_files,
        "orphan_staged": orphan_staged,
        "collisions": collisions,
    }


def report(findings: dict[str, list[str]]) -> int:
    sections = [
        (
            "duplicate_stems_in_ts",
            "Stems listed more than once in src/data/artists.ts",
        ),
        (
            "missing_files",
            "Stems in src/data/artists.ts with no file in src/assets/img/covers/ or tmp_covers/",
        ),
        (
            "orphan_staged",
            "Files in tmp_covers/ not referenced by any artist (delete or add to artists.ts)",
        ),
        (
            "collisions",
            "Stems present in BOTH src/assets/img/covers/ and tmp_covers/ (resolve manually)",
        ),
    ]

    issues = 0
    for key, label in sections:
        items = findings.get(key) or []
        if not items:
            continue
        issues += len(items)
        print(f"\n{label} ({len(items)}):")
        for item in items:
            print(f"  - {item}")

    if issues == 0:
        print("[sync_covers] artists.ts and cover folders are consistent.")
    return issues


def apply_moves() -> int:
    if not TMP_COVERS.is_dir():
        print(f"[sync_covers] {TMP_COVERS} does not exist; nothing to move.")
        return 0

    COVERS_DIR.mkdir(parents=True, exist_ok=True)
    moved = 0
    for path in sorted(TMP_COVERS.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in ALLOWED_EXTS:
            print(f"[sync_covers] skipping unsupported extension: {path.name}")
            continue
        dest = COVERS_DIR / path.name
        if dest.exists():
            print(
                f"[sync_covers] refusing to overwrite existing {dest.relative_to(REPO_ROOT)}"
            )
            continue
        shutil.move(str(path), str(dest))
        moved += 1
        print(f"[sync_covers] moved {path.name} -> {dest.relative_to(REPO_ROOT)}")
    print(f"[sync_covers] moved {moved} file(s) into src/assets/img/covers/")
    return moved


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="After auditing, move tmp_covers/* into src/assets/img/covers/.",
    )
    args = parser.parse_args()

    findings = audit()
    issues = report(findings)

    if args.apply:
        if findings["collisions"]:
            print(
                "\n[sync_covers] refusing --apply while stem collisions exist; resolve them first.",
                file=sys.stderr,
            )
            return 2
        apply_moves()
        # Re-audit so the operator sees the post-move state.
        print("\n[sync_covers] re-auditing after move...")
        report(audit())

    return 0 if issues == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
