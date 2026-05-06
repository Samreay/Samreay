# `state.json` schema

`emit.py` consumes this file and produces a `flowchart.ts`-compatible TS
module. Extra keys (e.g. `src_bbox`, `_note`) are allowed and ignored —
keep them around so the next agent can re-zoom without re-detecting.

## Top-level

```jsonc
{
  "image": "Story-Finder-big.jpg",      // optional, informational
  "defaultEdgeType": "bezier",           // optional; one of bezier | simplebezier | smoothstep | step | straight
  "decisions": [ /* DecisionEntry */ ],
  "books":     [ /* BookEntry */ ],
  "edges":     [ /* EdgeEntry */ ]
}
```

## `DecisionEntry`

| key       | required | type                        | notes                                                                                       |
|-----------|----------|-----------------------------|---------------------------------------------------------------------------------------------|
| `id`      | yes      | string                      | `d_<slug>`. Unique across decisions+books.                                                  |
| `prompt`  | yes      | string                      | Headline question shown inside the node.                                                    |
| `color`   | no       | PaletteColor                | Tailwind 500-shade name. Omit for default gray.                                             |
| `pinned`  | no       | `{ x: number, y: number }`  | Top-left in original-image px. Use only on the START anchor (`{ x: 0, y: 0 }`).             |
| `src_bbox`| ignored  | `[x0,y0,x1,y1]`             | Optional sidecar; preserved for re-zoom.                                                    |

## `BookEntry`

| key        | required | type                        | notes                                                                                       |
|------------|----------|-----------------------------|---------------------------------------------------------------------------------------------|
| `id`       | yes      | string                      | `b_<slug>`. Unique across decisions+books.                                                  |
| `reviewId` | yes      | string                      | Must match `content/reviews/<reviewId>/index.md` exactly (underscored).                     |
| `pinned`   | no       | `{ x: number, y: number }`  | Avoid unless absolutely necessary — fights dagre.                                           |
| `src_bbox` | ignored  | `[x0,y0,x1,y1]`             | Optional sidecar; preserved for re-zoom.                                                    |

## `EdgeEntry`

| key       | required | type          | notes                                                                                       |
|-----------|----------|---------------|---------------------------------------------------------------------------------------------|
| `id`      | yes      | string        | Convention: `e_<source>_<target>`. Unique.                                                  |
| `source`  | yes      | string        | A node id defined in `decisions` or `books`.                                                |
| `target`  | yes      | string        | A node id defined in `decisions` or `books`.                                                |
| `label`   | no       | string        | Pill text on the edge, e.g. `"I will survive."`. Preserve trailing punctuation as drawn.    |
| `color`   | no       | PaletteColor  | Pill background colour. Reads off the connector strokes on either side of the pill.         |
| `type`    | no       | EdgeType      | Override path style for this edge only. Defaults to `defaultEdgeType`.                      |

## Enums

```ts
type PaletteColor =
  | 'red' | 'orange' | 'amber' | 'yellow' | 'lime' | 'green' | 'emerald'
  | 'teal' | 'cyan' | 'sky' | 'blue' | 'indigo' | 'violet' | 'purple'
  | 'fuchsia' | 'pink' | 'rose' | 'gray';

type EdgeType = 'bezier' | 'simplebezier' | 'smoothstep' | 'step' | 'straight';
```

These are the only values `emit.py` accepts. Keep this file in lockstep
with the union in `src/data/flowchart.ts` if either ever expands.
