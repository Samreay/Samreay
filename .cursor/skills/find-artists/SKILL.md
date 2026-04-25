---
name: find-artists
description: >-
  Scrapes r/ProgressionFantasy Self-Promotion posts to discover cover artists,
  downloads covers into tmp_covers/, and updates data/artists.yml. Use when the
  user asks to find cover artists from reddit, refresh the artist database from
  recent self-promo posts, or pull new covers into the site.
---

# Find artists from r/ProgressionFantasy

Three-part workflow: **(1) gather reddit post content**, **(2) extract artist
info from each post and update `data/artists.yml` + `tmp_covers/`**, then **(3)
rebuild the site** to validate naming.

All state lives under this skill directory so we never re-fetch the same post:

- `scripts/data/historical/YYYY-MM.csv` — monthly self-promo post link exports.
- `scripts/data/fetched.csv` — posts we have already pulled bodies for.
- `references/to_extract/<id>.md` — queued post text waiting for artist extraction.
- `references/extracted/<id>.md` — post text moved here after extraction.

Run all scripts via `uv run` (they use inline script metadata to pull
`polars` and `requests`).

## PART ONE — Find and fetch links

Run these two scripts. They are idempotent — safe to re-run to pick up new posts.

```bash
uv run .cursor/skills/find-artists/scripts/historical.py
uv run .cursor/skills/find-artists/scripts/fetch_posts.py
```

**`historical.py`** paginates the PullPush submission search API month by month,
writing each completed month to `scripts/data/historical/YYYY-MM.csv`. It skips
months whose CSV already exists, so it is safe to re-run.

**`fetch_posts.py`** reads every CSV in `scripts/data/historical/`, fetches any
link not in `scripts/data/fetched.csv`, skips posts with fewer than 5 upvotes
(marked `skipped_low_upvotes`), and for the rest writes
`references/to_extract/<id>.md` containing post front-matter, the selftext,
any image URLs, and every comment by the OP.

If Reddit rate-limits (HTTP 429), the scripts sleep and retry. If a post is
gone (404/403) it is marked so we never retry.

## PART TWO — Extract artists with one-ID subagents

Do not load many queued markdown files into the main context. The main agent's
job is only to list IDs in `references/to_extract/`, then launch a fresh
subagent for one ID at a time. Wait for each subagent to finish before starting
the next one, because every successful extraction may edit the shared
`data/artists.yml`.

Use the Cursor `Subagent` tool with `subagent_type="generalPurpose"`. For each
ID, read `references/extract-artist-subagent.md`, replace `<id>` in that prompt,
and launch the subagent with the resulting prompt.

## PART THREE — Rebuild and validate

Once all queued posts are processed, start the site:

```bash
uv run python resize.py
```

This will exit non-zero and print any mismatches:

- `Missing N covers in YAML` — stems exist in `tmp_covers/` but no artist
  claims them. Go back and add them to the correct artist.
- `Missing N files` — `artists.yml` references a stem with no matching file
  in `tmp_covers/`. Typically a typo in the stem; fix the yaml entry to
  match the file on disk.

Fix, re-run `uv run python resize.py`, repeat until it reports no missing covers.

Finally, process the covers using `hugo --gc --minify -D`


## Notes

- PullPush search is fetched month by month to keep each query window small and
  resumable.
- The scripts use a 2-second sleep between requests to stay polite. If you
  need to process a backlog and hit 429s, increase that delay.
- If `fetched.csv` gets corrupted, deleting it is safe — any existing markdown
  in `references/` is treated as already-fetched on the next run.
