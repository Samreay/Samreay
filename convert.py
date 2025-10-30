from pathlib import Path
from subprocess import run

input_dir = Path(__file__).parent / "tmp_screenshots"
output_dir = Path(__file__).parent / "tmp_screenshots"

for file in sorted(input_dir.glob("*.png")):
    output = (output_dir / f"{file.stem}.webp").absolute()
    print(f"Processing {file}")  # noqa: T201

    inp = file.absolute()
    command = f"convert {inp} -strip -quality 60 {output}"

    # Run command in shell
    run(command, shell=True, check=False)
    inp.unlink()
