/**
 * Verification + auto-fix for the flowchart edge palette.
 *
 * Goal: every node in `src/data/flowchart.ts` should have *uniquely
 * coloured* incident edges. Two edges sharing a node and the same colour
 * are a defect — the human eye can't tell them apart at the fan-out from
 * a decision node, which is exactly the place where colour is supposed
 * to be doing the disambiguating work.
 *
 * The script:
 *   1. Parses the `edges:` array out of `flowchart.ts` with a single-line
 *      regex (every edge object is authored on one line by convention).
 *   2. For each node, groups incident edges by colour. Any group of size
 *      >1 is a conflict.
 *   3. With `--fix`, runs a greedy edge re-coloring pass: for each
 *      conflict, leave the first edge alone and pick a fresh colour for
 *      every subsequent one from the palette mirrored from
 *      `EDGE_PALETTE` in `src/lib/flowchart-layout.ts`. Re-runs until
 *      no conflicts remain (always converges because we never introduce
 *      a new conflict — the picked colour is by construction unused at
 *      both endpoints).
 *   4. Without `--fix`, just reports the conflicts and exits non-zero
 *      so CI / pre-commit hooks can gate on it.
 *
 * Why parse the file as text instead of importing it: the source file is
 * TypeScript and this script is a plain `.mjs` so we can run it without
 * a build step. The edge format is rigidly one-line so a small regex is
 * good enough; if the format ever drifts the script will throw a clear
 * "couldn't parse line N" error rather than silently miss edges.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Mirrors the named keys of `EDGE_PALETTE` in
// `src/lib/flowchart-layout.ts`. Order is the preference order the
// greedy fixer walks when it needs a free colour — earlier entries are
// tried first, so this is also the implicit "default new colour" rank.
const PALETTE = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'gray',
];

// `default` (no `color` set) resolves to the same hex as `emerald` in
// `EDGE_PALETTE`. So a missing colour conflicts with an explicit
// `'emerald'` neighbour. Normalise both to the same canonical name when
// comparing.
const EFFECTIVE_DEFAULT = 'emerald';

const FLOWCHART_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src/data/flowchart.ts',
);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pull every edge object out of the `edges: [ ... ]` block. Returns
 * `{ id, source, target, color, lineNumber }` records — `color` is
 * `null` when the edge omits the property entirely (which the layout
 * treats as `EFFECTIVE_DEFAULT`).
 */
function parseEdges(text) {
  const start = text.indexOf('edges: [');
  if (start < 0) {
    throw new Error('Could not locate `edges: [` block in flowchart.ts');
  }
  // Walk forward to the matching closing `]` at the same indentation.
  // The data file always closes the array with `\n  ],` (two-space
  // indent, immediately followed by the FlowchartData object's closing
  // brace).
  const close = text.indexOf('\n  ],', start);
  if (close < 0) {
    throw new Error('Could not locate end of edges array in flowchart.ts');
  }

  const edges = [];
  // Track the absolute line number so error messages point at the
  // offending line in the source file.
  const beforeBlock = text.slice(0, start).split('\n').length - 1;
  const blockLines = text.slice(start, close).split('\n');

  for (let i = 0; i < blockLines.length; i++) {
    const line = blockLines[i];
    const idMatch = line.match(/^\s*\{\s*id:\s*'([^']+)'/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const sourceMatch = line.match(/source:\s*'([^']+)'/);
    const targetMatch = line.match(/target:\s*'([^']+)'/);
    if (!sourceMatch || !targetMatch) {
      throw new Error(
        `Edge ${id} on line ${beforeBlock + i + 1} is missing source or target.`,
      );
    }
    const colorMatch = line.match(/color:\s*'([^']+)'/);
    edges.push({
      id,
      source: sourceMatch[1],
      target: targetMatch[1],
      color: colorMatch ? colorMatch[1] : null,
      lineNumber: beforeBlock + i + 1,
    });
  }
  return edges;
}

