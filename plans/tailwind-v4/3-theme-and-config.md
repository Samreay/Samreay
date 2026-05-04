# Phase 3 — Theme & config (JS → CSS-first)

**Goal:** Port every meaningful piece of `tailwind.config.cjs` into a CSS `@theme` block in our main stylesheet, register `@tailwindcss/forms` via `@plugin`, and replace the `safelist` regex with a finite `@source inline()` enumeration. By the end of this phase the build is green again, every page is styled, and the JS config file is gone.

**Estimate:** ~1.5 hours.

## Source files being changed

- `src/styles/main.scss` — receives the `@theme` / `@plugin` / `@source inline()` directives. (Stays as `.scss` for now; Phase 4 renames it to `.css`.)
- `tailwind.config.cjs` — deleted.

## Why CSS-first instead of `@config "./tailwind.config.cjs"`

`@config` works as a v3 escape hatch but explicitly does **not** support `corePlugins`, `safelist`, or `separator`. We rely on `safelist`. We also benefit from v4's CSS variables — every `@theme` token automatically gets a public `--color-π-500` (etc.) custom property we can reference from arbitrary CSS, which is exactly the dependency `src/styles/styling.scss` already has on `var(--grad-m)` and friends. So we go all-in on CSS-first.

## Tasks

### 1. Replace the top of `src/styles/main.scss`

Current (v3):

```scss
@import url('https://fonts.googleapis.com/css2?family=Architects+Daughter&family=Inter:wght@400;500;600;700;800;900&display=fallback');

@tailwind base;
@tailwind components;
@tailwind utilities;

@import './utility-patterns.scss';
@import './range-slider.scss';
@import './toggle-switch.scss';
@import './theme.scss';
@import './styling.scss';
@import './layout.scss';
@import './fancy.scss';
```

New (v4):

