---
name: book-review-template
description: >-
  Scaffolds out a new book review using a book or series name and the author.
  Use when the user is requesting a new review or a review scaffold or template.
---

# Book review template (Samreay)

## When this applies

The user names a **book** and **author** and wants a **new review stub** in `content/reviews/<slug>/index.md`, with links, blurb, and optional cover file.

## Content model (from existing reviews)

Create `content/reviews/<slug>/index.md` plus assets in the same folder.

### Front matter (YAML)

| Field | Required | Notes |
|-------|----------|--------|
| `title` | yes | Usually a review headline, e.g. `A Review of Author's 'Book Title'`. |
| `name` | yes | Short work title for cards / consistency (often the book or series name in quotes). |
| `auth` | yes | Author as credited (pen names, spacing as on listings). |
| `description` | yes | One line for the reviews list; can start from blurb + edit. |
| `date` | yes | `YYYY-MM-DD` (today unless user specifies). |
| `categories` | yes | Always `[reviews]`. |
| `review` | yes | Tier letter (site uses `S`, `A`, `B`, `C`, `F`, `π`, etc.). **Default for new stubs: `C`.** User may change after writing. |
| `weight` | yes | Numeric sort on tier list; use a temporary value (e.g. `50`) if final position is unknown. |
| `sentence` | yes | One-line hook; often the publisher/tagline from Amazon—may match first line of blurb. |
| `tags` | yes | Lowercase, hyphenated. Common: `in-progress`, `finished`, `litrpg`, `cultivation`, `isekai`, `slice-of-life`, `wholesome`, `sci-fi`, `cyberpunk`, `magic-school`, `female-lead`, `companion`, `kingdom-building`, `system-apocalypse`, `time-loops`, `crafting`, `hard-magic`, `lgbt`, `fanfic`, `parody`, `pf-adjacent`. Infer 2–6 from blurb + genre; user can edit. |
| `links` | when found | Keys under `links:` are indented **4 spaces** in this repo. Keys: `amazon` (Kindle/ebook URL—majority), `audible`, `royal_road`. Rare: `kindle` instead of `amazon`—prefer `amazon` for consistency. For **Amazon domain**: prefer **`amazon.com` (US)** over `amazon.com.au` or other regions when both list the same work; use a non-US storefront only if the US page is missing or clearly the wrong edition. Commented `# goodreads:` lines appear in some files—optional. |
| `aliases` | recommended | e.g. `aliases: [/reviews/<slug>]` for short URLs. Add extras only if user asks. |
| `short_title` | optional | Overrides list card `name` when `title` is long (see theme list layout). |
| `search_terms` | optional | Extra keywords for discoverability (series titles, first book name, etc.). |

### Body markdown

- Many reviews include a `## Blurb` section after optional “as of writing…” lines; paste cleaned Amazon/editorial description there (plain paragraphs; no HTML unless matching an existing review style).
- Some use blockquotes for blurbs instead—default to `## Blurb` + paragraphs unless user wants another style.
- **Always** include a `## Thoughts` section after the blurb (placeholder or draft text is fine). Do not omit it from new stubs.
- Cover in-folder: `cover.jpg` or `cover.png` as a **page resource**. The list template matches `*cover*` in page resources; inline image example used elsewhere: `![](cover.jpg?class="img-smaller")`.

### Folder slug `<slug>`

- Lowercase, words separated by `_`, strip characters unsafe in paths (e.g. `beware_of_chicken`, `fifty_shades_of_grey`).
- Must match the directory name and typically the primary `aliases` entry.

## Workflow

### 1. Confirm target path

- Propose `content/reviews/<slug>/` from title; adjust if the user prefers a different slug.

### 2. Research links (web search)

Run searches (book title + author) to find:

1. **Royal Road** — `site:royalroad.com` (fiction page for the work).
2. **Audible** — `site:audible.com` audiobook or series page.
3. **Amazon Kindle / ebook** — Prefer **`amazon.com`** listings. Use `site:amazon.com` first; only fall back to `amazon.com.au` (or other) if US has no suitable ebook page. Prefer ebook/Kindle ASIN URLs like `/dp/...` or `/...-ebook/dp/...`.

If any source is missing (no RR, no audio, etc.), omit that key—do not invent URLs.

### 3. Amazon blurb

- Open the Amazon product page (browser tools or fetch).
- Extract the **product description** (not “Editorial reviews” unless that’s all that exists). Strip navigation chrome, “Read more”, and duplicate headings.
- Use that text for:
  - `## Blurb` body (cleaned markdown paragraphs).
  - `sentence` — often the first sentence or official tagline if shown separately.
  - `description` — compress to one compelling line for the reviews index.

### 4. Build `index.md`

- Fill all required front matter fields.
- Set `links` only with verified URLs.
- After front matter `---`, add optional one-line reading-status stub if the user wants it, then `## Blurb` and the extracted text.
- **Always** add `## Thoughts` after the blurb. Use the user’s draft if they gave one; otherwise a one-line placeholder (e.g. _To write._) is fine—do not skip the heading.

### 5. Cover image

- From the Amazon page (or Audible), obtain a **high-resolution** cover image URL (direct image CDN URL, not the HTML page).
- Download into the review folder:

```bash
curl -fsSL -o "content/reviews/<slug>/cover.jpg" "<image-url>"
```

- If the file is PNG (check magic bytes or URL), use `cover.png` instead. **Final name must be** `cover.jpg` or `cover.png` only (no hashed filenames).
- If the book is not published on Amazon, check for other sources to find a cover image. Royal Road is a good backup.
- If no reliable image URL is available, skip the file and note it for the user.

### 6. Validate

- YAML indentation: spaces only; `links` child keys indented 4 spaces (matches existing reviews).
- No broken front matter quotes in `title` strings.

## Quick reference — minimal template

```markdown
---
title: "A Review of Author Name's 'Book Title'"
description: "One line for the reviews list."
date: YYYY-MM-DD
auth: Author Name
categories: [reviews]
review: C
weight: 50
name: "Book Title"
links:
    amazon: https://www.amazon.com/...
    audible: https://www.audible.com/...
    royal_road: https://www.royalroad.com/fiction/...
aliases: [/reviews/<slug>]
tags: [in-progress, litrpg]
sentence: "Official tagline or first hook sentence."
---

## Blurb

[Paste cleaned Amazon description.]

## Thoughts

_To write._

```

## Notes

- Amazon pages may block simple HTTP fetch; use browser snapshot or manual copy from search snippets as fallback, and still prefer a real product page when possible.
- Default storefront for `links.amazon` is **US (`amazon.com`)** when a US listing exists; non-US only when necessary for the correct edition.