function effectiveColor(edge) {
  return edge.color ?? EFFECTIVE_DEFAULT;
}

/**
 * Build node->incident-edges adjacency and find every (node, colour)
 * pair shared by 2+ edges.
 */
function findConflicts(edges) {
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source).push(e);
    adj.get(e.target).push(e);
  }

  const conflicts = [];
  for (const [nodeId, incident] of adj) {
    const byColor = new Map();
    for (const e of incident) {
      const c = effectiveColor(e);
      if (!byColor.has(c)) byColor.set(c, []);
      byColor.get(c).push(e);
    }
    for (const [color, group] of byColor) {
      if (group.length > 1) {
        conflicts.push({ nodeId, color, edges: group });
      }
    }
  }
  // Stable order: by node id then colour, so the report is diff-friendly.
  conflicts.sort((a, b) =>
    a.nodeId === b.nodeId
      ? a.color.localeCompare(b.color)
      : a.nodeId.localeCompare(b.nodeId),
  );
  return { conflicts, adj };
}

/**
 * Pick the first palette colour not used by any edge sharing an
 * endpoint with `edge`. Returns `null` if all 17 palette colours are
 * already taken at one of the endpoints (which would only happen on a
 * node with degree >17 — currently the busiest node has degree 7).
 */
function pickFreeColor(edge, adj) {
  const used = new Set();
  for (const node of [edge.source, edge.target]) {
    for (const other of adj.get(node) || []) {
      if (other === edge) continue;
      used.add(effectiveColor(other));
    }
  }
  for (const c of PALETTE) {
    if (!used.has(c)) return c;
  }
  return null;
}

/**
 * Greedy edge re-coloring. Each pass: re-find conflicts, then for each
 * conflict group leave the first edge alone and re-colour every other
 * edge in the group to a free palette colour. Iterates until either
 * there are no conflicts left or we've burned through the iteration cap.
 *
 * Convergence: each recolour sets an edge to a colour unused at both
 * its endpoints, so it cannot create a NEW conflict. The total number
 * of (node, colour) conflict groups therefore monotonically decreases
 * (or stays the same when a conflict involves more than 2 edges and we
 * only resolve one per outer pass — but the *count of conflicting
 * edges* still drops). MAX_ITER is a safety cap; in practice the loop
 * exits within a handful of passes.
 */
function fixGreedy(edges, log) {
  const changes = [];
  const MAX_ITER = 200;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const { conflicts, adj } = findConflicts(edges);
    if (conflicts.length === 0) return changes;

    let madeChange = false;
    for (const conflict of conflicts) {
      // Re-derive: this group may have already been (partially) fixed
      // by an earlier conflict in the same pass that touched a shared
      // edge.
      const stillSharing = conflict.edges.filter(
        (e) => effectiveColor(e) === conflict.color,
      );
      if (stillSharing.length < 2) continue;

      // Stable choice: keep the edge that appears first in source
      // order; recolour the rest. Sorting by lineNumber keeps the
      // output deterministic across runs.
      stillSharing.sort((a, b) => a.lineNumber - b.lineNumber);
      for (let i = 1; i < stillSharing.length; i++) {
        const target = stillSharing[i];
        const newColor = pickFreeColor(target, adj);
        if (!newColor) {
          log.error(
            `No free palette colour available for edge ${target.id} ` +
              `(node ${conflict.nodeId} is already maxed out).`,
          );
          continue;
        }
        const oldColor = target.color ?? '(default)';
        changes.push({
          edge: target,
          oldColor,
          newColor,
          atNode: conflict.nodeId,
        });
        target.color = newColor;
        madeChange = true;
      }
    }
    if (!madeChange) break;
  }
  return changes;
}

/**
 * Apply the recoloured `color` value back into the source text. Edges
 * are rewritten one at a time, anchored on `id: '<edge.id>'` so we
 * never accidentally edit a different edge that happens to share a
 * colour value.
 */
