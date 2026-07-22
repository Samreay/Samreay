# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pillow>=10",
# ]
# ///
"""Crop a window from the original flowchart image at full resolution.

Use this from the parse-flowchart agent loop when a tile downscaled by
``prepare.py`` does not show enough detail to read a node's text or to
identify a book cover, or when an edge label sits on a seam between tiles.

Specify the region in **original-image pixel coordinates** (the same space
``index.json``'s ``src_bbox`` uses). One of ``--bbox`` or ``--center`` is
required.

Outputs a PNG (downscaled if it would otherwise exceed ``--max-dim`` on its
long edge, default 2000 px) plus a one-line JSON summary so the agent can
record where the crop came from.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

DEFAULT_MAX_DIM = 2000


def parse_int_pair(value: str) -> tuple[int, int]:
    a, b = value.split(",")
    return int(a), int(b)


def parse_int_quad(value: str) -> tuple[int, int, int, int]:
    parts = [int(p) for p in value.split(",")]
    if len(parts) != 4:
        msg = f"expected x0,y0,x1,y1 but got {value!r}"
        raise ValueError(msg)
    return parts[0], parts[1], parts[2], parts[3]


def resolve_bbox(
    src_size: tuple[int, int],
    bbox: tuple[int, int, int, int] | None,
    center: tuple[int, int] | None,
    size: tuple[int, int] | None,
    pad: int,
) -> tuple[int, int, int, int]:
    width, height = src_size
    if bbox is not None:
        x0, y0, x1, y1 = bbox
    elif center is not None:
        if size is None:
            msg = "--center requires --size W,H"
            raise SystemExit(msg)
        cx, cy = center
        w, h = size
        x0 = cx - w // 2
        y0 = cy - h // 2
        x1 = x0 + w
        y1 = y0 + h
    else:
        msg = "must supply either --bbox or --center+--size"
        raise SystemExit(msg)
    x0 -= pad
    y0 -= pad
    x1 += pad
    y1 += pad
    x0 = max(0, x0)
    y0 = max(0, y0)
    x1 = min(width, x1)
    y1 = min(height, y1)
    if x1 <= x0 or y1 <= y0:
        msg = f"empty crop after clamping: ({x0},{y0},{x1},{y1})"
        raise SystemExit(msg)
    return x0, y0, x1, y1


def downscale_to_max_dim(im: Image.Image, max_dim: int) -> Image.Image:
    w, h = im.size
    scale = max_dim / max(w, h)
    if scale >= 1.0:
        return im.copy()
    return im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image", type=Path, help="Path to the source flowchart image.")
    ap.add_argument("--out", type=Path, required=True, help="Output PNG path.")
    ap.add_argument("--bbox", type=parse_int_quad, help="x0,y0,x1,y1 in original-image coords.")
    ap.add_argument("--center", type=parse_int_pair, help="x,y of crop centre in original-image coords.")
    ap.add_argument("--size", type=parse_int_pair, help="width,height for --center mode.")
    ap.add_argument(
        "--pad",
        type=int,
        default=0,
        help="Extra px added on every side before clamping (handy when zooming on an edge label).",
    )
    ap.add_argument(
        "--max-dim",
        type=int,
        default=DEFAULT_MAX_DIM,
        help="Cap the long edge of the saved PNG (default 2000). Set 0 to keep native resolution.",
    )
    args = ap.parse_args()

    im = Image.open(args.image)
    bbox = resolve_bbox(im.size, args.bbox, args.center, args.size, args.pad)
    crop = im.crop(bbox).convert("RGB")
    if args.max_dim and args.max_dim > 0:
        crop = downscale_to_max_dim(crop, args.max_dim)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    crop.save(args.out, optimize=True)

    summary = {
        "out": str(args.out),
        "src_bbox": list(bbox),
        "src_size": [bbox[2] - bbox[0], bbox[3] - bbox[1]],
        "saved_size": list(crop.size),
        "scale": crop.size[0] / (bbox[2] - bbox[0]),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
