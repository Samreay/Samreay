# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Emit a typed flowchart.ts snippet from a state.json built by the agent.

The state file follows ``references/state-schema.md``. ``emit.py`` validates
it strictly:

- IDs are unique across decisions+books.
- Every edge ``source``/``target`` references a defined node.
- Every ``color`` (decision, edge) is a member of the PaletteColor union.
- Every ``type`` on an edge (and the optional top-level ``defaultEdgeType``)
  is a member of the EdgeType union.
- Every book ``reviewId`` corresponds to ``content/reviews/<reviewId>/index.md``
  on disk (relative to the repo root, located via ``--repo-root`` or the
  closest ancestor containing ``content/reviews``).

Then writes a ``flowchart.ts``-compatible TypeScript module to ``--out``
(default ``stdout``). Produced output deliberately matches the existing file's
formatting (single-line entries inside the array literals) so review diffs
read like ``+`` / ``-`` of individual nodes and edges instead of a full
rewrite.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PALETTE_COLORS = {
    "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
    "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink",
    "rose", "gray",
}
EDGE_TYPES = {"bezier", "simplebezier", "smoothstep", "step", "straight"}


def find_repo_root(start: Path) -> Path:
    cur = start.resolve()
    while cur != cur.parent:
        if (cur / "content" / "reviews").is_dir():
            return cur
        cur = cur.parent
    msg = f"could not find content/reviews/ above {start}"
    raise SystemExit(msg)


def ts_string(value: str) -> str:
    # Single-quoted, TS-style. Backslash-escape \ and ', leave everything else
    # alone since labels in state.json are plain prose without weird control
    # chars in practice. If a label needs a literal newline, that should be
    # caught in review.
    escaped = value.replace("\\", "\\\\").replace("'", "\\'")
    return f"'{escaped}'"


def fmt_pinned(pinned: dict | None) -> str | None:
    if not pinned:
        return None
    return f"pinned: {{ x: {int(pinned['x'])}, y: {int(pinned['y'])} }}"


def fmt_decision(d: dict) -> str:
    parts = [f"id: {ts_string(d['id'])}", f"prompt: {ts_string(d['prompt'])}"]
    if d.get("color"):
        parts.append(f"color: {ts_string(d['color'])}")
    pin = fmt_pinned(d.get("pinned"))
    if pin:
        parts.append(pin)
    return "    { " + ", ".join(parts) + " },"


def fmt_book(b: dict) -> str:
    parts = [f"id: {ts_string(b['id'])}", f"reviewId: {ts_string(b['reviewId'])}"]
    pin = fmt_pinned(b.get("pinned"))
    if pin:
        parts.append(pin)
    return "    { " + ", ".join(parts) + " },"


def fmt_edge(e: dict) -> str:
    parts = [
        f"id: {ts_string(e['id'])}",
        f"source: {ts_string(e['source'])}",
        f"target: {ts_string(e['target'])}",
    ]
    if e.get("label"):
        parts.append(f"label: {ts_string(e['label'])}")
    if e.get("color"):
        parts.append(f"color: {ts_string(e['color'])}")
    if e.get("type"):
        parts.append(f"type: {ts_string(e['type'])}")
    return "    { " + ", ".join(parts) + " },"


