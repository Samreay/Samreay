/**
 * Inline SVG icons for the artists explorer link rail.
 *
 * Originally Hugo's `partials/_ico.html` shortcode loaded SVGs from
 * `themes/sams-theme/assets/svg/default/<name>.svg`, stripped comments,
 * and rewrote the outer `<svg>` tag to inject Tailwind-friendly attributes
 * (`height="1em"`, `fill="currentColor"`, ...). Phase 14 moved the SVGs
 * to `src/assets/svg/`; we do the same normalisation at build time here so
 * the Svelte island can render `{@html ICONS[name]}` without bundling a
 * per-icon component.
 *
 * `import.meta.glob('?raw', { eager: true })` pulls each file into the JS
 * bundle as a string; the post-processing function then normalises it to
 * match what Hugo used to emit so Phase 8/9 baselines still apply.
 */

const RAW = import.meta.glob<string>(
  '/src/assets/svg/*.svg',
  { query: '?raw', import: 'default', eager: true }
);

function basename(path: string): string {
  const file = path.split('/').pop() ?? '';
  return file.replace(/\.svg$/i, '');
}

function normaliseSvg(name: string, raw: string): string {
  // Drop HTML/XML comments so we don't ship Font Awesome attribution into
  // the rendered DOM (the source SVGs include a multi-line credit).
  const stripped = raw.replace(/<!--[\s\S]*?-->/g, '');
  // Rewrite the outer <svg ...> tag to match Hugo's _ico shortcode output:
  // height="1em" fill="currentColor" aria-hidden="true" class="ico ico-<name>"
  return stripped.replace(
    /<svg([^>]*)>/i,
    (_match, attrs) => {
      // Strip width/height/fill/class so our overrides win, but keep viewBox.
      const cleanedAttrs = String(attrs)
        .replace(/\s(width|height|fill|class)="[^"]*"/gi, '')
        .trim();
      return `<svg height="1em" fill="currentColor" aria-hidden="true" class="ico ico-${name}" ${cleanedAttrs}>`;
    },
  );
}

/**
 * Map of icon name → ready-to-render inline SVG markup. Use with
 * `{@html ICONS[name]}` in Svelte. Returns an empty string for unknown
 * names (mirrors Hugo's silent fallback).
 */
export const ICONS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [path, raw] of Object.entries(RAW)) {
    const name = basename(path);
    out[name] = normaliseSvg(name, raw);
  }
  return out;
})();

/**
 * Hugo's artists template renames a few link keys onto SVG file names that
 * don't share their identifier. Mirror that mapping so the Svelte island
 * can stay simple — pass the link key, get the right icon.
 */
export const LINK_NAME_TO_ICON: Record<string, string> = {
  cara: 'cara',
  website: 'globe',
  twitter: 'twitter',
  artstation: 'artstation',
  discord: 'discord',
  instagram: 'instagram',
  deviantart: 'deviantart',
  behance: 'behance',
  facebook: 'facebook',
  fiverr: 'five',
  upwork: 'upwork',
  royal_road: 'royal_road',
};

export function iconFor(linkName: string): string {
  const key = LINK_NAME_TO_ICON[linkName];
  if (!key) return '';
  return ICONS[key] ?? '';
}
