"""HTML normalization + structural diff between Hugo and Astro renders."""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from pathlib import Path

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

CONTENT_HASH_RE = re.compile(r"(/_astro/[^\"' ?]+?\.)([a-f0-9]{8,})(\.[a-z0-9]+)")
GENERATED_IMG_RE = re.compile(r"/_astro/[^\"' ?,]+?\.(?:webp|avif|png|jpe?g|gif|svg)", re.IGNORECASE)
WHITESPACE_RE = re.compile(r"\s+")
TRACKING_ATTR_PREFIXES = ("data-astro-cid", "data-astro-source", "data-svelte-h")
GA_ID_RE = re.compile(r"G-[A-Z0-9]{8,}")


@dataclass
class DiffResult:
    name: str
    equal: bool
    summary: str
    unified: str = ""
    hugo_path: Path | None = None
    astro_path: Path | None = None
    extras: dict[str, str] = field(default_factory=dict)


def normalize(  # noqa: C901, PLR0915
    html: str,
    *,
    drop_class_attributes: bool = False,
    drop_inline_styles: bool = True,
    drop_id_attributes: bool = False,
    keep_only: list[str] | None = None,
    keep_selectors: list[str] | None = None,
    mask_selectors: list[str] | None = None,
) -> str:
    """Return a normalized HTML string suitable for diffing.

    See `references/html-normalization.md` for the full rule set.
    """
    soup = BeautifulSoup(html, "lxml")

    for comment in soup.find_all(string=lambda s: isinstance(s, Comment)):
        comment.extract()

    for el in soup.find_all(["script", "style"]):
        attrs_set = set(el.attrs.keys())
        if any(a.startswith(TRACKING_ATTR_PREFIXES) for a in attrs_set):
            el.decompose()
            continue
        text = el.get_text() or ""
        if GA_ID_RE.search(text) or "googletagmanager" in text:
            el.decompose()

    if mask_selectors:
        for sel in mask_selectors:
            for match in soup.select(sel):
                stub = soup.new_tag("masked")
                stub.attrs["tag"] = match.name
                match.replace_with(stub)

    if keep_only or keep_selectors:
        roots: list[Tag] = []
        for tag_name in keep_only or []:
            roots.extend(soup.find_all(tag_name))
        for selector in keep_selectors or []:
            roots.extend(soup.select(selector))
        if roots:
            container = BeautifulSoup("<root></root>", "lxml")
            wrapper = container.find("root")
            for r in roots:
                wrapper.append(r.extract())
            soup = container

    for el in soup.find_all(True):
        new_attrs: dict[str, str | list[str]] = {}
        for name, value in list(el.attrs.items()):
            lname = name.lower()
            if any(lname.startswith(p) for p in TRACKING_ATTR_PREFIXES):
                continue
            if lname == "nonce":
                continue
            if drop_class_attributes and lname == "class":
                continue
            if drop_inline_styles and lname == "style":
                continue
            if drop_id_attributes and lname == "id":
                continue
            # SVG xmlns: Astro/Vite preserves the literal `xmlns` attribute
            # on inline <svg> tags, while Hugo's HTML minifier strips it
            # because it's the default namespace. The two renders are
            # semantically identical — both browsers and lxml treat the
            # implicit and explicit namespace the same way.
            if el.name == "svg" and lname == "xmlns":
                continue
            new_attrs[lname] = value
        el.attrs = {}
        for k in sorted(new_attrs.keys()):
            v = new_attrs[k]
            if isinstance(v, list):
                if k == "class":
                    v = sorted(v)
                v = " ".join(str(x) for x in v)
            sv = str(v)
            if k in {"src", "href"}:
                sv = CONTENT_HASH_RE.sub(r"\1HASH\3", sv)
                sv = GENERATED_IMG_RE.sub("/_astro/IMG.EXT", sv)
            elif k == "srcset":
                entries = [e.strip() for e in sv.split(",") if e.strip()]
                normed: list[str] = []
                for e in entries:
                    e = CONTENT_HASH_RE.sub(r"\1HASH\3", e)
                    e = GENERATED_IMG_RE.sub("/_astro/IMG.EXT", e)
                    parts = e.split()
                    if parts:
                        url = parts[0].split("?", 1)[0]
                        e = " ".join([url, *parts[1:]])
                    normed.append(e)
                sv = ", ".join(sorted(normed))
            elif k == "sizes":
                sv = ", ".join(sorted(p.strip() for p in sv.split(",") if p.strip()))
            el.attrs[k] = sv

    for text in list(soup.find_all(string=True)):
        if text.parent and text.parent.name in {"pre", "code", "textarea"}:
            continue
        if isinstance(text, NavigableString):
            collapsed = WHITESPACE_RE.sub(" ", str(text)).strip()
            if not collapsed:
                text.extract()
            else:
                text.replace_with(collapsed)

    return soup.prettify()


def diff_html(  # noqa: PLR0913
    name: str,
    hugo_html: str,
    astro_html: str,
    *,
    keep_normalized: bool = False,
    out_dir: Path | None = None,
    **norm_opts: object,
) -> DiffResult:
    hugo_norm = normalize(hugo_html, **norm_opts)  # type: ignore[arg-type]
    astro_norm = normalize(astro_html, **norm_opts)  # type: ignore[arg-type]
    equal = hugo_norm == astro_norm
    hugo_path = astro_path = None
    if keep_normalized and out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
        safe = name.replace("/", "_").strip("_") or "root"
        hugo_path = out_dir / f"{safe}.hugo.html"
        astro_path = out_dir / f"{safe}.astro.html"
        hugo_path.write_text(hugo_norm, encoding="utf-8")
        astro_path.write_text(astro_norm, encoding="utf-8")
    if equal:
        return DiffResult(
            name=name,
            equal=True,
            summary="identical after normalization",
            hugo_path=hugo_path,
            astro_path=astro_path,
        )
    diff = difflib.unified_diff(
        hugo_norm.splitlines(),
        astro_norm.splitlines(),
        fromfile=f"hugo:{name}",
        tofile=f"astro:{name}",
        lineterm="",
    )
    unified = "\n".join(diff)
    added = sum(1 for line in unified.splitlines() if line.startswith("+") and not line.startswith("+++"))
    removed = sum(1 for line in unified.splitlines() if line.startswith("-") and not line.startswith("---"))
    return DiffResult(
        name=name,
        equal=False,
        summary=f"+{added} / -{removed} lines",
        unified=unified,
        hugo_path=hugo_path,
        astro_path=astro_path,
    )


def extract_meta_map(html: str) -> dict[str, str]:
    """Return a dict {name|property: content} for every <meta> in <head>."""
    soup = BeautifulSoup(html, "lxml")
    head = soup.find("head")
    if not head:
        return {}
    out: dict[str, str] = {}
    for meta in head.find_all("meta"):
        key = meta.get("name") or meta.get("property") or meta.get("http-equiv")
        if not key:
            if meta.get("charset"):
                out["charset"] = str(meta["charset"]).lower()
            continue
        content = meta.get("content", "")
        out[str(key).lower()] = str(content)
    return out


def extract_nav_links(html: str, nav_selector: str = "nav") -> list[tuple[str, str]]:
    """Return [(label, href), ...] from the first matching nav."""
    soup = BeautifulSoup(html, "lxml")
    nav = soup.select_one(nav_selector)
    if not nav:
        return []
    out: list[tuple[str, str]] = []
    for a in nav.find_all("a"):
        label = WHITESPACE_RE.sub(" ", a.get_text() or "").strip()
        href = str(a.get("href", "")).strip()
        if label or href:
            out.append((label, href))
    return out