```scss
@import url('https://fonts.googleapis.com/css2?family=Architects+Daughter&family=Inter:wght@400;500;600;700;800;900&display=fallback');

@import "tailwindcss";

/* Form base styles (.form-input, .form-checkbox, etc.) used by our SCSS. */
@plugin "@tailwindcss/forms";

@theme {
  /* --- Custom screens (extends defaults) ----------------------------- */
  --breakpoint-xs:  450px;
  --breakpoint-3xl: 1200px;
  --breakpoint-4xl: 1750px;
  --breakpoint-6xl: 2100px;
  --breakpoint-7xl: 2400px;

  /* --- Fonts -------------------------------------------------------- */
  --font-inter: "Inter", system-ui, -apple-system, "Roboto", sans-serif;
  --font-architects-daughter: "Architects Daughter", sans-serif;

  /* --- Font-size scale (overrides v4 defaults to match v3 values) --- */
  --text-xs:  0.75rem;
  --text-sm:  0.875rem;
  --text-base: 1rem;
  --text-lg:  1.125rem;
  --text-xl:  1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 2rem;
  --text-4xl: 2.5rem;
  --text-5xl: 3.25rem;
  --text-6xl: 4rem;

  /* --- Letter-spacing scale ----------------------------------------- */
  --tracking-tighter: -0.02em;
  --tracking-tight:   -0.01em;
  --tracking-normal:  0;
  --tracking-wide:    0.01em;
  --tracking-wider:   0.02em;
  --tracking-widest:  0.4em;

  /* --- Review-tier colour palettes ---------------------------------- */
  /* Note: π is a non-ASCII identifier. v4 accepts it and emits
     --color-π-500 etc. The safelist enumeration below also keeps it. */
  --color-π-50:  #fff7ed;  --color-π-100: #ffedd5;  --color-π-200: #fed7aa;
  --color-π-300: #fdba74;  --color-π-400: #fb923c;  --color-π-500: #f97316;
  --color-π-600: #ea580c;  --color-π-700: #c2410c;  --color-π-800: #9a3412;
  --color-π-900: #7c2d12;

  --color-S-50:  #eef2ff;  --color-S-100: #e0e7ff;  --color-S-200: #c7d2fe;
  --color-S-300: #a5b4fc;  --color-S-400: #818cf8;  --color-S-500: #6366f1;
  --color-S-600: #4f46e5;  --color-S-700: #4338ca;  --color-S-800: #3730a3;
  --color-S-900: #312e81;

  --color-A-50:  #fefce8;  --color-A-100: #fef9c3;  --color-A-200: #fef08a;
  --color-A-300: #fde047;  --color-A-400: #facc15;  --color-A-500: #eab308;
  --color-A-600: #ca8a04;  --color-A-700: #a16207;  --color-A-800: #854d0e;
  --color-A-900: #713f12;

  --color-B-50:  #f8fafc;  --color-B-100: #f1f5f9;  --color-B-200: #e2e8f0;
  --color-B-300: #cbd5e1;  --color-B-400: #94a3b8;  --color-B-500: #64748b;
  --color-B-600: #475569;  --color-B-700: #334155;  --color-B-800: #1e293b;
  --color-B-900: #0f172a;

  --color-C-50:  #fff7ed;  --color-C-100: #ffedd5;  --color-C-200: #fed7aa;
  --color-C-300: #fdba74;  --color-C-400: #fb923c;  --color-C-500: #f97316;
  --color-C-600: #ea580c;  --color-C-700: #c2410c;  --color-C-800: #9a3412;
  --color-C-900: #7c2d12;

  --color-D-50:  #fff1f2;  --color-D-100: #ffe4e6;  --color-D-200: #fecdd3;
  --color-D-300: #fda4af;  --color-D-400: #fb7185;  --color-D-500: #f43f5e;
  --color-D-600: #e11d48;  --color-D-700: #be123c;  --color-D-800: #9f1239;
  --color-D-900: #881337;

  --color-F-50:  #ecfdf5;  --color-F-100: #d1fae5;  --color-F-200: #a7f3d0;
  --color-F-300: #6ee7b7;  --color-F-400: #34d399;  --color-F-500: #10b981;
  --color-F-600: #059669;  --color-F-700: #047857;  --color-F-800: #065f46;
  --color-F-900: #064e3b;

  /* --- Overrides for built-in palettes ------------------------------ */
  --color-gray-100: #EBF1F5;
  --color-gray-200: #D9E3EA;
  --color-gray-300: #C5D2DC;
  --color-gray-400: #9BA9B4;
  --color-gray-500: #707D86;
  --color-gray-600: #55595F;
  --color-gray-700: #33363A;
  --color-gray-800: #25282C;
  --color-gray-900: #151719;
  --color-gray-950: #0f1112;

  --color-purple-100: #F4F4FF;
  --color-purple-200: #E2E1FF;
  --color-purple-300: #CBCCFF;
  --color-purple-400: #ABABFF;
  --color-purple-500: #af8dff;
  --color-purple-600: #8e5dff;
  --color-purple-700: #7b4acf;
  --color-purple-800: #38379C;
  --color-purple-900: #262668;

  /* "main" — used by buttons, .newsletter, hover states. Identical to v3 emerald. */
  --color-main-50:  #ecfdf5;  --color-main-100: #d1fae5;  --color-main-200: #a7f3d0;
  --color-main-300: #6ee7b7;  --color-main-400: #34d399;  --color-main-500: #10b981;
  --color-main-600: #059669;  --color-main-700: #047857;  --color-main-800: #065f46;
  --color-main-900: #064e3b;
}

/* --- Custom utilities that v3 expressed via theme.extend.spacing,
       inset, scale, minWidth, gridTemplateColumns. v4 doesn't ship a
       --grid-template-columns-* namespace, so the grid utilities and the
       fractional spacing land as @utility rules. ---------------------- */

@utility pb-9\/16 { padding-bottom: 56.25%; }
@utility pb-3\/4  { padding-bottom: 75%; }
@utility pb-1\/1  { padding-bottom: 100%; }

@utility inset-full { inset: 100%; }   /* matches v3 inset.full = 100% */

@utility min-w-10 { min-width: 2.5rem; }
@utility scale-98 { scale: 0.98; }

@utility grid-cols-wide-cards          { grid-template-columns: repeat(auto-fit, minmax(calc(min(100%,520px)), 1fr)); }
@utility grid-cols-wide-cards-mobile   { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));                 }
@utility grid-cols-cover-cards         { grid-template-columns: repeat(auto-fit, 262px);                              }
@utility grid-cols-cover-cards-tier    { grid-template-columns: repeat(auto-fit, 250px);                              }
@utility grid-cols-cover-cards-large   { grid-template-columns: repeat(auto-fit, 400px);                              }
@utility grid-cols-cover-cards-mobile  { grid-template-columns: repeat(auto-fit, 45%);                                }
@utility grid-cols-cover-cards-mobile-large { grid-template-columns: repeat(auto-fit, 90%);                           }
@utility grid-cols-vertical-cards      { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));                 }

/* --- Safelist replacement -----------------------------------------
   The v3 safelist combined fixed strings with two regex/variants
   blocks. v4's @source inline() lets us enumerate exact class strings
   (with brace expansion). Resolves to ~210 generated utilities, which
   is a rounding error in the bundle. ------------------------------ */
@source inline("img-{smaller,small,reduced,poster,large,full,tiny,shrink}");
@source inline("list-none");
@source inline("grid-cols-cover-cards{,-mobile,-tier,-large,-mobile-large}");
@source inline("{hover:,focus:,}bg-{π,S,A,B,C,D,F}-{500,600,700,800,900}");
@source inline("{xs:,sm:,md:,lg:,}grid-cols-cover-cards{,-mobile,-tier,-large,-mobile-large}");

@import './utility-patterns.scss';
@import './range-slider.scss';
@import './toggle-switch.scss';
@import './theme.scss';
@import './styling.scss';
@import './layout.scss';
@import './fancy.scss';
```

### 2. Audit `theme.extend` for anything missed

