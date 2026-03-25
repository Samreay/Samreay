---
name: sync-review-voice
description: >-
  Scans book review Thoughts sections under content/reviews/*/index.md,
  distills the author's preferred and avoided prose patterns, and updates
  .cursor/skills/humanizer/references/review-voice.md so the humanizer skill can preserve
  that voice. Use when the user asks to sync review voice, refresh humanizer
  calibration from reviews, or update writing-pattern preferences from the
  review corpus.
---

# Sync review voice → humanizer calibration

## When this applies

The user wants their **review corpus** to drive **humanizer** behavior: extract only real review prose (not YAML frontmatter, not the publisher **Blurb**), infer patterns they like vs. want avoided in edited output, and write that into `humanizer/references/review-voice.md`.

## What to read

1. **Corpus**: all `content/reviews/*/index.md` files (Hugo page bundles).

## Excluding non-thoughts content

- **YAML frontmatter**: between the first `---` and the closing `---` — omit entirely.
- **`## Blurb`**: editorial / Amazon-style copy — omit. If a review uses a blockquote blurb instead of `## Blurb`, treat quoted publisher-style wall of plot setup as blurb only when it clearly matches that role; when unsure, prefer including borderline material in the analysis only if it matches voice in **Thoughts** elsewhere in the same file.
- **`## Thoughts`**: this is the primary target. Use everything after that heading to end of file.

### If `## Thoughts` is missing (legacy reviews)

- If **`## Blurb` exists** but **`## Thoughts` does not**: use body content **after** the Blurb section (from the next heading or first paragraph after the blurb block through EOF).
- If **neither** `## Blurb` nor `## Thoughts` exists: treat the full markdown body after frontmatter as the review voice (entire post is author's words).

### Skip low-signal files

Do **not** use files for synthesis if the extracted thoughts are empty or are only a placeholder (e.g. `_To write._`, `TBD`, a single short stub line). Optionally note how many files were skipped.

## Analysis (what to extract)

From the aggregated **Thoughts** text, infer concise, actionable bullets under these headings in `references/review-voice.md`:

1. **Patterns to preserve** — diction, rhythm, stance (first person, asides, humor, sarcasm, conversational connectors), formatting habits (*italics* for titles, emphasis, occasional subheadings in long reviews), how comparisons and hot takes are framed, etc.
2. **Patterns to avoid in humanized output** — styles that would read **wrong** for this author even if they pass generic “good prose” tests (e.g. flattening sarcasm into neutral reportage, slide-deck technicality, PR-speak, faux-objective Wikipedia distance **when the piece is meant to read like a person talking**).
3. **Tension with AI-pattern removal** — short rules for how humanizer should **tighten** copy without **sterilizing** it (remove puffery and vague attribution; keep edge and conversational texture).

Cite **no** long verbatim quotes from reviews in the calibration file unless the user asked for examples; paraphrase patterns.

## Write / update outputs

1. **`.cursor/skills/humanizer/references/review-voice.md`**
   - Start with `Last updated: YYYY-MM-DD` (today).
   - One short **Corpus** line: how many `index.md` files were scanned, how many contributed substantive thoughts.
   - Keep the file **short** (target under ~120 lines). Progressive detail belongs in future edits, not essays.

2. **`humanizer/SKILL.md`**
   - Ensure it contains an **Author voice calibration** section that links to [references/review-voice.md](../humanizer/references/review-voice.md) (path relative to this skill: `../humanizer/references/review-voice.md`). If the link or section is missing, add it (see current humanizer skill for placement near “Your Task” / “Maintain voice”).
   - Do not strip or rewrite the rest of the humanizer; only add or fix the calibration pointer if needed.

## Verification

- `humanizer/references/review-voice.md` exists and is valid markdown.
- Preserves vs. avoid lists are **specific** (not “write well”) and grounded in the corpus.
- No frontmatter or blurb copy was mistaken for the author’s voice.
