// Astro auto-detects this config and applies it to every CSS pipeline. Kept
// minimal: the `@astrojs/tailwind` integration already injects Tailwind, so
// here we only need autoprefixer for vendor prefixes. Hugo's
// `themes/sams-theme/assets/css/postcss.config.js` also pulled in
// `postcss-import`, but Astro's Vite/Sass pipeline handles `@import` natively.
module.exports = {
  plugins: {
    autoprefixer: {},
  },
};
