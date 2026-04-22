# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "polars>=0.20",
#   "requests>=2.31",
# ]
# ///
"""Scrape Self-Promotion post links from r/ProgressionFantasy.

Writes/updates ``scripts/data/links.csv`` with columns:
``id, url, title, created_utc, upvotes``.

Stops paginating when:
- A page returns only posts we already know about (overlap), OR
- We reach a post with ``created_utc`` older than the hard cutoff
  (2026-04-21, the earliest date we care about), OR
- Reddit returns no further ``after`` token.
"""

from __future__ import annotations

import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import polars as pl
import requests

SUBREDDIT = "ProgressionFantasy"
SEARCH_URL = f"https://www.reddit.com/r/{SUBREDDIT}/search.json"
QUERY = "flair:Self-Promotion"
LIMIT = 100
USER_AGENT = "python:samreay-find-artists:v0.1 (by /u/samreay)"
# Hard cutoff: don't bother fetching links older than this date.
CUTOFF_UTC = datetime(2026, 4, 21, tzinfo=timezone.utc).timestamp()

DATA_DIR = Path(__file__).parent / "data"
LINKS_CSV = DATA_DIR / "links.csv"

SCHEMA = {
    "id": pl.Utf8,
    "url": pl.Utf8,
    "title": pl.Utf8,
    "created_utc": pl.Float64,
    "upvotes": pl.Int64,
}


def load_links() -> pl.DataFrame:
    if LINKS_CSV.exists():
        return pl.read_csv(LINKS_CSV, schema_overrides=SCHEMA)
    return pl.DataFrame(schema=SCHEMA)


def save_links(df: pl.DataFrame) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df.sort("created_utc", descending=True).write_csv(LINKS_CSV)


def fetch_page(session: requests.Session, after: str | None) -> dict:
    params = {
        "q": QUERY,
        "sort": "new",
        "restrict_sr": "on",
        "limit": LIMIT,
        "t": "all",
    }
    if after:
        params["after"] = after
    resp = session.get(SEARCH_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def collect_from_page(
    children: list,
    known_ids: set[str],
) -> tuple[list[dict], int, float | None]:
    """Parse search results; return new row dicts, count new on page, oldest UTC on page."""
    new_from_page: list[dict] = []
    page_new = 0
    oldest_on_page: float | None = None
    for child in children:
        data = child.get("data", {})
        post_id = data.get("id")
        if not post_id:
            continue
        created = float(data.get("created_utc", 0))
        oldest_on_page = created if oldest_on_page is None else min(oldest_on_page, created)
        if post_id in known_ids:
            continue
        if created < CUTOFF_UTC:
            continue
        new_from_page.append(
            {
                "id": post_id,
                "url": "https://www.reddit.com" + data.get("permalink", ""),
                "title": data.get("title", "").replace("\n", " ").strip(),
                "created_utc": created,
                "upvotes": int(data.get("score", 0)),
            },
        )
        known_ids.add(post_id)
        page_new += 1
    return new_from_page, page_new, oldest_on_page


def main() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    known = load_links()
    known_ids = set(known["id"].to_list()) if known.height else set()

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    new_rows: list[dict] = []
    after: str | None = None
    page = 0
    stop_reason = "no more pages"

    while True:
        page += 1
        print(f"[fetch_links] page {page} after={after}", flush=True)  # noqa: T201
        try:
            payload = fetch_page(session, after)
        except requests.HTTPError as exc:
            print(f"[fetch_links] HTTP error: {exc}", file=sys.stderr)  # noqa: T201
            if exc.response is not None and exc.response.status_code == 429:
                time.sleep(30)
                continue
            return 1

        children = payload.get("data", {}).get("children", [])
        if not children:
            stop_reason = "empty page"
            break

        batch, page_new, oldest_on_page = collect_from_page(children, known_ids)
        new_rows.extend(batch)

        print(  # noqa: T201
            f"[fetch_links] page {page}: {len(children)} posts, {page_new} new, "
            f"oldest={datetime.fromtimestamp(oldest_on_page or 0, tz=timezone.utc):%Y-%m-%d}",
            flush=True,
        )

        if oldest_on_page is not None and oldest_on_page < CUTOFF_UTC:
            stop_reason = "hit cutoff date"
            break

        if page_new == 0 and known.height:
            stop_reason = "full page overlap with known"
            break

        after = payload.get("data", {}).get("after")
        if not after:
            stop_reason = "no after token"
            break

        time.sleep(2)

    if new_rows:
        new_df = pl.DataFrame(new_rows, schema=SCHEMA)
        combined = pl.concat([known, new_df], how="vertical") if known.height else new_df
        combined = combined.unique(subset=["id"], keep="first")
        save_links(combined)
    else:
        combined = known

    print(  # noqa: T201
        f"[fetch_links] stopped: {stop_reason}. added {len(new_rows)} new links, total {combined.height}.",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