Cross-check the new `@theme` block against `tailwind.config.cjs:35–213`:

| `theme.extend` key | Where it landed in v4 |
| --- | --- |
| `screens.xs/3xl/4xl/6xl/7xl` | `--breakpoint-*` |
| `colors.{π,S,A,B,C,D,F}` | `--color-*-{50…900}` |
| `colors.{gray,purple,main}` | `--color-*-{50…900}` (overrides) |
| `spacing.{9/16,3/4,1/1}` | Only ever `@apply pb-9/16` in the codebase → `@utility pb-9\/16` etc. (see audit below) |
| `fontFamily.{inter,architects-daughter}` | `--font-inter`, `--font-architects-daughter` |
| `fontSize.{xs…6xl}` | `--text-*` |
| `inset.full` | `@utility inset-full` (used in `.absolute` overlays) |
| `letterSpacing.*` | `--tracking-*` |
| `minWidth.10` | `@utility min-w-10` |
| `scale.98` | `@utility scale-98` |
| `gridTemplateColumns.*` | `@utility grid-cols-*` × 8 |

Verify each `@apply <key>` use case still resolves by grepping after this phase:

```bash
rg -n '@apply.*\b(pb-9/16|pb-3/4|pb-1/1|inset-full|min-w-10|scale-98|grid-cols-(wide|cover|vertical)-cards)' \
   src/styles
```

### 3. Drop the JS config file

```bash
git rm tailwind.config.cjs
```

`@tailwindcss/vite` does not auto-detect JS config files in v4 — there's no implicit dependency. With the file gone, the build's only Tailwind input is `src/styles/main.scss`'s `@theme` block.

### 4. Smoke-build

```bash
npm run build
```

Expected: build succeeds, `dist/_astro/*.css` contains the same colour palette and broadly the same utilities as the v3 baseline. Bundle size is *expected* to be different (v4 emits CSS variables for every theme token regardless of use, which adds bytes; on the other hand v4 doesn't emit unused `--tw-*` defaults, which removes bytes). A swing of ±20 % is fine; a swing of >50 % needs investigation.

Sanity-check that the safelist landed:

```bash
rg -o 'bg-π-(500|600|700|800|900)' dist/_astro/*.css | sort -u
rg -o 'hover:bg-π-(500|600|700|800|900)' dist/_astro/*.css | sort -u
rg -o 'grid-cols-cover-cards-mobile' dist/_astro/*.css
```

Each command should return matches. If the `π` palette is missing, the `@source inline()` line is wrong — likely the brace-expansion syntax needs adjusting (try splitting into individual `@source inline("bg-π-500"); @source inline("bg-π-600"); …` lines).

### 5. Visually spot-check a tier-coloured page

Open `/reviews/?l=tier` in `npm run dev`. Each tier banner should still have the right base background colour (driven by the safelisted `bg-{tier}-{shade}` class plus the `var(--grad-*)` gradients in `styling.scss`). This is a quick eyeball check — Phase 6 runs the full Playwright diff.

### 6. Commit

```bash
git add src/styles/main.scss
git rm tailwind.config.cjs
git commit -m "tailwind v4: port theme.extend to CSS @theme, drop JS config"
```

## Acceptance criteria

- `tailwind.config.cjs` is gone.
- `src/styles/main.scss` starts with `@import "tailwindcss";` and contains the `@theme`, `@plugin`, `@utility`, and `@source inline()` blocks above.
- `npm run build` succeeds.
- `dist/_astro/*.css` contains classes for every safelisted pattern (verified via the rg checks).
- Every `@apply` call elsewhere in the SCSS files still resolves — i.e. the build doesn't warn *"Cannot apply unknown utility class …"*. (Build warnings escalate to errors in v4 for unknown `@apply` targets.)
- A spot-check of `/reviews/`, `/`, and `/reviews/<some-tier-S-review>/` shows colours and typography roughly intact. (Some SCSS-side breakage is expected — fixed in Phase 4.)

## Risks

- **Non-ASCII identifier `π`**: v4 supports Unicode in identifiers, but the codemod and editor tooling sometimes don't. If we hit issues, the fallback is renaming the colour to `pi` and updating the eight or so files that reference it. Ownership: `src/data/reviews.ts`, `tailwind.config.cjs` (now `@theme`), `src/styles/styling.scss`, the safelist, and any review markdown that hardcodes `tier: π`. Defer this rename to a separate PR if it bites.
- **Brace-expansion syntax in `@source inline()`**: officially supported, but if it doesn't behave as documented, fall back to enumerating each class on its own line. Bundle size effect: ~+1 KB minified, fine.
- **Safelist drift over time**: any new tier introduced post-migration needs an `@source inline()` update. Document this in the README or in a comment alongside the directive.

## Out of scope

- Actually editing the SCSS files (Phase 4).
- Rewriting deprecated utilities in markup (Phase 5).
- Removing the `font-architects-daughter` family if no markup references it. Keeping for parity unless Phase 6 finds zero usage.
