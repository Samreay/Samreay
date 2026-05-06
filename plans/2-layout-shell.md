# Phase 2 — Layout shell

**Goal:** Recreate the site chrome (head/SEO, navbar, footer, base layout) as Astro components, so every subsequent page wraps in `BaseLayout.astro`.

**Estimate:** ½ day.

## Skills to load before starting

- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — `src/layouts/BaseLayout.astro`, `<head>` patterns, slot model

## Source files being ported

- `themes/sams-theme/layouts/_default/baseof.html`
- `themes/sams-theme/layouts/partials/head.html`
- `themes/sams-theme/layouts/partials/seo.html`
- `themes/sams-theme/layouts/partials/opengraph.html`
- `themes/sams-theme/layouts/partials/twitter_cards.html`
- `themes/sams-theme/layouts/partials/navbar.html`
- `themes/sams-theme/layouts/partials/footer.html`
- `themes/sams-theme/layouts/partials/analytics.html`
- `themes/sams-theme/data/nav.yml`

## Tasks

1. Convert `themes/sams-theme/data/nav.yml` to `src/data/nav.ts`:
   ```ts
   export const nav = [
     { label: 'Books', link: '/#books' },
     { label: 'Reviews', link: '/reviews' },
     { label: 'Tutorials', link: '/tutorials' },
     { label: 'Blog', link: '/blogs' },
     { label: 'Artists', link: '/artists' },
     { label: 'Courses', link: '/#courses' },
     { label: 'CV', link: '/static/resume/Samuel_Hinton_CV.pdf' },
   ] as const;
   ```
2. Create `src/components/Head.astro` taking props `{ title, description, image, type }`:
   - Charset, viewport, title (with home-page special case)
   - Favicons, manifest, mask-icon (mirror existing `<link>`s)
   - OpenGraph + Twitter card meta tags merged in
   - Google Fonts preconnect + Inter/Architects Daughter import
3. Create `src/components/Navbar.astro`:
   - Iterate `nav` data
   - Replace AlpineJS hamburger with `<MobileMenu client:idle />` (Svelte island, deferred to Phase 9 — initial Phase 2 version uses inline `<script>` toggling a class)
4. Create `src/components/Footer.astro` (port partial verbatim, swap any Hugo template directives for Astro expressions).
5. Create `src/components/Analytics.astro` rendering the GA snippet only when `import.meta.env.PROD`.
6. Create `src/layouts/BaseLayout.astro`:
   ```astro
   ---
   import Head from '../components/Head.astro';
   import Navbar from '../components/Navbar.astro';
   import Footer from '../components/Footer.astro';
   import Analytics from '../components/Analytics.astro';
   import '../styles/main.scss';  // added in Phase 3
   import 'katex/dist/katex.min.css';

   interface Props {
     title?: string;
     description?: string;
     image?: string;
     type?: 'website' | 'article';
   }
   const { title, description, image, type = 'website' } = Astro.props;
   ---
   <!doctype html>
   <html lang="en-GB">
     <Head {title} {description} {image} {type} />
     <body>
       <div class="flex flex-col min-h-screen overflow-hidden">
         <Navbar />
         <div class="flex-grow"><slot /></div>
         <Footer />
       </div>
       <Analytics />
     </body>
   </html>
   ```
7. Update `src/pages/index.astro` to wrap a placeholder block in `<BaseLayout>` and verify the chrome renders.

## Acceptance criteria

- `<BaseLayout>` produces HTML structurally identical to Hugo's base layout (diff `view-source:` for the home page across both servers).
- All `<head>` meta tags from the existing site are present.
- Mobile menu toggles open/closed on a small viewport.
- Analytics tag absent in `npm run dev`, present in `npm run build` output.

## Out of scope

- Theming and Tailwind utility classes are imported in Phase 3.
- Mobile menu animation polish — the `MobileMenu.svelte` island lands in Phase 9.
- Newsletter form is a separate component (Phase 11).
