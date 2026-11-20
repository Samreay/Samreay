# Restore post embeds

Restore all legacy includes in published posts with static Astro components.

## Context

The scan of `content/` found 21 Jekyll includes across 15 blog posts: nine
YouTube videos, nine images, two presentations, and one PDF. A sixteenth
post, `globular`, still contains a Hugo PDF shortcode.

The original templates are available in Git:

- `6f766af8^:_includes/youtube.html`: responsive 16:9 iframe with fullscreen and playback permissions.
- `6f766af8^:_includes/presentation.html`: responsive 4:3 iframe with fullscreen.
- `6f766af8^:_includes/image.html`: figure with caller-supplied classes and a local image.
- `6f766af8^:_includes/pdf.html`: full-width PDF object, 500 pixels high.
- `538e705e^:themes/sams-theme/layouts/shortcodes/pdf.html`: PDF object with an iframe and link fallback, a title, and configurable height.

## Tasks

1. Capture a failing browser check against the current production build.
2. Add `YouTube.astro`, `Presentation.astro`, `PostImage.astro`, and `Pdf.astro`
   under `src/components/`. Use `astro:assets` for imported images.
3. Convert the 16 affected posts to MDX and enable MDX in the blogs loader.
   Keep prose, post metadata, URLs, query parameters, image classes, and PDF heights.
   Remove the obsolete `layout: post` field: Astro treats it as an MDX import,
   while the blog route already supplies the page layout.
4. Run the required checks and inspect desktop and mobile rendering.

## Verification

- `npm exec astro check`
- `npm run build`
- Start `npm run preview`, then run `node scripts/verify-post-embeds.mjs`.
  Check all 22 embeds, their local assets, responsive iframe sizing, and the
  absence of legacy syntax across the source posts and generated post pages.
- Review screenshots of a video, presentation, poster, and PDF at desktop and mobile sizes.
- `git diff --check`

External iframe requests are blocked during browser checks. These checks prove
the embed markup and layout, not third-party video or presentation availability.

## Architecture

No new ADR is needed. MDX imports of static Astro components follow the existing
Hugo migration guidance. Local PDFs use the existing `contentAssets()` integration.
The `main.jpg` images in `europe2019` and `refractorium` were renamed to `cover.jpg`.
Their Git blob hashes match the original images, so those posts reuse the existing assets.

## Results

- Baseline: the browser check failed because `/blogs/bottle/` had no YouTube iframe.
- `npm exec astro check`: zero errors and warnings, with the same five existing hints.
- `npm run build`: 455 pages built successfully. The existing `@xyflow/svelte`
  unused-import warning remains.
- Browser verification: all 22 embeds passed at 1280px and 390px viewport widths.
  All nine poster images decoded, and both PDF URLs returned PDF files.
- The source and output scan covered 607 files with no remaining legacy syntax.
- Screenshots confirmed responsive layouts and the Kubo image inversion.
  A separate request with external access enabled confirmed that the Mood Bottle
  YouTube player loads. Playback and the other third-party embeds were not tested.
- Source comparison confirmed that prose and post metadata are unchanged,
  apart from removing `layout: post`.
- Final self-review and `git diff --check` found no blocking issues.
