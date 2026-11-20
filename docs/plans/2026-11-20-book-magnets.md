# Printable book magnets

Add a browser workshop at /reviews/book-magnets/ for making paper wraps for miniature printed books. Use review names and original cover images. Some review names identify a series, so allow the printed title to be edited.

1. Build the printable catalogue in the Astro route and link it from the reviews index.
2. Implement the layout and spine renderer in src/lib/book-magnets. Sample smooth cover-edge colours for the cloth and high-contrast strokes for the ink. Compare a plain spine with a ruled binding. Centre-crop the original front cover to fill the printed face.
3. Add a Svelte island for selection, a magnified proof, paper and book sizes, print resolution, font import and multi-page PNG export. Include the font with the sheets.
4. Check the site build, desktop and mobile controls, multi-sheet overflow, DPI warnings, custom fonts, page pixel dimensions, PNG density and physical cut positions.
