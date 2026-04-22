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

- `scripts/data/links.csv` — every self-promo post link we know about.
- `scripts/data/fetched.csv` — posts we have already pulled bodies for.
- `references/to_extract/<id>.md` — queued post text waiting for artist extraction.
- `references/extracted/<id>.md` — post text moved here after extraction.

Run all scripts via `uv run` (they use inline script metadata to pull
`polars` and `requests`).

## PART ONE — Find and fetch links

Run these two scripts. They are idempotent — safe to re-run to pick up new posts.

```bash
uv run .cursor/skills/find-artists/scripts/fetch_links.py
uv run .cursor/skills/find-artists/scripts/fetch_posts.py
```

**`fetch_links.py`** paginates `search.json?q=flair:Self-Promotion&sort=new` on
the subreddit. It stops when the page fully overlaps with `links.csv` or when
it reaches a post older than **2026-04-21**, then writes back
`scripts/data/links.csv`.

**`fetch_posts.py`** reads `links.csv`, fetches any link not in
`scripts/data/fetched.csv`, skips posts with fewer than 5 upvotes (marked
`skipped_low_upvotes`), and for the rest writes
`references/to_extract/<id>.md` containing post front-matter, the selftext,
any image URLs, and every comment by the OP.

If Reddit rate-limits (HTTP 429), the scripts sleep and retry. If a post is
gone (404/403) it is marked so we never retry.

## PART TWO — Extract the artist

For each file currently in `references/to_extract/`, do the following. Work
through them one at a time; skip anything ambiguous rather than guessing. Load the markdown into context when needed, do the extraction, and then unload them from context. We do not want confusion and context pollution.

### Workflow per post

Copy this checklist and tick items as you go:

```
- [ ] Read references/to_extract/<id>.md
- [ ] Decide: artist identified? (name + at least one link)
- [ ] If yes: pick a cover stem (series_booknumber, e.g. primal_hunter5)
- [ ] Download highest-resolution cover to tmp_covers/<stem>.(jpg|png|webp)
- [ ] Update data/artists.yml (existing artist OR new alphabetical entry)
- [ ] Move file to references/extracted/<id>.md
```

### 1. Read and decide

Open the queued markdown file. Look in the post body **and** every OP comment
for phrases like "cover by", "art by", "artist is", "@artist_handle", fiverr
URLs, artstation URLs, instagram handles, deviantart, behance, personal sites.

Decide:

- **Clear attribution** (name + website/handle that unambiguously identifies
  one artist) → proceed.
- **Ambiguous** (no artist mentioned, or only a first name, or multiple
  candidates) → skip: move the file to `references/extracted/<id>.md`
  unchanged and do not update `artists.yml`. Leave a one-line note in the
  conversation so the user knows why.

### 2. Pick a cover stem

Use the existing `data/artists.yml` conventions: lowercase, words joined by
`_`, series_then_book_number. Check `data/artists.yml` and `tmp_covers/` to
avoid collisions:

- First book of a series → `seriesname1` (e.g. `primal_hunter1`).
- Standalone → the book slug (e.g. `nowhere_stars`).
- If a series already exists in `artists.yml`, continue that pattern
  (`<series><n>`).

### 3. Download the cover

The markdown file has an `## Image URLs` section when reddit attached images.
Pick the highest-resolution URL with a (usually the `preview.redd.it` one) and download:

```bash
curl -fsSL -o "tmp_covers/<stem>.jpg" "<image-url>"
```

If the aspect ratio of the image is not portrait (1.5 or 1.6 aspect ratio), try downloading a different link. Some posts may contain a full wrap and the front cover. We want the front cover. If no image post is within aspect ratio 1.5 to 1.6, we do not want it.

Use `.png` or `.webp` only if the source is actually that format (check magic
bytes with `file tmp_covers/<stem>.jpg`). Keep one file per cover.

### 4. Update `data/artists.yml`

`artists.yml` is **alphabetically sorted by `name`** and uses a hand-formatted
`covers:` (always one line per cover with optional
`#` Reddit URL comments). Do not re-serialise the whole file — edit it with
targeted `StrReplace` calls so surrounding formatting stays intact.

**If the artist already has an entry** (grep by name or link):

- Append the new stem to their `covers:` list, with `# https://www.reddit.com/r/ProgressionFantasy/comments/POSTID/` on the same line as that stem.
- If the list of covers is inline (like `covers: [a, b]`), expand it to a multiline block, so the new stem can carry its comment; keep older stems on their own lines.
- For multi-line lists, add the new stem on its own line (with `#` URL) before the closing `]`.

**If the artist is new**:

1. Run a quick web search for the artist to confirm their preferred name and
   find their strongest link (priority: personal `website` > `artstation` >
   `instagram` > `deviantart` > `behance` > `fiverr`). Use whichever single
   link the post cited unless the search reveals a clearly better canonical
   one.
2. Insert a new block in alphabetical position. Template:

   ```yaml
   - name: Firstname Lastname
     links:
       artstation: https://www.artstation.com/handle
     covers: [
         series_book1,  # https://www.reddit.com/r/ProgressionFantasy/comments/POSTID/
         series_book2,  # https://www.reddit.com/r/ProgressionFantasy/comments/POSTID/
       ]
   ```

   **Every new cover stem** (whether on a new artist or appended to an existing
   one) must have the source self-promo thread URL in an end-of-line comment on
   that stem: either `  # https://www.reddit.com/.../comments/POSTID/` on the
   same line in a multiline `covers: [ ... ]` list, or `covers: [stem]  #
   https://...` when the entry is only that cover. The URL is the post in
   `references/to_extract` / `extracted` you pulled the attribution from. Older
   stems without comments are fine; do not bulk-annotate historical entries.

   Note: match **2-space indent** for keys under `- name:` and **4-space** for
   keys under `links:`. If you widen an existing one-line `covers: [a, b]` to
   add a commented stem, break it into a multiline `covers: [` block so each
   new stem can carry its own `#` URL.

### 5. Move the file

```bash
mv .cursor/skills/find-artists/references/to_extract/<id>.md \
   .cursor/skills/find-artists/references/extracted/<id>.md
```

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

- Reddit search is capped at ~250 results, but pagination plus the
  2026-04-21 cutoff means we cover everything posted since then across runs.
- The scripts use a 2-second sleep between requests to stay polite. If you
  need to process a backlog and hit 429s, increase that delay.
- If `links.csv` or `fetched.csv` gets corrupted, deleting them is safe —
  any existing markdown in `references/` is treated as already-fetched on
  the next run.
