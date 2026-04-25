# Extract Artist Subagent Prompt

Use this prompt for one queued reddit self-promotion post. Replace `<id>` before
launching the subagent.

```text
You are the find-artists extraction subagent for one reddit self-promotion post.

Post ID: <id>
Workspace root: /home/sam/projects/Samreay
Skill directory: /home/sam/projects/Samreay/.cursor/skills/find-artists

Goal:
Read exactly one queued markdown file,
`.cursor/skills/find-artists/references/to_extract/<id>.md`, decide whether it
contains a clear cover artist attribution, and if possible update the site data.
Do not inspect other queued markdown files.

Workflow:
1. Read `.cursor/skills/find-artists/references/to_extract/<id>.md`.
2. Look in the post body and every OP comment for phrases like "cover by",
   "art by", "artist is", "@artist_handle", fiverr URLs, artstation URLs,
   instagram handles, deviantart, behance, and personal sites.
3. Proceed only if there is clear attribution: an artist name plus at least one
   website, profile, handle, or cited link that unambiguously identifies one
   artist.
4. If attribution is missing or ambiguous, move the markdown unchanged to
   `.cursor/skills/find-artists/references/extracted/<id>.md`, make no
   `artists.yml` or cover changes, and report the skip reason.
5. If attribution is clear, pick a cover stem using existing
   `data/artists.yml` conventions: lowercase words joined by `_`, usually
   `seriesname<n>` for series books or the book slug for standalones. Check both
   `data/artists.yml` and `.cursor/skills/find-artists/tmp_covers/` to avoid
   collisions.
6. Download the best front-cover image from the markdown's `## Image URLs`
   section into `.cursor/skills/find-artists/tmp_covers/<stem>.(jpg|png|webp)`.
   Prefer the highest-resolution `preview.redd.it` image. Keep one file only.
   Verify it is portrait with an aspect ratio between 1.45 and 1.65. If the
   downloaded image is a wraparound or not in that ratio, try another image URL.
   If no acceptable front cover exists, delete any attempted download, move the
   markdown to `references/extracted/<id>.md`, and report the skip reason.
7. Update `data/artists.yml` with a targeted edit. Do not reserialize the file.
   It is alphabetically sorted by `name`, uses 2-space indentation below
   `- name:`, and uses 4-space indentation below `links:`.
8. Move the markdown to
   `.cursor/skills/find-artists/references/extracted/<id>.md`.
9. Report: `processed`, `skipped`, or `error`; artist name if found; cover stem
   if added; files changed; and any reason for skipping.

Updating `data/artists.yml`:
- If the artist already has an entry, append the new stem to their `covers:`
  list with `# https://www.reddit.com/r/ProgressionFantasy/comments/<id>/` on
  the same line as the new stem.
- If the existing `covers:` list is inline, expand it to a multiline block so
  the new commented stem can sit on its own line.
- If the artist is new, run a quick web search to confirm the preferred name
  and strongest link. Link priority is `website`, `artstation`, `instagram`,
  `deviantart`, `behance`, then `fiverr`. Royal Road, reddit,
  and facebook should not be allowed as links. If there are no links, skip the artist and the cover.
  Insert the new block in alphabetical position:

  - name: Firstname Lastname
    links:
      artstation: https://www.artstation.com/handle
    covers:
      - series_book1  # https://www.reddit.com/r/ProgressionFantasy/comments/<id>/


Every newly added cover stem must include the source self-promo thread URL in
an end-of-line comment. Older stems without comments are fine; do not
bulk-annotate historical entries.
```
