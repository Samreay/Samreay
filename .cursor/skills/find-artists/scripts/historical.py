# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "polars>=0.20",
#   "requests>=2.31",
# ]
# ///
"""Export historical r/ProgressionFantasy Self-Promotion links via PullPush.

Writes one CSV per month under ``scripts/data/historical/`` with columns:
``id, link, upvotes, posting_datetime, title``.

PullPush can search all submission fields with ``q``; we use that to narrow the
result set, then confirm the flair locally from each returned submission.
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
PULLPUSH_URL = "https://api.pullpush.io/reddit/search/submission/"
QUERY = "Self-Promotion"
FLAIR = "Self-Promotion"
SIZE = 100
REQUEST_DELAY_SECONDS = 2
USER_AGENT = "python:samreay-find-artists-history:v0.1"
START_MONTH = datetime(2023, 1, 1, tzinfo=timezone.utc)

DATA_DIR = Path(__file__).parent / "data"
HISTORICAL_DIR = DATA_DIR / "historical"
CSV_FIELDS = ["id", "link", "upvotes", "posting_datetime", "title"]
SCHEMA = {
    "id": pl.Utf8,
    "link": pl.Utf8,
    "upvotes": pl.Int64,
    "posting_datetime": pl.Utf8,
    "title": pl.Utf8,
}


def add_month(dt: datetime) -> datetime:
    year = dt.year + (1 if dt.month == 12 else 0)
    month = 1 if dt.month == 12 else dt.month + 1
    return dt.replace(year=year, month=month)


def month_path(month_start: datetime) -> Path:
    return HISTORICAL_DIR / f"{month_start:%Y-%m}.csv"


def is_self_promotion(submission: dict[str, Any]) -> bool:
    flair = (
        submission.get("link_flair_text")
        or submission.get("flair_text")
        or submission.get("link_flair_css_class")
        or ""
    )
    return str(flair).casefold() == FLAIR.casefold()


def reddit_link(submission: dict[str, Any]) -> str:
    permalink = submission.get("permalink") or submission.get("full_link") or ""
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
        "upvotes": int(submission.get("score") or 0),
        "posting_datetime": posted,
        "title": title,
    }


def fetch_page(
    session: requests.Session,
    after: int,
    before: int,
) -> list[dict[str, Any]]:
    params: dict[str, str | int] = {
        # "q": QUERY,
        "subreddit": SUBREDDIT,
        "size": SIZE,
        "sort": "desc",
        "sort_type": "created_utc",
        "after": after,
        "before": before,
    }

    response = session.get(PULLPUSH_URL, params=params, timeout=30)
    response.raise_for_status()
    payload = response.json()
    return payload.get("data", [])


def fetch_page_with_retry(
    session: requests.Session,
    after: int,
    before: int,
) -> list[dict[str, Any]]:
    while True:
        try:
            return fetch_page(session, after=after, before=before)
        except requests.HTTPError as exc:
            print(f"[historical] HTTP error: {exc}", file=sys.stderr)  # noqa: T201
            if exc.response is None or exc.response.status_code != 429:
                raise
            time.sleep(30)


def add_self_promotion_rows(
    submissions: list[dict[str, Any]],
    seen_ids: set[str],
    rows: list[dict[str, str | int]],
) -> int:
    page_rows = 0
    for submission in submissions:
        post_id = str(submission.get("id") or "")
        if not post_id or post_id in seen_ids:
            continue
        seen_ids.add(post_id)

        if is_self_promotion(submission):
            rows.append(csv_row(submission))
            page_rows += 1
    return page_rows


def collect_month_rows(
    session: requests.Session,
    month_start: datetime,
    month_end: datetime,
) -> pl.DataFrame:
    seen_ids: set[str] = set()
    rows: list[dict[str, str | int]] = []
    after = int(month_start.timestamp())
    before = int(month_end.timestamp())
    page = 0

    while True:
        page += 1
        print(  # noqa: T201
            f"[historical] {month_start:%Y-%m} page {page} after={after} before={before}",
            flush=True,
        )

        submissions = fetch_page_with_retry(session, after=after, before=before)
        if not submissions:
            print(f"[historical] {month_start:%Y-%m}: no more submissions", flush=True)  # noqa: T201
            break

        oldest_created = min(int(float(s.get("created_utc", 0))) for s in submissions)
        page_rows = add_self_promotion_rows(submissions, seen_ids, rows)

        print(  # noqa: T201
            f"[historical] {month_start:%Y-%m} page {page}: {len(submissions)} returned, "
            f"{page_rows} self-promo, oldest={datetime.fromtimestamp(oldest_created, tz=timezone.utc):%Y-%m-%d}",
            flush=True,
        )

        next_before = oldest_created - 1
        if next_before <= after:
            break
        if next_before >= before:
            print("[historical] stopping because pagination stopped moving", flush=True)  # noqa: T201
            break
        before = next_before
        time.sleep(REQUEST_DELAY_SECONDS)

    if not rows:
        return pl.DataFrame(schema=SCHEMA)
    return pl.DataFrame(rows, schema=SCHEMA).sort("posting_datetime", descending=True)


def write_month(df: pl.DataFrame, output_csv: Path) -> None:
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    df.select(CSV_FIELDS).write_csv(output_csv)


def main() -> int:
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    now = datetime.now(tz=timezone.utc)
    month_start = START_MONTH
    written = 0
    skipped = 0

    while month_start < now:
        month_end = min(add_month(month_start), now)
        output_csv = month_path(month_start)

        if output_csv.exists():
            print(f"[historical] skipping {month_start:%Y-%m}; {output_csv} exists", flush=True)  # noqa: T201
            skipped += 1
            month_start = add_month(month_start)
            continue

        df = collect_month_rows(session, month_start, month_end)
        write_month(df, output_csv)
        print(f"[historical] wrote {df.height} rows to {output_csv}", flush=True)  # noqa: T201
        written += 1
        month_start = add_month(month_start)

    print(f"[historical] done; wrote {written} monthly CSVs, skipped {skipped}", flush=True)  # noqa: T201
    return 0


if __name__ == "__main__":
    sys.exit(main())
