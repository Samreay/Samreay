from collections import Counter
from pathlib import Path
from subprocess import run
import yaml

input_dir = Path(__file__).parent / "tmp_covers"
output_dir = Path(__file__).parent / "covers"
data_file = Path(__file__).parents[4] / "data/artists.yml"

artists = yaml.load(data_file.read_text(), Loader=yaml.SafeLoader)
all_covers = [c for artist in artists for c in artist["covers"]]

# Check to see if any cover is in there more than once, which is a bug
counts = Counter(all_covers)
for cover, count in counts.items():
    if count > 1:
        print(f"Cover {cover} is in there {count} times")


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

    print(f"Processing {file}")

    inp = file.absolute()
    command = f"convert {inp} -strip -interlace Plane -quality 95% -resize x{max_height} {output1}"

    # Run command in shell
    run(command, shell=True)

# Check now to see if there are any available covers that are not in the list
missing_in_yaml = set(available_files) - set(all_covers)
if missing_in_yaml:
    print(f"Missing {len(missing_in_yaml)} covers in YAML")
    print(missing_in_yaml)

missing_file = set(all_covers) - set(available_files)
if missing_file:
    print(f"Missing {len(missing_file)} files")
    print(missing_file)
