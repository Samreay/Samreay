import sys
from collections import Counter
from pathlib import Path
from subprocess import run

import yaml

input_dir = Path(__file__).parent / "tmp_covers"
output_dir = Path(__file__).parent / "themes/sams-theme/assets/img/covers"
data_file = Path(__file__).parent / "data/artists.yml"

artists = yaml.load(data_file.read_text(), Loader=yaml.SafeLoader)
all_covers = [c for artist in artists for c in artist["covers"]]

# Check to see if any cover is in there more than once, which is a bug
counts = Counter(all_covers)
for cover, count in counts.items():
    if count > 1:
        print(f"Cover {cover} is in there {count} times")  # noqa: T201


output_dir.mkdir(exist_ok=True)

max_height = 1600

redo_new_files = False

available_files = []
for file in sorted(input_dir.glob("*")):
    # Skip identifier files
    if file.suffix == ".Identifier":
        file.unlink()
        continue

    available_files.append(file.stem)

    # Skip files that already exist
    output1 = (output_dir / f"{file.stem}.jpg").absolute()
    if output1.exists() and not redo_new_files:
        continue

    print(f"Processing {file}")  # noqa: T201

    inp = file.absolute()
    command = f"convert {inp} -strip -interlace Plane -quality 95% -resize x{max_height}\\> {output1}"

    # Run command in shell
    run(command, shell=True, check=False)

# Check now to see if there are any available covers that are not in the list
missing_in_yaml = set(available_files) - set(all_covers)
if missing_in_yaml:
    print(f"Missing {len(missing_in_yaml)} covers in YAML")  # noqa: T201
    print(missing_in_yaml)  # noqa: T201

missing_file = set(all_covers) - set(available_files)
if missing_file:
    print(f"Missing {len(missing_file)} files")  # noqa: T201
    print(missing_file)  # noqa: T201

if missing_file or missing_in_yaml:
    sys.exit(1)
