/**
 * On-disk cache of layouted node positions for the recommendation
 * flowchart.
 *
 * The full layout pipeline in `flowchart-layout.ts` (ELK stress +
 * sporeOverlap + Verlet relax) is deterministic — the same input data
 * always produces byte-identical output. But it costs ~2-4 seconds per
 * SSR/build, which is wasted work on every dev reload and every
 * production build that isn't actually changing the flowchart data.
 *
 * This module owns a simple JSON file at `src/data/flowchart-positions.json`
 * that holds the resolved top-left coordinates for every node. The file
 * is checked into git so the layout is reproducible across machines and
 * CI restarts: anybody who clones the repo and runs `astro build` gets
 * the EXACT same positions the author saw, without re-running ELK or the
 * relaxation pass.
 *
 * Three things consume this:
 *   1. The pipeline itself reads the file at the top of
 *      `getLayoutedElements`. Full coverage skips ELK + relax entirely;
 *      partial coverage falls through to a recompute today (subagent 2
 *      will replace that with seeded incremental layout); missing file
 *      falls through to today's full pipeline.
 *   2. The same pipeline writes the file back after a successful run so
 *      the next process starts from a warm cache.
 *   3. (Future) the dev-only drag-and-save endpoint subagent 3 will add
 *      will overwrite this file with hand-tuned positions, then the
 *      `refine` flag re-runs only the physics pass over them.
 *
 * The schema is intentionally minimal — `version` is bumped only when
 * the structure of the file changes in a way that older code can't read,
 * and `loadPositions` returns `null` (treat as missing) for any version
 * mismatch so we degrade gracefully to a recompute instead of crashing.
 */
import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PositionsFile {
  version: 1;
  positions: Record<string, { x: number; y: number }>;
}

/**
 * Find the project root by walking up from `import.meta.url` looking for
 * a `package.json`. The naive `new URL('../data/...', import.meta.url)`
 * approach the design doc suggested works in dev but breaks at
 * `astro build` time, when this module is bundled into
 * `dist/pages/<route>.mjs` and `import.meta.url` resolves there — at
 * which point `../data/flowchart-positions.json` lands somewhere in
 * `dist/`, not in the source tree.
 *
 * Searching for `package.json` instead is bullet-proof: in both dev and
 * build the bundled module lives strictly inside the project, so
 * walking up from it always reaches the same root the source tree
 * lives under.
 */
function findProjectRoot(startFile: string): string {
  let dir = dirname(startFile);
  while (true) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      // Hit filesystem root without finding a package.json. Fall back
      // to cwd, which is always the project root for `astro dev` and
      // `astro build` — this is the absolute last-ditch path that
      // shouldn't ever fire in practice but keeps us non-throwing.
      return process.cwd();
    }
    dir = parent;
  }
}

const POSITIONS_PATH = join(
  findProjectRoot(fileURLToPath(import.meta.url)),
  'src',
  'data',
  'flowchart-positions.json',
);

/** The only schema we currently understand. Bumping this signals to old
 *  builds that the file is incompatible — they'll recompute instead of
 *  reading bad data. */
const CURRENT_VERSION = 1 as const;

function isFinitePoint(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object') return false;
  const v = value as { x?: unknown; y?: unknown };
  return (
    typeof v.x === 'number' &&
    typeof v.y === 'number' &&
    Number.isFinite(v.x) &&
    Number.isFinite(v.y)
  );
}

/**
 * Load the positions cache from disk.
 *
 * Returns `null` if the file is missing, malformed JSON, the wrong
 * version, or has any non-finite coordinate. Callers treat `null`
 * identically to "no cache" and run the full pipeline; we deliberately
 * never throw here so a corrupted file never blocks a build, it just
 * triggers a recompute that will rewrite it cleanly.
 */
