/**
 * remark plugin: rewrite `![alt](path?class="img-large img-poster")` to a
 * standard image with the requested CSS classes attached.
 *
 * `convert.py`'s `add_classes()` step decorates select images with class
 * hints by appending a `?class="..."` query string to the URL. Hugo's
 * goldmark + custom image render hook respects this; Astro doesn't, so we
 * bridge the gap as a remark transform that strips the marker and pushes
 * the requested classes through to the final `<img>` tag via mdast
 * `data.hProperties`.
 *
 * Multiple classes can be separated by spaces or commas (matches the
 * Hugo/convert.py format).
 */

import type { Plugin } from 'unified';
import type { Image, Root } from 'mdast';
import { visit } from 'unist-util-visit';

const PATTERN = /^([^?]+)\?class="([^"]+)"$/;

export const remarkImageClass: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'image', (node: Image) => {
    const url = node.url;
    if (!url) return;
    const match = url.match(PATTERN);
    if (!match) return;
    node.url = match[1];
    const classes = match[2].split(/[ ,]+/).filter(Boolean).join(' ');
    const data = (node.data ??= {}) as { hProperties?: Record<string, string> };
    const props = (data.hProperties ??= {});
    props.class = props.class ? `${props.class} ${classes}` : classes;
  });
};

export default remarkImageClass;
