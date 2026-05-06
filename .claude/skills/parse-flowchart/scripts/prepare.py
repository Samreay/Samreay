# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pillow>=10",
# ]
# ///
"""Prepare a giant flowchart image for the parse-flowchart agent loop.

The flowchart JPEGs exported from Figma are too large to feed directly into a
vision model (the canonical example is ~32k x 25k px, ~80 MB). This script
slices them into overlapping mid-zoom tiles plus a downscaled overview that
together fit comfortably in repeated vision-model calls, while preserving
absolute pixel coordinates so the agent can ask for full-resolution crops
later via ``crop.py``.

Outputs (under ``work/<image-stem>/``):

- ``overview.png`` — entire image scaled so the long edge is at most
  ``--max-dim`` px (default 2000). Lossy structural preview.
- ``overview_grid.png`` — same overview with the tile grid + ``rRcC`` labels
  drawn in red. Use this to reason about positions before zooming.
- ``tiles/r{R}_c{C}.png`` — every mid-zoom tile, each downscaled so its long
  edge is at most ``--max-dim`` px. The tile grid is overlapping (default 10%)
  so a node sitting on a seam appears whole in at least one tile.
- ``index.json`` — full metadata: source dimensions, overview scale, and for
  each tile its row/col, src bbox in original-image coords, downscaled size,
  and the ``scale`` factor (downscaled px / original px) so the agent can
  convert tile-local pixel positions back to absolute coordinates with
  ``orig_x = src_bbox[0] + tile_local_x / scale``.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# JPEGs from Figma can blow past Pillow's anti-DOS pixel cap; opting out is
# safe here because the source is a trusted local file.
Image.MAX_IMAGE_PIXELS = None

DEFAULT_GRID = (4, 4)
DEFAULT_OVERLAP = 0.10
DEFAULT_MAX_DIM = 2000


def parse_grid(value: str) -> tuple[int, int]:
    cols_s, rows_s = value.lower().split("x")
    return int(cols_s), int(rows_s)


def downscale_to_max_dim(im: Image.Image, max_dim: int) -> Image.Image:
    w, h = im.size
    scale = max_dim / max(w, h)
    if scale >= 1.0:
        return im.copy()
    return im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)


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


def prepare(
    image_path: Path,
    work_root: Path,
    grid: tuple[int, int],
    overlap: float,
    max_dim: int,
) -> dict:
    cols, rows = grid
    im = Image.open(image_path)
    width, height = im.size
    stem = image_path.stem

    out_dir = work_root / stem
    tiles_dir = out_dir / "tiles"
    tiles_dir.mkdir(parents=True, exist_ok=True)

    overview = downscale_to_max_dim(im, max_dim).convert("RGB")
    overview.save(out_dir / "overview.png", optimize=True)

    cell_w = width / cols
    cell_h = height / rows
    pad_x = int(cell_w * overlap)
    pad_y = int(cell_h * overlap)

    tiles_meta: list[dict] = []
    for r in range(rows):
        for c in range(cols):
            x0 = max(0, int(c * cell_w) - pad_x)
            y0 = max(0, int(r * cell_h) - pad_y)
            x1 = min(width, int((c + 1) * cell_w) + pad_x)
            y1 = min(height, int((r + 1) * cell_h) + pad_y)
            crop = im.crop((x0, y0, x1, y1))
            small = downscale_to_max_dim(crop, max_dim).convert("RGB")
            relpath = f"tiles/r{r}_c{c}.png"
            small.save(out_dir / relpath, optimize=True)
            tile_w, tile_h = small.size
            src_w = x1 - x0
            src_h = y1 - y0
            tiles_meta.append(
                {
                    "row": r,
                    "col": c,
                    "src_bbox": [x0, y0, x1, y1],
                    "src_size": [src_w, src_h],
                    "tile_size": [tile_w, tile_h],
                    "scale": tile_w / src_w if src_w else 1.0,
                    "path": relpath,
                },
            )

    annot = overview.copy()
    draw = ImageDraw.Draw(annot)
    overview_w, overview_h = annot.size
    sx = overview_w / width
    sy = overview_h / height
    font = load_font(max(18, int(overview_w / 60)))
    for tile in tiles_meta:
        x0, y0, x1, y1 = tile["src_bbox"]
        rect = [x0 * sx, y0 * sy, x1 * sx, y1 * sy]
        draw.rectangle(rect, outline=(220, 38, 38), width=3)
        label = f"r{tile['row']}c{tile['col']}"
        # Outline the label so it stays legible over busy backgrounds.
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            draw.text(
                (rect[0] + 10 + dx, rect[1] + 8 + dy),
                label,
                fill="white",
                font=font,
            )
        draw.text((rect[0] + 10, rect[1] + 8), label, fill=(220, 38, 38), font=font)
    annot.save(out_dir / "overview_grid.png", optimize=True)

    index = {
        "image": str(image_path),
        "src_size": [width, height],
        "overview_max_dim": max_dim,
        "overview_size": list(overview.size),
        "overview_scale": overview.size[0] / width,
        "grid": [cols, rows],
        "overlap": overlap,
        "tiles": tiles_meta,
    }
    (out_dir / "index.json").write_text(json.dumps(index, indent=2))
    return {"out_dir": str(out_dir), "tiles": len(tiles_meta), "src_size": [width, height]}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image", type=Path, help="Path to the source flowchart image.")
    ap.add_argument(
        "--work-root",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "work",
        help="Root output directory (a subfolder named after the image stem is created).",
    )
    ap.add_argument(
        "--grid",
        type=parse_grid,
        default=DEFAULT_GRID,
        help="Tile grid as COLSxROWS (default 4x4). Use 8x8 for finer text detail.",
    )
    ap.add_argument(
        "--overlap",
        type=float,
        default=DEFAULT_OVERLAP,
        help="Fractional overlap between adjacent tiles (default 0.10).",
    )
    ap.add_argument(
        "--max-dim",
        type=int,
        default=DEFAULT_MAX_DIM,
        help="Max long-edge size (px) of overview and each tile (default 2000).",
    )
    args = ap.parse_args()
    summary = prepare(args.image, args.work_root, args.grid, args.overlap, args.max_dim)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
