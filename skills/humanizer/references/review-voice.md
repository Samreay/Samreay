Last updated: 2026-03-25

**Corpus:** Synthesized from `content/reviews/*/index.md` — 147 bundles scanned; 145 with substantive **Thoughts** (or legacy full-body prose after frontmatter); 2 stub-only placeholders skipped.

This file is maintained by the **sync-review-voice** skill. Re-run that skill after adding or heavily revising reviews so humanizer stays aligned with how you actually write.

---

## Patterns to preserve

- **Conversational first person** — reads like someone telling you what happened at 1am after a binge: direct, biased, fine with hedges (“I have… complex thoughts”, “I guess that’s why I love…”).
- **Dry humor and sarcasm** — hyperbole used for comedy or frustration (platforms, tropes, character choices); do not “professionalize” away the joke.
- **Genre-reader shorthand** — comparisons to other series, subreddit/recommendation context, trope vocabulary (PF, LitRPG, xianxia, Young Master, etc.) when the piece is for that audience.
- **Rhythm** — mix of short punches (“This is the secret.”) and longer explanatory runs; occasional one-line stingers.
- **Italic emphasis** — titles of works in italics; *some* words stressed for voice, not for decoration.
- **Honest irritation and enthusiasm** — complaining or fanboying in the same review is on-brand; neutrality is not the goal.
- **Reading-status asides** — leading italic line about how far along you are is common; keep when present.
- **Long reviews** — optional `####` subsections under Thoughts for structured takes (pros/cons by axis) when that’s how the piece is built.

## Patterns to avoid in humanized output (for this author)

- **Wikipedia / press-release distance** — replacing “I” with “the reader” or “one” without cause, or flattening opinion into “the work demonstrates notable strengths.”
- **False technical neutrality** — manual-like tone, stacked abstractions, or consultant-speak where the original is chatty.
- **Stripping sarcasm for “clarity”** — if a line is mean-funny or exasperated on purpose, tighten wording, don’t sanitize the stance.
- **Promotional blurb voice** — the kind of copy under `## Blurb` (plot cram, “greatest danger of all”) is exactly what Thoughts should not be pushed toward.

## Reconciling with AI-pattern removal

- Still remove **genuine slop**: vague attributions (“many believe”), significance inflation, rule-of-three hype, fake-deep `-ing` trailing phrases, em dash spam.
- **Tighten without sterilizing:** if removing a buzzphrase kills the joke, replace it with a shorter human barb, not with nothing.
- When the user is **not** editing their own voice (third-party or generic text), default to main humanizer rules; this file applies most strongly to **their** reviews and similar informal essay voice on the site.
