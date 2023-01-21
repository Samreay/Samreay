from pathlib import Path

here = Path(__file__).parent
markdowns: list[Path] = here.glob("*.md")
for m in markdowns:
    name = m.stem
    no_date = name[11:]
    print(no_date)
    dir = here / no_date
    dir.mkdir(exist_ok=True, parents=True)
    m.rename(dir / "index.md")