export function loadPositions(): PositionsFile | null {
  if (!existsSync(POSITIONS_PATH)) return null;
  let raw: string;
  try {
    raw = readFileSync(POSITIONS_PATH, 'utf8');
  } catch (err) {
    console.warn(
      `flowchart-positions: failed to read ${POSITIONS_PATH}: ${(err as Error).message}`,
    );
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(
      `flowchart-positions: ${POSITIONS_PATH} is not valid JSON: ${(err as Error).message}`,
    );
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as { version?: unknown; positions?: unknown };
  if (obj.version !== CURRENT_VERSION) {
    console.warn(
      `flowchart-positions: unsupported version ${String(obj.version)} (expected ${CURRENT_VERSION})`,
    );
    return null;
  }
  if (!obj.positions || typeof obj.positions !== 'object') return null;
  const out: Record<string, { x: number; y: number }> = {};
  for (const [id, value] of Object.entries(obj.positions as Record<string, unknown>)) {
    if (!isFinitePoint(value)) {
      console.warn(
        `flowchart-positions: dropping invalid entry "${id}" — non-finite coordinates`,
      );
      continue;
    }
    out[id] = { x: value.x, y: value.y };
  }
  return { version: CURRENT_VERSION, positions: out };
}

/**
 * Write the positions cache to disk.
 *
 * Atomic-ish: writes to a sibling `.tmp` file and then `rename`s over the
 * real path so a crash mid-write can't leave a half-written JSON file
 * the next run would refuse to load. Best-effort — failures (read-only
 * CI filesystem, permission errors) log a warning and resolve rather
 * than throw, since a stale-but-readable cache is always better than a
 * build-failing exception from a non-essential side effect.
 *
 * Pretty-prints with 2-space indent and a trailing newline so future
 * git diffs stay readable when nodes are added or moved.
 */
export function savePositions(
  positions: Map<string, { x: number; y: number }>,
): void {
  // Sort by id so the on-disk order is stable across runs regardless of
  // how the upstream Map was built — keeps git diffs to genuine position
  // changes only, not insertion-order churn.
  const sortedIds = [...positions.keys()].sort();
  const positionsObj: Record<string, { x: number; y: number }> = {};
  for (const id of sortedIds) {
    const p = positions.get(id)!;
    positionsObj[id] = { x: p.x, y: p.y };
  }
  const file: PositionsFile = {
    version: CURRENT_VERSION,
    positions: positionsObj,
  };
  const json = JSON.stringify(file, null, 2) + '\n';
  const tmpPath = POSITIONS_PATH + '.tmp';
  try {
    writeFileSync(tmpPath, json, 'utf8');
    renameSync(tmpPath, POSITIONS_PATH);
  } catch (err) {
    console.warn(
      `flowchart-positions: failed to write ${POSITIONS_PATH}: ${(err as Error).message}`,
    );
  }
}

/**
 * Delete the positions cache from disk.
 *
 * Used by the dev-only "Reset" toolbar action: the user wants to throw
 * away every hand-tuned position and re-run the full layout pipeline
 * from scratch. Removing the file is the trigger — the next call to
 * `getLayoutedElements` will see no cache (`loadPositions` returns
 * `null`), take the `'missing'` coverage branch, and write a freshly
 * computed cache back out.
 *
 * Best-effort and non-throwing for the same reasons as `savePositions`:
 * a missing file is the desired post-condition, and a permission error
 * on a read-only filesystem is logged but not fatal — the caller will
 * still see a recompute on the next read because the disk state didn't
 * change. Returns `true` if a file was actually removed (so the dev
 * endpoint can distinguish "reset took effect" from "nothing to do").
 */
export function clearPositions(): boolean {
  if (!existsSync(POSITIONS_PATH)) return false;
  try {
    unlinkSync(POSITIONS_PATH);
    return true;
  } catch (err) {
    console.warn(
      `flowchart-positions: failed to delete ${POSITIONS_PATH}: ${(err as Error).message}`,
    );
    return false;
  }
}

/**
 * Classify the on-disk cache against the current set of node ids.
 *
 * - `'missing'`: the file didn't exist (or failed to load). Caller runs
 *   the full pipeline.
 * - `'partial'`: the file exists but doesn't cover every requested id.
 *   Caller currently recomputes; subagent 2 will use `known` as a seed
 *   for incremental ELK so only the `missing` ids get newly placed.
 * - `'full'`: every requested id is in the file. Caller can skip ELK +
 *   relax entirely (or just relax, in `refine` mode).
 *
 * Extra ids in the file that aren't in `requestedIds` are silently
 * dropped — they correspond to nodes that have been deleted from the
 * data file since the cache was written.
 */
export function classifyCoverage(
  loaded: PositionsFile | null,
  requestedIds: readonly string[],
):
  | { kind: 'missing' }
  | {
      kind: 'partial';
      known: Map<string, { x: number; y: number }>;
      missing: string[];
    }
  | { kind: 'full'; positions: Map<string, { x: number; y: number }> } {
  if (!loaded) return { kind: 'missing' };
  const known = new Map<string, { x: number; y: number }>();
  const missing: string[] = [];
  for (const id of requestedIds) {
    const p = loaded.positions[id];
    if (p) known.set(id, { x: p.x, y: p.y });
    else missing.push(id);
  }
  if (missing.length === 0) {
    return { kind: 'full', positions: known };
  }
  return { kind: 'partial', known, missing };
}
