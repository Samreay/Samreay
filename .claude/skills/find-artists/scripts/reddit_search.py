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

Writes ``scripts/data/historical/reddit_search.csv`` in the same schema as the
monthly CSVs so that ``fetch_posts.py`` picks it up automatically.

The output file is overwritten on every run. That is safe because
``fetch_posts.py`` uses ``fetched.csv`` to avoid re-processing post bodies.
"""

from __future__ import annotations

import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import polars as pl
import requests

SUBREDDIT = "ProgressionFantasy"
USER_AGENT = "python:samreay-find-artists-reddit-search:v0.1 (by /u/samreay)"
SEARCH_URL = f"https://www.reddit.com/r/{SUBREDDIT}/search.json"
FLAIR = "Self-Promotion"
PAGE_SIZE = 100
MAX_PAGES = 10  # Reddit hard cap is ~1000 results via search pagination
REQUEST_DELAY_SECONDS = 2

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
    flair = (
        submission.get("link_flair_text")
        or submission.get("link_flair_css_class")
        or ""
    )
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
    session: requests.Session,
    after: str | None,
) -> tuple[list[dict[str, Any]], str | None]:
    """Return ``(submissions, next_after)``."""
    params: dict[str, str | int] = {
        "q": f'flair:"{FLAIR}"',
        "restrict_sr": "1",
        "sort": "new",
        "limit": PAGE_SIZE,
        "raw_json": "1",
    }
    if after:
        params["after"] = after

    resp = session.get(SEARCH_URL, params=params, timeout=30)
    resp.raise_for_status()
    payload = resp.json()
    listing = payload.get("data", {})
    children = listing.get("children", [])
    submissions = [c["data"] for c in children if c.get("kind") == "t3"]
    next_after = listing.get("after")
    return submissions, next_after


def fetch_page_with_retry(
    session: requests.Session,
    after: str | None,
) -> tuple[list[dict[str, Any]], str | None]:
    while True:
        try:
            return fetch_page(session, after)
        except requests.HTTPError as exc:
            print(f"[reddit_search] HTTP error: {exc}", file=sys.stderr)  # noqa: T201
            if exc.response is None or exc.response.status_code != 429:
                raise
            print("[reddit_search] rate limited, sleeping 60s…", flush=True)  # noqa: T201
            time.sleep(60)


def main() -> int:
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    rows: list[dict[str, str | int]] = []
    seen_ids: set[str] = set()
    after: str | None = None

    for page in range(1, MAX_PAGES + 1):
        print(f"[reddit_search] page {page} after={after!r}", flush=True)  # noqa: T201
        submissions, after = fetch_page_with_retry(session, after)

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

        time.sleep(REQUEST_DELAY_SECONDS)

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
