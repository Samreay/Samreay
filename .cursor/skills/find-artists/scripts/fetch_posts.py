# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "polars>=0.20",
#   "requests>=2.31",
# ]
# ///
"""Fetch post bodies + OP comments for each new Self-Promotion link.

Inputs:
- ``scripts/data/links.csv`` (produced by fetch_links.py)
- ``scripts/data/fetched.csv`` (this script's state: what we have processed)

For each link in ``links.csv`` not yet in ``fetched.csv``:

1. Fetch the post JSON from Reddit.
2. If upvotes < 5, record as ``skipped_low_upvotes`` in ``fetched.csv``.
3. Otherwise, write the post body + all OP comments to
   ``references/to_extract/<id>.md`` and record as ``queued``.

The generated markdown file has a small YAML front-matter block with the
post id, title, URL, upvotes and author so that downstream agent steps
have all the context they need.
"""

from __future__ import annotations

import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import polars as pl
import requests

USER_AGENT = "python:samreay-find-artists:v0.1 (by /u/samreay)"
MIN_UPVOTES = 5

SKILL_DIR = Path(__file__).parent.parent
DATA_DIR = Path(__file__).parent / "data"
LINKS_CSV = DATA_DIR / "links.csv"
FETCHED_CSV = DATA_DIR / "fetched.csv"
TO_EXTRACT_DIR = SKILL_DIR / "references" / "to_extract"
EXTRACTED_DIR = SKILL_DIR / "references" / "extracted"

FETCHED_SCHEMA = {
    "id": pl.Utf8,
    "status": pl.Utf8,
    "upvotes": pl.Int64,
    "fetched_at": pl.Utf8,
}


def load_fetched() -> pl.DataFrame:
    if FETCHED_CSV.exists():
        return pl.read_csv(FETCHED_CSV, schema_overrides=FETCHED_SCHEMA)
    return pl.DataFrame(schema=FETCHED_SCHEMA)


def append_fetched(rows: list[dict]) -> None:
    if not rows:
        return
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    existing = load_fetched()
    new_df = pl.DataFrame(rows, schema=FETCHED_SCHEMA)
    combined = pl.concat([existing, new_df], how="vertical") if existing.height else new_df
    combined = combined.unique(subset=["id"], keep="last")
    combined.write_csv(FETCHED_CSV)


