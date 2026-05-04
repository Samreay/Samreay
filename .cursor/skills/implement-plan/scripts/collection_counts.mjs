// Reserved for future use.
//
// `astro:content` cannot be imported from outside an Astro build, so the
// phase-4 `*_count_*` checks count markdown files directly off disk in
// scripts/lib/collections.py::count_markdown_files. `astro check` (a
// universal gate) covers schema validation, so disk counts + check are
// equivalent to a real getCollection() call for the purposes of this gate.
//
// If a future check needs to introspect parsed entries (e.g. assert that a
// frontmatter date sorted ordering matches Hugo's), the right approach is
// to add an Astro page at `src/pages/_meta.json.ts` that emits the data,
// then read `dist/_meta.json` here.
process.stdout.write("{}\n");