def validate(state: dict, repo_root: Path) -> list[str]:
    errors: list[str] = []
    decisions = state.get("decisions") or []
    books = state.get("books") or []
    edges = state.get("edges") or []

    ids: dict[str, str] = {}
    for d in decisions:
        for key in ("id", "prompt"):
            if not d.get(key):
                errors.append(f"decision missing {key}: {d}")
        nid = d.get("id")
        if nid:
            if nid in ids:
                errors.append(f"duplicate id {nid!r} (decision vs {ids[nid]})")
            ids[nid] = "decision"
        color = d.get("color")
        if color is not None and color not in PALETTE_COLORS:
            errors.append(f"decision {nid!r}: unknown color {color!r}")

    for b in books:
        for key in ("id", "reviewId"):
            if not b.get(key):
                errors.append(f"book missing {key}: {b}")
        nid = b.get("id")
        if nid:
            if nid in ids:
                errors.append(f"duplicate id {nid!r} (book vs {ids[nid]})")
            ids[nid] = "book"
        review_id = b.get("reviewId")
        if review_id:
            review_md = repo_root / "content" / "reviews" / review_id / "index.md"
            if not review_md.is_file():
                errors.append(
                    f"book {nid!r}: reviewId {review_id!r} has no content/reviews/{review_id}/index.md",
                )

    edge_ids: set[str] = set()
    for e in edges:
        for key in ("id", "source", "target"):
            if not e.get(key):
                errors.append(f"edge missing {key}: {e}")
        eid = e.get("id")
        if eid:
            if eid in edge_ids:
                errors.append(f"duplicate edge id {eid!r}")
            edge_ids.add(eid)
        for endpoint in ("source", "target"):
            value = e.get(endpoint)
            if value and value not in ids:
                errors.append(f"edge {eid!r}: {endpoint} references unknown node {value!r}")
        color = e.get("color")
        if color is not None and color not in PALETTE_COLORS:
            errors.append(f"edge {eid!r}: unknown color {color!r}")
        etype = e.get("type")
        if etype is not None and etype not in EDGE_TYPES:
            errors.append(f"edge {eid!r}: unknown type {etype!r}")

    default_type = state.get("defaultEdgeType")
    if default_type is not None and default_type not in EDGE_TYPES:
        errors.append(f"defaultEdgeType {default_type!r} not in {sorted(EDGE_TYPES)}")
    return errors


def render_ts(state: dict) -> str:
    decisions = state.get("decisions") or []
    books = state.get("books") or []
    edges = state.get("edges") or []
    default_type = state.get("defaultEdgeType") or "bezier"

    lines = [
        "// AUTO-GENERATED by .cursor/skills/parse-flowchart/scripts/emit.py",
        "// Edit state.json (under work/<image-stem>/) and re-run emit, or",
        "// move this output into src/data/flowchart.ts manually after review.",
        "",
        "import type { FlowchartData } from './flowchart';",
        "",
        "export const flowchart: FlowchartData = {",
        f"  defaultEdgeType: {ts_string(default_type)},",
        "  decisions: [",
        *[fmt_decision(d) for d in decisions],
        "  ],",
        "  books: [",
        *[fmt_book(b) for b in books],
        "  ],",
        "  edges: [",
        *[fmt_edge(e) for e in edges],
        "  ],",
        "};",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--state", type=Path, required=True, help="Path to state.json.")
    ap.add_argument("--out", type=Path, default=None, help="Output .ts path (default stdout).")
    ap.add_argument(
        "--repo-root",
        type=Path,
        default=None,
        help="Repo root for content/reviews/ lookups. Auto-detected if omitted.",
    )
    ap.add_argument(
        "--allow-missing-reviews",
        action="store_true",
        help="Demote missing reviewId errors to warnings (use during in-progress drafts).",
    )
    args = ap.parse_args()

    state = json.loads(args.state.read_text())
    repo_root = args.repo_root.resolve() if args.repo_root else find_repo_root(args.state)

    errors = validate(state, repo_root)
    if args.allow_missing_reviews:
        kept, demoted = [], []
        for err in errors:
            (demoted if "has no content/reviews/" in err else kept).append(err)
        errors = kept
        for warn in demoted:
            print(f"WARN: {warn}", file=sys.stderr)

    if errors:
        print("Validation failed:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        sys.exit(1)

    rendered = render_ts(state)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(rendered)
        summary = {
            "out": str(args.out),
            "decisions": len(state.get("decisions") or []),
            "books": len(state.get("books") or []),
            "edges": len(state.get("edges") or []),
        }
        print(json.dumps(summary, indent=2))
    else:
        sys.stdout.write(rendered)


if __name__ == "__main__":
    main()
