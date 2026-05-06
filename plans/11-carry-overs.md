# Phase 11 — Carry-overs

**Goal:** Wrap up the loose-end pieces that don't fit cleanly into earlier phases: the newsletter form, AOS removal, static asset relocation, and any miscellaneous theme-static files.

**Estimate:** ½ day.

## Skills to load before starting

- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — `<NewsletterForm>` as a static `.astro` component, conditional analytics

## Items to handle

- Mailerlite newsletter form (`partials/newsletter-blog.html` and the inline copy inside `partials/sections/books.html`)
- AOS (Animate-on-Scroll) library
- Static assets in `themes/sams-theme/static/` (favicons, manifest, CV PDF, joined videos, robots.txt)
- Discord references
- Loose ends from earlier phases

## Tasks

### 1. Newsletter form

`src/components/NewsletterForm.astro`:

```astro
---
interface Props {
  variant?: 'default' | 'compact';
}
const { variant = 'default' } = Astro.props;
---
<div class:list={["newsletter-form", variant]}>
  <div class="mb-6 text-center">
    <h3 class="text-main-50 mb-2 lg:mb-8">Updates!</h3>
    <p class="text-main-50 text-lg text-opacity-70 mb-2">
      Join <a href="https://discord.gg/tfn4HVEaDz" class="font-bold" style="color: #7289da">discord</a> to chat, or the email list!
    </p>
  </div>
  <form
    action="https://assets.mailerlite.com/jsonp/2036924/forms/176526142171252164/subscribe"
    method="post"
    target="_blank"
    novalidate
    class="validate w-full ml-block-form"
  >
    <input type="email" name="fields[email]" required placeholder="Your email…"
           class="w-full appearance-none bg-main-600 mb-4 border text-main-50 ..." />
    <input type="hidden" name="ml-submit" value="1" />
    <input type="submit" value="Subscribe"
           class="button btn bg-main-600 hover:bg-main-400 shadow w-full" />
    <input type="hidden" name="anticsrf" value="true" />
  </form>
  <p class="text-center mt-2 opacity-50 text-main-200" style="display:none" data-status="error">
    There was a problem, please try again.
  </p>
  <p class="text-center mt-2 opacity-50 text-main-200" style="display:none" data-status="success">
    Thanks mate, won't let ya down.
  </p>
</div>

<script is:inline async src="https://groot.mailerlite.com/js/w/webforms.min.js?v176e10baa5e7ed80d35ae235be3d5024"></script>
<script is:inline>
  fetch("https://assets.mailerlite.com/jsonp/2036924/forms/176526142171252164/takel");
  function ml_webform_success_35716688() {
    document.querySelectorAll('[data-status="success"]').forEach(e => e.style.display = 'block');
    document.querySelectorAll('.ml-form-formContent').forEach(e => e.style.display = 'none');
  }
</script>
```

- Used by `src/pages/reviews/[...slug].astro` (Phase 5) and `src/components/sections/Books.astro` (Phase 7, `variant="compact"`).
- The Mailerlite scripts are loaded on every page that includes the form. If page weight matters, lazy-load them via an Intersection Observer wrapper or only inject them on first viewport intersection.

### 2. Drop AOS

- `src/styles/main.scss`: confirm `@import 'node_modules/aos/dist/aos.css'` was already removed in Phase 3.
- `package.json`: remove the `aos` dependency.
- Search any remaining `data-aos="..."` attributes in ported components — replace with CSS-only scroll-driven reveal:
  ```scss
  // In src/styles/styling.scss
  @keyframes fade-up {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  [data-reveal] {
    animation: fade-up 0.5s ease-out both;
    animation-timeline: view();
    animation-range: entry 0% entry 50%;
  }
  ```
- Or simply remove the reveal effect entirely (most pages don't visibly use it after the initial scroll).

### 3. Static assets relocation

```bash
git mv themes/sams-theme/static/CNAME public/CNAME
git mv themes/sams-theme/static/site.webmanifest public/site.webmanifest
git mv themes/sams-theme/static/favicon.ico public/favicon.ico
git mv themes/sams-theme/static/favicon-16x16.png public/favicon-16x16.png
git mv themes/sams-theme/static/favicon-32x32.png public/favicon-32x32.png
git mv themes/sams-theme/static/apple-touch-icon.png public/apple-touch-icon.png
git mv themes/sams-theme/static/android-chrome-192x192.png public/android-chrome-192x192.png
git mv themes/sams-theme/static/android-chrome-512x512.png public/android-chrome-512x512.png
git mv themes/sams-theme/static/mstile-150x150.png public/mstile-150x150.png
git mv themes/sams-theme/static/safari-pinned-tab.svg public/safari-pinned-tab.svg
git mv themes/sams-theme/static/browserconfig.xml public/browserconfig.xml
git mv themes/sams-theme/static/joined.mp4 public/joined.mp4
git mv themes/sams-theme/static/joined2.mp4 public/joined2.mp4
git mv themes/sams-theme/static/summary.md public/summary.md
git mv themes/sams-theme/static/static public/static  # contains js/ and resume/ subdirs
git mv robots.txt public/robots.txt
```

Update the `make cv` target in `Makefile`:

```makefile
cv:
	cd resume && uv run rendercv render "Hinton_CV.yaml" \
	  && cp rendercv_output/Samuel_Hinton_CV.pdf ../public/static/resume/Samuel_Hinton_CV.pdf
```

### 4. The custom domain

`public/CNAME` should still contain `cosmiccoding.com.au`. GitHub Pages uses this file directly when deploying.

### 5. The `js/arrow-1.0.0-alpha10.js` reactive lib

This was the homegrown reactivity library for the three interactive pages. Once Phases 8 and 9 are merged, no page references it. Delete it:

```bash
rm public/static/js/arrow*.js  # if it ended up in public/static/js
rm src/assets/js/arrow*.js     # if it ended up in src/assets/js
```

(Original location was `themes/sams-theme/assets/js/arrow.js` and `arrow-1.0.0-alpha10.js`.)

### 6. The shortcodes

- `themes/sams-theme/layouts/shortcodes/highlight.html` and `ico.html` are Hugo shortcodes used inside markdown. Search `content/**/*.md` for `{{< highlight }}` or `{{< ico ... >}}` calls.
- If found, replace with MDX components or inline HTML in the affected files.
- Likely zero usage based on a grep — but verify.

### 7. Sample remaining links to verify

- The `Discord` link `https://discord.gg/tfn4HVEaDz` works (Site `params.discord`).
- Google Analytics tracking ID `G-GRX6QE03YR` injected when `import.meta.env.PROD`.
- The Figma flowchart URL `hScNoWonDzTMTrpzUhNqzR` embedded correctly.

## Acceptance criteria

- Newsletter form on `/reviews/<any>/` and on `/#books` submits to Mailerlite and shows the success/error state.
- Favicons and manifest load from `/favicon.ico`, `/site.webmanifest`, etc.
- `make cv` regenerates the resume PDF in the new location.
- `dist/CNAME` exists after a build.
- No `arrow*.js` references remain.
- `npm run build` produces no broken links (verify with a quick `lychee` or `linkinator` pass).

## Out of scope

- Replacing Mailerlite with a different newsletter provider.
- Changing analytics provider.
- Deleting the legacy Hugo theme directory (happens in Phase 14 — Cutover).
