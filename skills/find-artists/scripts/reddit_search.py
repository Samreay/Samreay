# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "polars>=0.20",
#   "requests>=2.31",
# ]
# ///
"""Fetch Self-Promotion post links directly from Reddit's search API.

Reddit's search endpoint can return up to ~1000 posts (100 per page, 10 pages)
via cursor-based pagination. This is a complement/replacement for historical.py
when PullPush's index is lagging.

Requires a Devvit login; see ``reddit_auth.py``.

Writes ``scripts/data/historical/reddit_search.csv`` in the same schema as the
monthly CSVs so that ``fetch_posts.py`` picks it up automatically.

The output file is overwritten on every run. That is safe because
``fetch_posts.py`` uses ``fetched.csv`` to avoid re-processing post bodies.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import polars as pl
from reddit_auth import RedditAuthError, RedditReadSession, reddit_session

SUBREDDIT = "ProgressionFantasy"
USER_AGENT = "python:samreay-find-artists-reddit-search:v0.1 (by /u/samreay)"
SEARCH_PATH = f"/r/{SUBREDDIT}/search"
FLAIR = "Self-Promotion"
PAGE_SIZE = 100
MAX_PAGES = 10  # Reddit hard cap is ~1000 results via search pagination

DATA_DIR = Path(__file__).parent / "data"
HISTORICAL_DIR = DATA_DIR / "historical"
OUTPUT_CSV = HISTORICAL_DIR / "reddit_search.csv"

CSV_FIELDS = ["id", "link", "upvotes", "posting_datetime", "title"]
SCHEMA = {
    "id": pl.Utf8,
    "link": pl.Utf8,
    "upvotes": pl.Int64,
    "posting_datetime": pl.Utf8,
    "title": pl.Utf8,
}


def is_self_promotion(submission: dict[str, Any]) -> bool:
    flair = submission.get("link_flair_text") or submission.get("link_flair_css_class") or ""
    return str(flair).casefold() == FLAIR.casefold()


def reddit_link(submission: dict[str, Any]) -> str:
    permalink = submission.get("permalink") or ""
    if permalink.startswith("http"):
        return permalink
    if permalink:
        return f"https://www.reddit.com{permalink}"
    return f"https://www.reddit.com/r/{SUBREDDIT}/comments/{submission['id']}/"


def csv_row(submission: dict[str, Any]) -> dict[str, str | int]:
    created_utc = int(float(submission.get("created_utc", 0)))
    posted = datetime.fromtimestamp(created_utc, tz=timezone.utc).isoformat()
    title = str(submission.get("title") or "").replace("\n", " ").strip()
    return {
        "id": str(submission["id"]),
        "link": reddit_link(submission),
        "upvotes": int(submission.get("score", 0)),
        "posting_datetime": posted,
        "title": title,
    }


def fetch_page(
    session: RedditReadSession,
    after: str | None,
) -> tuple[list[dict[str, Any]], str | None]:
    """Return ``(submissions, next_after)``."""
    params: dict[str, str | int] = {
        "q": f'flair:"{FLAIR}"',
        "restrict_sr": "1",
        "sort": "new",
        "limit": PAGE_SIZE,
    }
    if after:
        params["after"] = after

    resp = session.get(SEARCH_PATH, params=params)
    resp.raise_for_status()
    payload = resp.json()
    listing = payload.get("data", {})
    children = listing.get("children", [])
    submissions = [c["data"] for c in children if c.get("kind") == "t3"]
    next_after = listing.get("after")
    return submissions, next_after


def main() -> int:
    # The session paces itself and retries 429s, so this loop only has to
    # worry about hard failures.
    try:
        session = reddit_session(USER_AGENT)
    except RedditAuthError as exc:
        print(f"[reddit_search] {exc}", file=sys.stderr)  # noqa: T201
        return 1

    rows: list[dict[str, str | int]] = []
    seen_ids: set[str] = set()
    after: str | None = None

    for page in range(1, MAX_PAGES + 1):
        print(f"[reddit_search] page {page} after={after!r}", flush=True)  # noqa: T201
        submissions, after = fetch_page(session, after)

        if not submissions:
            print("[reddit_search] no more results", flush=True)  # noqa: T201
            break

        page_rows = 0
        for sub in submissions:
            post_id = str(sub.get("id") or "")
            if not post_id or post_id in seen_ids:
                continue
            seen_ids.add(post_id)
            if is_self_promotion(sub):
                rows.append(csv_row(sub))
                page_rows += 1

        print(  # noqa: T201
            f"[reddit_search] page {page}: {len(submissions)} returned, {page_rows} self-promo",
            flush=True,
        )

        if not after:
            print("[reddit_search] no next cursor, done", flush=True)  # noqa: T201
            break

    if not rows:
        print("[reddit_search] no self-promo posts found", flush=True)  # noqa: T201
        return 0

    df = pl.DataFrame(rows, schema=SCHEMA).sort("posting_datetime", descending=True)
    HISTORICAL_DIR.mkdir(parents=True, exist_ok=True)
    df.select(CSV_FIELDS).write_csv(OUTPUT_CSV)
    print(f"[reddit_search] wrote {df.height} rows to {OUTPUT_CSV}", flush=True)  # noqa: T201
    return 0


if __name__ == "__main__":
    sys.exit(main())
