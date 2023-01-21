from pathlib import Path

here = Path(__file__).parent
folders: list[Path] = here.glob("*")
for f in folders:
    if f.is_dir():
        mains = f.glob("main.*")
        for m in mains:
            new_path = here / f / m.name.replace("main", "cover")
            # print(new_path)
            m.rename(new_path)