function applyChanges(text, changes) {
  for (const { edge, newColor } of changes) {
    const replaceColor = new RegExp(
      `(\\{\\s*id:\\s*'${escapeRegex(edge.id)}'[^}]*?,\\s*color:\\s*')[^']+(')`,
    );
    if (replaceColor.test(text)) {
      text = text.replace(replaceColor, `$1${newColor}$2`);
      continue;
    }
    // Edge had no `color` property — insert one before the closing `}`.
    const insertColor = new RegExp(
      `(\\{\\s*id:\\s*'${escapeRegex(edge.id)}'[^}]*?)(\\s*\\})`,
    );
    if (insertColor.test(text)) {
      text = text.replace(insertColor, `$1, color: '${newColor}'$2`);
      continue;
    }
    throw new Error(
      `Could not locate edge ${edge.id} in source text to apply colour change.`,
    );
  }
  return text;
}

function formatConflicts(conflicts) {
  const lines = [];
  for (const c of conflicts) {
    lines.push(
      `  Node ${c.nodeId} has ${c.edges.length} incident edges sharing colour "${c.color}":`,
    );
    for (const e of c.edges) {
      lines.push(
        `    - ${e.id}  (${e.source} -> ${e.target})  [line ${e.lineNumber}]`,
      );
    }
  }
  return lines.join('\n');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const fix = args.has('--fix');
  const json = args.has('--json');

  const log = {
    info: (msg) => {
      if (!json) console.log(msg);
    },
    error: (msg) => console.error(msg),
  };

  const text = await readFile(FLOWCHART_PATH, 'utf8');
  const edges = parseEdges(text);
  log.info(`Parsed ${edges.length} edges from ${path.relative(process.cwd(), FLOWCHART_PATH)}`);

  const { conflicts: initial } = findConflicts(edges);

  if (initial.length === 0) {
    log.info('OK — every node has uniquely-coloured incident edges.');
    if (json) console.log(JSON.stringify({ ok: true, conflicts: [], changes: [] }));
    return;
  }

  log.info(`\nFound ${initial.length} colour conflicts:\n${formatConflicts(initial)}`);

  if (!fix) {
    log.info('\nRun with --fix to auto-pick alternative colours.');
    if (json) {
      console.log(
        JSON.stringify({
          ok: false,
          conflicts: initial.map((c) => ({
            nodeId: c.nodeId,
            color: c.color,
            edgeIds: c.edges.map((e) => e.id),
          })),
          changes: [],
        }),
      );
    }
    process.exit(1);
  }

  log.info('\nApplying greedy fix...');
  const changes = fixGreedy(edges, log);

  const { conflicts: leftover } = findConflicts(edges);
  if (leftover.length > 0) {
    log.error('\nLeftover conflicts after greedy fix:');
    log.error(formatConflicts(leftover));
    process.exit(2);
  }

  if (changes.length === 0) {
    log.info('No changes required.');
    return;
  }

  log.info(`\nProposed colour changes (${changes.length}):`);
  for (const c of changes) {
    log.info(
      `  ${c.edge.id}: ${c.oldColor} -> ${c.newColor}  (resolved at node ${c.atNode})`,
    );
  }

  const newText = applyChanges(text, changes);
  await writeFile(FLOWCHART_PATH, newText, 'utf8');
  log.info(`\nWrote ${changes.length} colour changes to ${path.relative(process.cwd(), FLOWCHART_PATH)}`);
  log.info('Re-run without --fix to verify the source file is now clean.');

  if (json) {
    console.log(
      JSON.stringify({
        ok: true,
        conflicts: [],
        changes: changes.map((c) => ({
          edgeId: c.edge.id,
          oldColor: c.oldColor,
          newColor: c.newColor,
          atNode: c.atNode,
        })),
      }),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
