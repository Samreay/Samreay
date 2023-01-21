import os
from pathlib import Path


def get_post_list():
    dir = Path(__file__).parent / "_posts/reviews"
    return [dir / f for f in sorted(os.listdir(dir)) if f.endswith(".md")]


def extra_info(loc):
    with open(loc) as f:
        lines = f.read().splitlines()[1:]
    properties = {}
    for line in lines:
        if line.startswith("---"):
            return properties
        key, value = line.split(": ", maxsplit=1)
        properties[key] = value.replace('"', "")
    return properties


def format_post(p, url="https://cosmiccoding.com.au"):
    links_to_make = {"review": "permalink", "amazon": "amazon", "RoyalRoad": "royalroad"}
    sb = f"* **{p['name']}** ("
    for k, v in links_to_make.items():
        if v in p:
            link = p[v]
            if "http" not in link:
                link = url + link
            sb += f"[{k}]({link}), "
    sb = sb[:-2]
    sb += f"): {p['desc']}"
    return sb


if __name__ == "__main__":
    posts = get_post_list()
    info = [extra_info(p) for p in posts]

    info = sorted(info, key=lambda x: float(x["val"]))
    formatted = [format_post(p) for p in info]

    here = Path(__file__).parent
    with open(here / "summary.md", "w") as f:
        f.write("\n".join(formatted))
    print(formatted)
