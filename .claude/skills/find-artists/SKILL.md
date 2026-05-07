---
name: find-artists
description: >-
  Scrapes r/ProgressionFantasy Self-Promotion posts to discover cover artists,
  downloads covers into tmp_covers/, and updates src/data/artists.ts. Use when
  the user asks to find cover artists from reddit, refresh the artist database
  from recent self-promo posts, or pull new covers into the site.
---

# Find artists from r/ProgressionFantasy

Three-part workflow: **(1) gather reddit post content**, **(2) extract artist
info from each post and update `src/data/artists.ts` + `tmp_covers/`**, then
**(3) promote covers into the Astro asset pipeline and rebuild**.

The site now runs on Astro. `src/data/artists.ts` is the source of truth for
the Artist Corner explorer (`src/pages/artists.astro` →
`src/components/islands/ArtistsExplorer.svelte`). Cover images live under
`src/assets/img/covers/` and are resolved by stem in `src/lib/covers.ts` via
`import.meta.glob('/src/assets/img/covers/*.{jpg,jpeg,png,webp}')`. Astro's
`getImage` (sharp) handles the resize/encode at build time, so this skill
never has to run a manual resize step — it just has to drop normalised files
into the covers folder.

All state lives under this skill directory so we never re-fetch the same post:

- `scripts/data/historical/YYYY-MM.csv` — monthly self-promo post link exports.
- `scripts/data/fetched.csv` — posts we have already pulled bodies for.
- `references/to_extract/<id>.md` — queued post text waiting for artist extraction.
- `references/extracted/<id>.md` — post text moved here after extraction.
- `tmp_covers/` — staging directory for newly downloaded cover files.

Run all scripts via `uv run` (they use inline script metadata to pull
`polars` and `requests`).

## PART ONE — Find and fetch links

Run these three scripts. They are idempotent — safe to re-run to pick up new posts.

```bash
uv run .claude/skills/find-artists/scripts/historical.py
uv run .claude/skills/find-artists/scripts/reddit_search.py
uv run .claude/skills/find-artists/scripts/fetch_posts.py
```

**`historical.py`** paginates the PullPush submission search API month by month,
writing each completed month to `scripts/data/historical/YYYY-MM.csv`. It skips
months whose CSV has >0 rows already. PullPush has roughly a 1-year ingestion
lag, so months without data yet are re-fetched on every run.

**`reddit_search.py`** hits Reddit's native search API directly (`/r/ProgressionFantasy/search.json?q=flair:"Self-Promotion"&sort=new`) and paginates up to ~250 posts (Reddit's practical search limit). It overwrites `scripts/data/historical/reddit_search.csv` on every run, covering the most recent posts that PullPush hasn't indexed yet. Run this alongside `historical.py` so the two sources complement each other.

**`fetch_posts.py`** reads every CSV in `scripts/data/historical/`, fetches any
link not in `scripts/data/fetched.csv`, skips posts with fewer than 10 upvotes
(marked `skipped_low_upvotes`), and for the rest writes
`references/to_extract/<id>.md` containing post front-matter, the selftext,
any image URLs, and every comment by the OP.

If Reddit rate-limits (HTTP 429), the scripts sleep and retry. If a post is
gone (404/403) it is marked so we never retry.

## PART TWO — Extract artists with one-ID subagents

Do not load many queued markdown files into the main context. The main agent's
job is only to list IDs in `references/to_extract/`, then launch a fresh
subagent for one ID at a time. Wait for each subagent to finish before starting
the next one, because every successful extraction edits the shared
`src/data/artists.ts`.

Use the `Agent` tool with `subagent_type="general-purpose"`. For each
ID, read `references/extract-artist-subagent.md`, replace `<id>` in that prompt,
and launch the subagent with the resulting prompt.

Each subagent:

1. Reads exactly one queued markdown file.
2. Decides whether attribution is clear; if not, moves the file to
   `references/extracted/` and reports a skip.
3. Picks a cover stem, downloads the front cover into `tmp_covers/<stem>.<ext>`,
   and inserts a new entry into `src/data/artists.ts` (alphabetical by `name`,
   trailing `// https://www.reddit.com/...` comment on the new stem line).
4. Moves the markdown to `references/extracted/`.

## PART THREE — Promote covers and rebuild

Once all queued posts are processed, audit and promote the staged covers:

```bash
uv run .claude/skills/find-artists/scripts/sync_covers.py            # report only
uv run .claude/skills/find-artists/scripts/sync_covers.py --apply    # also move tmp_covers/* into src/assets/img/covers/
```

`sync_covers.py` parses `src/data/artists.ts`, indexes
`src/assets/img/covers/` and `tmp_covers/`, and surfaces:

- **duplicate stems in artists.ts** — same stem listed twice; deduplicate.
- **stems with no file** — referenced in `artists.ts` but absent from both
  cover folders; usually a typo in the new entry, fix the `.ts` to match the
  filename you actually downloaded.
- **orphan files in `tmp_covers/`** — downloaded but never added to
  `artists.ts`; either add them to the right artist or delete them.
- **stem collisions across both folders** — a file exists in both
  `src/assets/img/covers/` and `tmp_covers/`; resolve manually (the apply
  step refuses to run while collisions exist, to avoid silently overwriting
  the canonical file).

Once the audit is clean, run `--apply` to move staged files into
`src/assets/img/covers/`. The Astro bundler picks them up automatically —
no resize step is needed because `src/lib/covers.ts` calls `getImage` from
`astro:assets`, which sharp transcodes to 500×800 webp at build time.

Finally, validate with a full Astro build:

```bash
npm run build
```

This must finish with exit code 0. The Phase 9 verifier
(`.claude/skills/implement-plan/scripts/phases/phase_9.py`) asserts that the
SSR HTML for `/artists/` contains exactly one `data-artist="…"` per non-hidden
artist with at least one cover, so any dropped artist will surface there as
well.

## Notes

- PullPush (`historical.py`) has ~1-year ingestion lag. `reddit_search.py` fills
  the gap for recent posts; together they cover both the long tail and the present.
- `reddit_search.py` overwrites its output CSV each run (safe, because
  `fetched.csv` prevents re-processing bodies). Reddit's search pagination caps
  at ~250 results sorted by new.
- The scripts use a 2-second sleep between requests to stay polite. If you
  need to process a backlog and hit 429s, increase that delay.
- If `fetched.csv` gets corrupted, deleting it is safe — any existing markdown
  in `references/` is treated as already-fetched on the next run.
- `sync_covers.py` only ever moves files into `src/assets/img/covers/`; it
  never deletes from `tmp_covers/` or rewrites the asset folder. Cleanups
  (e.g. removing an orphan that doesn't belong on the site) are explicit
  manual deletes.
- `data/artists.yml` is a deprecated Hugo-era mirror that may still exist in
  the working tree during the cutover. Do **not** edit it; it is no longer
  read by the site.
