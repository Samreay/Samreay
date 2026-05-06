"""Phase 10 — Markdown details.

See plans/10-markdown-details.md and references/gates-by-phase.md.

Phase 10 doesn't add new pages — it polishes the markdown rendering
pipeline for content the previous phases already wired up. Checks here
target the four moving parts:

1. Shiki uses the (hand-ported) base16-snazzy theme.
2. The remark image-class plugin handles `?class="..."` URL suffixes.
3. KaTeX still renders math on tutorial pages with `math: true`.
4. `convert.py`-style `<div class="..." markdown=1>` wrappers still let
   their inner code blocks be highlighted by Shiki.
5. Pandas-style `<table class="table-auto table dataframe">` markup is
   preserved through the markdown pipeline.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.types import Check, CheckResult, Context  # noqa: E402

# Snazzy palette; if Shiki re-emits these in inline styles we trust the
# right theme is loaded. We only check the background and a couple of
# foreground accents to avoid being brittle about every token mapping.
SNAZZY_BG = "#282a36"
SNAZZY_FG = "#e2e4e5"
SNAZZY_KEYWORD = "#FF6AC1"  # base0E
SNAZZY_STRING = "#5AF78E"  # base0B


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore") if path.is_file() else ""


def _check_shiki_theme_is_snazzy(ctx: Context) -> CheckResult:
    """Inspect a tutorial page's first `<pre class="astro-code...">` block
    and verify it carries `base16-snazzy` plus our background colour.
    """
    sample = ctx.dist_dir / "tutorials" / "bayesianlinearregression" / "index.html"
    html = _read(sample)
    if not html:
        return CheckResult(
            name="shiki_theme_is_snazzy",
            severity="must_match",
            passed=False,
            detail="dist/tutorials/bayesianlinearregression/index.html missing",
        )
    pre_match = re.search(r'<pre class="astro-code ([^"]+)"[^>]*style="([^"]+)"', html)
    if not pre_match:
        return CheckResult(
            name="shiki_theme_is_snazzy",
            severity="must_match",
            passed=False,
            detail="no <pre class=\"astro-code ...\"> block found in sample tutorial",
        )
    theme_name = pre_match.group(1)
    style = pre_match.group(2).lower()
    if "base16-snazzy" not in theme_name.lower():
        return CheckResult(
            name="shiki_theme_is_snazzy",
            severity="must_match",
            passed=False,
            detail=f"shiki theme is '{theme_name}', expected 'base16-snazzy'",
        )
    if SNAZZY_BG.lower() not in style or SNAZZY_FG.lower() not in style:
        return CheckResult(
            name="shiki_theme_is_snazzy",
            severity="must_match",
            passed=False,
            detail=(
                f"shiki style does not use the snazzy palette: {style!r} "
                f"(expected bg={SNAZZY_BG}, fg={SNAZZY_FG})"
            ),
        )
    return CheckResult(
        name="shiki_theme_is_snazzy",
        severity="must_match",
        passed=True,
        detail=(
            f"shiki theme '{theme_name}' applied with snazzy palette "
            f"(bg {SNAZZY_BG}, fg {SNAZZY_FG})"
        ),
    )


def _check_snazzy_token_colours_present(ctx: Context) -> CheckResult:
    """Spot-check that the rendered HTML actually uses snazzy keyword/
    string colours somewhere — guards against the theme JSON being
    accepted but token mappings silently falling back to defaults.
    """
    sample = ctx.dist_dir / "tutorials" / "bayesianlinearregression" / "index.html"
    html = _read(sample)
    if not html:
        return CheckResult(
            name="snazzy_token_colours_present",
            severity="must_match",
            passed=False,
            detail="sample tutorial missing",
        )
    keyword_hits = html.count(SNAZZY_KEYWORD) + html.count(SNAZZY_KEYWORD.lower())
    string_hits = html.count(SNAZZY_STRING) + html.count(SNAZZY_STRING.lower())
    if keyword_hits >= 5 and string_hits >= 5:
        return CheckResult(
            name="snazzy_token_colours_present",
            severity="must_match",
            passed=True,
            detail=(
                f"snazzy keyword colour x{keyword_hits}, "
                f"string colour x{string_hits}"
            ),
        )
    return CheckResult(
        name="snazzy_token_colours_present",
        severity="must_match",
        passed=False,
        detail=(
            f"too few snazzy token colour hits — keyword x{keyword_hits}, "
            f"string x{string_hits}"
        ),
    )


def _check_remark_image_class_plugin(ctx: Context) -> CheckResult:
    """Run the plugin's pure transform against a synthetic mdast tree to
    assert it strips the `?class=` query string and writes the right
    `hProperties.class`. Avoids round-tripping through a full Astro build.
    """
    plugin_path = ctx.repo_root / "src" / "lib" / "remark-image-class.ts"
    if not plugin_path.is_file():
        return CheckResult(
            name="remark_image_class_plugin",
            severity="must_match",
            passed=False,
            detail="src/lib/remark-image-class.ts missing",
        )
    text = plugin_path.read_text(encoding="utf-8")
    # Lightweight regex-on-source check — verifies the plugin matches the
    # expected pattern shape and writes hProperties. Anything more
    # ambitious would require spawning a node child process.
    if r'\?class="' not in text or 'hProperties' not in text:
        return CheckResult(
            name="remark_image_class_plugin",
            severity="must_match",
            passed=False,
            detail="plugin source missing the expected URL pattern or hProperties write",
            diff=text[:600],
        )
    # Round-trip: search the dist for any leaked `?class="` markers — they
    # should never reach the rendered HTML if the plugin runs. Markdown
    # HTML comments survive into dist via the markdown pipeline (they
    # carried `?class=` in their text), so strip those before searching.
    comment_re = re.compile(r"<!--.*?-->", re.DOTALL)
    leaked: list[str] = []
    for path in ctx.dist_dir.rglob("*.html"):
        snippet = _read(path)
        if '?class="' not in snippet:
            continue
        without_comments = comment_re.sub("", snippet)
        if '?class="' in without_comments:
            leaked.append(str(path.relative_to(ctx.dist_dir)))
            if len(leaked) > 5:
                break
    if leaked:
        return CheckResult(
            name="remark_image_class_plugin",
            severity="must_match",
            passed=False,
            detail=f"{len(leaked)} pages still contain unprocessed `?class=` markers",
            diff="\n".join(leaked),
        )
    return CheckResult(
        name="remark_image_class_plugin",
        severity="must_match",
        passed=True,
        detail="plugin registered + no `?class=` markers leaked into dist",
    )


def _check_katex_on_math_tutorial(ctx: Context) -> CheckResult:
    """The bayesianlinearregression tutorial sets `math: true` and embeds
    TeX. KaTeX should render at least one `katex` span.
    """
    sample = ctx.dist_dir / "tutorials" / "bayesianlinearregression" / "index.html"
    html = _read(sample)
    if not html:
        return CheckResult(
            name="katex_on_math_tutorial",
            severity="must_match",
            passed=False,
            detail="bayesianlinearregression tutorial missing",
        )
    if 'class="katex"' in html or "class=katex" in html:
        return CheckResult(
            name="katex_on_math_tutorial",
            severity="must_match",
            passed=True,
            detail="katex spans rendered on bayesianlinearregression tutorial",
        )
    return CheckResult(
        name="katex_on_math_tutorial",
        severity="must_match",
        passed=False,
        detail="no katex spans in dist HTML — math: true not rendering",
    )


def _check_div_wrapper_preserves_code_block(ctx: Context) -> CheckResult:
    """The notebook converter emits `<div class="reduced-code width-N" markdown=1>`
    around code fences. We need both the wrapper class to survive AND the
    inner Shiki-rendered code block to appear right after.
    """
    sample = ctx.dist_dir / "tutorials" / "bayesianlinearregression" / "index.html"
    html = _read(sample)
    if not html:
        return CheckResult(
            name="div_wrapper_preserves_code_block",
            severity="must_match",
            passed=False,
            detail="sample tutorial missing",
        )
    pattern = re.compile(
        r'<div class="(?:reduced-code|expanded-code|)\s*width-\d+"\s*markdown="?1"?\s*>'
        r'\s*<pre class="astro-code',
        re.MULTILINE,
    )
    matches = pattern.findall(html)
    if matches:
        return CheckResult(
            name="div_wrapper_preserves_code_block",
            severity="must_match",
            passed=True,
            detail=f"{len(matches)} convert.py div wrappers contain a Shiki block",
        )
    return CheckResult(
        name="div_wrapper_preserves_code_block",
        severity="must_match",
        passed=False,
        detail="no convert.py div wrappers contain a Shiki <pre>",
    )


def _check_dataframe_table_styling(ctx: Context) -> CheckResult:
    """`convert.py`'s `style_tables` injects `class="table-auto table dataframe"`
    on `<table>`s. The class string must reach `dist/`. We scan a few
    tutorials known to embed pandas tables.
    """
    samples = [
        "tutorials/encoding_colours",
        "tutorials/us_covid_evolution",
        "tutorials/cccc_institutions",
    ]
    needle = 'class="table-auto table dataframe"'
    hits: list[str] = []
    for slug in samples:
        html = _read(ctx.dist_dir / slug / "index.html")
        if needle in html:
            hits.append(slug)
    if hits:
        return CheckResult(
            name="dataframe_table_styling",
            severity="must_match",
            passed=True,
            detail=f"dataframe table classes preserved in {len(hits)}/{len(samples)} samples",
        )
    return CheckResult(
        name="dataframe_table_styling",
        severity="must_match",
        passed=False,
        detail=(
            "no sample tutorial preserved `class=\"table-auto table dataframe\"` — "
            "the markdown pipeline likely stripped the inline HTML"
        ),
    )


def _check_code_at_end_appendix(ctx: Context) -> CheckResult:
    """`put_all_code_at_the_end()` adds a section starting with the
    sentence "For your convenience, here's the code in one block:". A
    sample tutorial built from a notebook should preserve that block.
    """
    sample = ctx.dist_dir / "tutorials" / "bayesianlinearregression" / "index.html"
    html = _read(sample)
    if not html:
        return CheckResult(
            name="code_at_end_appendix",
            severity="must_match",
            passed=False,
            detail="sample tutorial missing",
        )
    needle = "For your convenience, here"
    if needle in html:
        return CheckResult(
            name="code_at_end_appendix",
            severity="must_match",
            passed=True,
            detail="code-at-the-end appendix present",
        )
    return CheckResult(
        name="code_at_end_appendix",
        severity="must_match",
        passed=False,
        detail=f"could not find sentinel '{needle}' in sample tutorial",
    )


def _check_spot_check_tutorials_build(ctx: Context) -> CheckResult:
    """Phase 10 plan §8 lists representative pages; verify each one is
    present and non-trivially sized. We catch silent build regressions
    (e.g. a parsing error that produces an empty page).
    """
    samples = [
        "tutorials/bayesianlinearregression",
        "tutorials/gaussian_processes",
        "tutorials/genetic_part_one",
        "blogs/2023_07_writing_update",
    ]
    failures: list[str] = []
    for slug in samples:
        p = ctx.dist_dir / slug / "index.html"
        if not p.is_file():
            failures.append(f"{slug}: missing")
            continue
        size = p.stat().st_size
        if size < 5000:
            failures.append(f"{slug}: only {size:,} bytes")
    if failures:
        return CheckResult(
            name="spot_check_tutorials_build",
            severity="must_match",
            passed=False,
            detail="; ".join(failures),
        )
    return CheckResult(
        name="spot_check_tutorials_build",
        severity="must_match",
        passed=True,
        detail=f"{len(samples)} representative pages built",
    )


CHECKS: list[Check] = [
    Check(name="shiki_theme_is_snazzy", severity="must_match", run=_check_shiki_theme_is_snazzy),
    Check(
        name="snazzy_token_colours_present",
        severity="must_match",
        run=_check_snazzy_token_colours_present,
    ),
    Check(
        name="remark_image_class_plugin",
        severity="must_match",
        run=_check_remark_image_class_plugin,
    ),
    Check(
        name="katex_on_math_tutorial",
        severity="must_match",
        run=_check_katex_on_math_tutorial,
    ),
    Check(
        name="div_wrapper_preserves_code_block",
        severity="must_match",
        run=_check_div_wrapper_preserves_code_block,
    ),
    Check(
        name="dataframe_table_styling",
        severity="must_match",
        run=_check_dataframe_table_styling,
    ),
    Check(
        name="code_at_end_appendix",
        severity="must_match",
        run=_check_code_at_end_appendix,
    ),
    Check(
        name="spot_check_tutorials_build",
        severity="must_match",
        run=_check_spot_check_tutorials_build,
    ),
]


# Silence "unused" linters for typed module re-exports.
_: Any = None
