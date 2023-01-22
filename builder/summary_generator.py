import os
from pathlib import Path
import frontmatter

content_root = Path(__file__).parent.parent / "content"

def get_post_list() -> list[Path]:
    dir = content_root / "reviews"
    return [dir / f for f in sorted(dir.glob("**/index.md"))]


def extra_info(loc: Path):
    properties = frontmatter.load(loc).to_dict()
    del properties["content"]
    properties["path"] = loc.parent.relative_to(content_root).as_posix()
    return properties


def format_post(p, url="https://cosmiccoding.com.au"):
    sb = f"* **{p['name']}** ("
    sb += f"[review]({url}/{p['path']}), "
    for k, v in p["links"].items():
        sb += f"[{k}]({v}), "
    sb = sb[:-2]
    sb += "): "
    sb += p['description']
    if p["name"] == "Soul Relic":
        sb += "(Disclosure: I wrote this.)"
    return sb


if __name__ == "__main__":
    posts = get_post_list()
    info = [extra_info(p) for p in posts]

    info = sorted(info, key=lambda x: float(x["weight"]))
    formatted = [format_post(p) for p in info]

    here = Path(__file__).parent
    with open(here.parent / "themes/sams-theme/static/summary.md", "w") as f:
        f.write("\n".join(formatted))
    print(formatted)
