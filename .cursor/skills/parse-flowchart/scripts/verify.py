# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pillow>=10",
# ]
# ///
"""Audit a parse-flowchart state.json for topology defects and image coverage.

Two complementary check families catch the failure modes the manual agent
loop is most prone to:

1. **Topology** (data-only checks; raise exit code 1 on failure):
   - duplicate ids across decisions+books or across edges,
   - edges referencing unknown nodes,
   - orphan nodes (zero edges in or out),
   - dead-end decisions (decision with no outgoing edges; START is exempt),
   - non-terminal books (a book with outgoing edges is almost always a
     swapped source/target — emitted as a warning by default, error with
     ``--strict``),
   - unreachable nodes (cannot be reached from the START anchor),
   - cycles (the flowchart must be a DAG; back-edges indicate a swapped
     edge direction or a mislabeled target).

2. **Coverage** (eye-checked, not asserted):
   produces ``<work>/coverage.png`` — the prepared overview annotated with
   every captured node's ``src_bbox`` (decisions in blue, books in green,
   ids labelled). The agent reads this back and any visible book card or
   decision pill that *isn't* outlined is a node missed during enumeration.
   Combined with the per-tile coverage stats (``WARN`` lines for tiles with
   zero captured nodes), this is how we catch missing books without
   re-doing the full enumeration pass.

Invocation:

    uv run verify.py --state work/<stem>/state.json --prepared work/<stem>/

The script discovers ``index.json`` and ``overview.png`` inside ``--prepared``.
Pass ``--strict`` to make every warning fatal. Stdout is a JSON summary so
the agent can see counts without re-reading the overlay.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None

DECISION_OUTLINE = (59, 130, 246)
BOOK_OUTLINE = (16, 185, 129)
START_OUTLINE = (245, 158, 11)


def load_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, ValueError):
            continue
    return ImageFont.load_default()


def find_start_id(decisions: list[dict]) -> str | None:
    for d in decisions:
        pin = d.get("pinned")
        if isinstance(pin, dict) and int(pin.get("x", -1)) == 0 and int(pin.get("y", -1)) == 0:
            return d["id"]
    for d in decisions:
        if d.get("id") in {"d_start", "start"}:
            return d["id"]
    return None


def detect_cycles(node_ids: list[str], out_adj: dict[str, list[str]]) -> list[tuple[str, str]]:
    # Iterative DFS with three-colour marking. Each (parent, child) pair where
    # the child is currently GRAY is a back-edge → part of a cycle.
    white, gray, black = 0, 1, 2
    state = dict.fromkeys(node_ids, white)
    cycle_edges: list[tuple[str, str]] = []
    for root in node_ids:
        if state[root] != white:
            continue
        stack: list[tuple[str, list[str]]] = [(root, list(out_adj.get(root, [])))]
        state[root] = gray
        while stack:
            n, remaining = stack[-1]
            if not remaining:
                state[n] = black
                stack.pop()
                continue
            m = remaining.pop()
            if state[m] == gray:
                cycle_edges.append((n, m))
            elif state[m] == white:
                state[m] = gray
                stack.append((m, list(out_adj.get(m, []))))
    return cycle_edges


def topology_check(state: dict) -> tuple[list[str], list[str], dict]:
    errors: list[str] = []
    warnings: list[str] = []
    decisions = state.get("decisions") or []
    books = state.get("books") or []
    edges = state.get("edges") or []

    nodes_by_id: dict[str, tuple[str, dict]] = {}
    for d in decisions:
        nid = d.get("id")
        if not nid:
            errors.append(f"decision missing id: {d}")
            continue
        if nid in nodes_by_id:
            errors.append(f"duplicate node id {nid!r}")
        nodes_by_id[nid] = ("decision", d)
    for b in books:
        nid = b.get("id")
        if not nid:
            errors.append(f"book missing id: {b}")
            continue
        if nid in nodes_by_id:
            errors.append(f"duplicate node id {nid!r}")
        nodes_by_id[nid] = ("book", b)

    out_adj: dict[str, list[str]] = defaultdict(list)
    in_adj: dict[str, list[str]] = defaultdict(list)
    seen_edge_ids: set[str] = set()
    for e in edges:
        eid = e.get("id")
        if eid:
            if eid in seen_edge_ids:
                errors.append(f"duplicate edge id {eid!r}")
            seen_edge_ids.add(eid)
        s, t = e.get("source"), e.get("target")
        if s not in nodes_by_id:
            errors.append(f"edge {eid!r}: source {s!r} is not a defined node")
            continue
        if t not in nodes_by_id:
            errors.append(f"edge {eid!r}: target {t!r} is not a defined node")
            continue
        out_adj[s].append(t)
        in_adj[t].append(s)

    start_id = find_start_id(decisions)
    if start_id is None:
        warnings.append(
            "no START anchor found (a decision with pinned: {x:0, y:0} or id 'd_start')"
            " — reachability check skipped",
        )
        reachable: set[str] = set()
    else:
        reachable = set()
        stack = [start_id]
        while stack:
            n = stack.pop()
            if n in reachable:
                continue
            reachable.add(n)
            stack.extend(out_adj.get(n, []))
        for nid in nodes_by_id:
            if nid not in reachable:
                errors.append(f"node {nid!r} is unreachable from START {start_id!r}")

    for nid, (kind, _node) in nodes_by_id.items():
        if not out_adj.get(nid) and not in_adj.get(nid):
            errors.append(f"node {nid!r} ({kind}) is orphaned (no edges)")

    for d in decisions:
        nid = d.get("id")
        if nid is None or nid == start_id:
            continue
        if not out_adj.get(nid):
            errors.append(f"decision {nid!r} has no outgoing edges (dead end)")

    for b in books:
        nid = b.get("id")
        if nid and out_adj.get(nid):
            warnings.append(
                f"book {nid!r} has outgoing edges {out_adj[nid]} — likely swapped source/target",
            )

    for s, t in detect_cycles(list(nodes_by_id), out_adj):
        errors.append(f"cycle detected via edge {s!r} → {t!r}")

    stats = {
        "start": start_id,
        "decisions": len(decisions),
        "books": len(books),
        "edges": len(edges),
        "reachable": len(reachable),
        "nodes_by_id": nodes_by_id,
        "out_adj": dict(out_adj),
        "in_adj": dict(in_adj),
    }
    return errors, warnings, stats


def per_tile_coverage(
    nodes_by_id: dict[str, tuple[str, dict]],
    index: dict,
) -> tuple[dict[str, int], list[str]]:
    src_w, src_h = index["src_size"]
    cols, rows = index["grid"]
    cell_w = src_w / cols
    cell_h = src_h / rows
    counts: dict[str, int] = {f"r{r}c{c}": 0 for r in range(rows) for c in range(cols)}
    no_bbox: list[str] = []
    for nid, (_kind, node) in nodes_by_id.items():
        bbox = node.get("src_bbox")
        if not bbox:
            no_bbox.append(nid)
            continue
        cx = (bbox[0] + bbox[2]) / 2
        cy = (bbox[1] + bbox[3]) / 2
        col = min(cols - 1, max(0, int(cx / cell_w)))
        row = min(rows - 1, max(0, int(cy / cell_h)))
        counts[f"r{row}c{col}"] += 1
    return counts, no_bbox


def render_coverage_overlay(
    nodes_by_id: dict[str, tuple[str, dict]],
    start_id: str | None,
    overview_path: Path,
    src_size: tuple[int, int],
    out_path: Path,
) -> None:
    overview = Image.open(overview_path).convert("RGB")
    draw = ImageDraw.Draw(overview)
    overview_w, overview_h = overview.size
    src_w, src_h = src_size
    sx = overview_w / src_w
    sy = overview_h / src_h
    font = load_font(max(11, int(overview_w / 130)))

    for nid, (kind, node) in nodes_by_id.items():
        bbox = node.get("src_bbox")
        if not bbox:
            continue
        x0, y0, x1, y1 = bbox
        rect = [x0 * sx, y0 * sy, x1 * sx, y1 * sy]
        if nid == start_id:
            colour = START_OUTLINE
        elif kind == "decision":
            colour = DECISION_OUTLINE
        else:
            colour = BOOK_OUTLINE
        draw.rectangle(rect, outline=colour, width=2)
        # Outline the text so it stays legible across busy backgrounds.
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            draw.text((rect[0] + 2 + dx, rect[1] + 2 + dy), nid, fill="white", font=font)
        draw.text((rect[0] + 2, rect[1] + 2), nid, fill=colour, font=font)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    overview.save(out_path, optimize=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--state", type=Path, required=True, help="Path to state.json.")
    ap.add_argument(
        "--prepared",
        type=Path,
        required=True,
        help="Directory written by prepare.py (must contain index.json and overview.png).",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Coverage overlay path (default: <prepared>/coverage.png).",
    )
    ap.add_argument(
        "--strict",
        action="store_true",
        help="Promote every warning to an error.",
    )
    args = ap.parse_args()

    if not args.state.is_file():
        sys.exit(f"state file not found: {args.state}")
    if not args.prepared.is_dir():
        sys.exit(f"prepared directory not found: {args.prepared}")
    index_path = args.prepared / "index.json"
    overview_path = args.prepared / "overview.png"
    if not index_path.is_file():
        sys.exit(f"missing {index_path} (run prepare.py first)")
    if not overview_path.is_file():
        sys.exit(f"missing {overview_path} (run prepare.py first)")

    state = json.loads(args.state.read_text())
    index = json.loads(index_path.read_text())

    errors, warnings, stats = topology_check(state)

    counts, no_bbox = per_tile_coverage(stats["nodes_by_id"], index)
    empty = [tile for tile, n in counts.items() if n == 0]
    if empty:
        warnings.append(
            "tiles with zero captured nodes (could be whitespace OR missed coverage): " + ", ".join(empty),
        )
    if no_bbox:
        warnings.append(
            f"{len(no_bbox)} nodes have no src_bbox sidecar; "
            "they are skipped on the coverage overlay: " + ", ".join(no_bbox),
        )

    coverage_out = args.out or (args.prepared / "coverage.png")
    render_coverage_overlay(
        stats["nodes_by_id"],
        stats["start"],
        overview_path,
        tuple(index["src_size"]),
        coverage_out,
    )

    summary = {
        "start": stats["start"],
        "decisions": stats["decisions"],
        "books": stats["books"],
        "edges": stats["edges"],
        "reachable": stats["reachable"],
        "tile_counts": counts,
        "empty_tiles": empty,
        "nodes_without_src_bbox": no_bbox,
        "coverage_image": str(coverage_out),
        "errors": len(errors),
        "warnings": len(warnings),
    }
    print(json.dumps(summary, indent=2))
    for w in warnings:
        print(f"WARN: {w}", file=sys.stderr)
    for e in errors:
        print(f"ERR:  {e}", file=sys.stderr)

    if errors or (args.strict and warnings):
        sys.exit(1)


if __name__ == "__main__":
    main()