def fetch_post(session: requests.Session, post_id: str) -> tuple[dict, list[dict]]:
    """Return ``(post_data, op_comments)``.

    ``op_comments`` is a flat list of comment dicts authored by the
    original poster, in the order returned by the API (effectively
    best-first), walking nested replies.
    """
    url = f"https://www.reddit.com/comments/{post_id}.json"
    resp = session.get(url, params={"limit": 500, "raw_json": 1}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    post = data[0]["data"]["children"][0]["data"]
    op_author = post.get("author")

    op_comments: list[dict] = []

    def walk(listing: dict) -> None:
        for child in listing.get("data", {}).get("children", []):
            if child.get("kind") != "t1":
                continue
            cdata = child.get("data", {})
            if cdata.get("author") == op_author:
                op_comments.append(cdata)
            replies = cdata.get("replies")
            if isinstance(replies, dict):
                walk(replies)

    walk(data[1])
    return post, op_comments


def render_markdown(post: dict, op_comments: list[dict]) -> str:
    title = (post.get("title") or "").replace("\n", " ").strip()
    url = "https://www.reddit.com" + post.get("permalink", "")
    author = post.get("author", "unknown")
    upvotes = int(post.get("score", 0))
    created = datetime.fromtimestamp(
        float(post.get("created_utc", 0)),
        tz=timezone.utc,
    ).strftime("%Y-%m-%d")

    body = (post.get("selftext") or "").strip()

    lines = [
        "---",
        f"id: {post.get('id')}",
        f"title: {title!r}",
        f"author: {author}",
        f"url: {url}",
        f"upvotes: {upvotes}",
        f"created: {created}",
        "---",
        "",
        "## Post body",
        "",
        body or "_(no body text)_",
        "",
    ]

    # Collect linked images so the artist-extract step can grab a cover.
    preview_urls: list[str] = []
    preview = post.get("preview") or {}
    for img in preview.get("images", []) or []:
        src = (img.get("source") or {}).get("url")
        if src:
            preview_urls.append(src)
    gallery = post.get("media_metadata") or {}
    for item in gallery.values():
        src = (item.get("s") or {}).get("u")
        if src:
            preview_urls.append(src)
    if post.get("url_overridden_by_dest"):
        preview_urls.append(post["url_overridden_by_dest"])

    if preview_urls:
        lines += ["## Image URLs", ""]
        lines += [f"- {u}" for u in dict.fromkeys(preview_urls)]
        lines.append("")

    if op_comments:
        lines += ["## OP comments", ""]
        for c in op_comments:
            parent = c.get("parent_id", "")
            lines.append(f"### Comment {c.get('id')} (parent {parent})")
            lines.append("")
            lines.append((c.get("body") or "").strip())
            lines.append("")

    return "\n".join(lines)


def main() -> int:
    if not LINKS_CSV.exists():
        print("[fetch_posts] no links.csv; run fetch_links.py first.", file=sys.stderr)  # noqa: T201
        return 1

    links = pl.read_csv(LINKS_CSV)
    fetched = load_fetched()
    fetched_ids = set(fetched["id"].to_list()) if fetched.height else set()

    # Also treat anything already present in references/ as fetched, in case
    # someone nuked fetched.csv but kept the markdown.
    for p in list(TO_EXTRACT_DIR.glob("*.md")) + list(EXTRACTED_DIR.glob("*.md")):
        fetched_ids.add(p.stem)

    todo = links.filter(~pl.col("id").is_in(list(fetched_ids)))
    print(f"[fetch_posts] {todo.height} links to process", flush=True)  # noqa: T201

    TO_EXTRACT_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    new_fetched: list[dict] = []
    for row in todo.iter_rows(named=True):
        post_id = row["id"]
        try:
            post, op_comments = fetch_post(session, post_id)
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else "?"
            print(f"[fetch_posts] {post_id}: HTTP {status}", file=sys.stderr)  # noqa: T201
            if status == 429:
                time.sleep(30)
                continue
            # 404 / 403 -> mark as unavailable so we don't keep retrying.
            new_fetched.append(
                {
                    "id": post_id,
                    "status": f"http_{status}",
                    "upvotes": 0,
                    "fetched_at": datetime.now(tz=timezone.utc).isoformat(),
                },
            )
            continue
        except (requests.RequestException, ValueError) as exc:
            print(f"[fetch_posts] {post_id}: {exc}", file=sys.stderr)  # noqa: T201
            time.sleep(5)
            continue

        upvotes = int(post.get("score", 0))
        if upvotes < MIN_UPVOTES:
            status = "skipped_low_upvotes"
            print(f"[fetch_posts] {post_id}: {upvotes} upvotes, skipping", flush=True)  # noqa: T201
        else:
            out = TO_EXTRACT_DIR / f"{post_id}.md"
            out.write_text(render_markdown(post, op_comments), encoding="utf-8")
            status = "queued"
            print(  # noqa: T201
                f"[fetch_posts] {post_id}: {upvotes} upvotes, wrote {out.name} ({len(op_comments)} OP comments)",
                flush=True,
            )

        new_fetched.append(
            {
                "id": post_id,
                "status": status,
                "upvotes": upvotes,
                "fetched_at": datetime.now(tz=timezone.utc).isoformat(),
            },
        )
        time.sleep(2)

    append_fetched(new_fetched)
    print(f"[fetch_posts] done; added {len(new_fetched)} rows to fetched.csv", flush=True)  # noqa: T201
    return 0


if __name__ == "__main__":
    sys.exit(main())
