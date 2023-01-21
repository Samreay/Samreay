import argparse
import hashlib
import json
import logging
import logging.config
import re
import subprocess
from pathlib import Path
import shutil

import logging
from rich.logging import RichHandler

logger = logging.getLogger("convert")

def process_notebook(file_path: Path):
    root = Path(__file__).parent.parent
    logger.info(f"Processing file=\"{file_path.relative_to(root).as_posix()}\"")

    clean(file_path)

    markdown_path = convert_notebook(file_path)

    lines = load_markdown(markdown_path)

    for fn in [remove_pandas_html, remove_code, swap_videos, add_classes, style_tables, remove_dumb_shit, wrap_code]:
        lines = fn(lines)

    lines = add_thumbnail(lines, file_path)
    lines = remove_main(lines)
    lines = put_all_code_at_the_end(lines)

    with open(markdown_path, "w") as f:
        f.write("\n".join(lines))

def wrap_code(lines: list[str]) -> list[str]:
    logger.debug("\tFiguring out helpful code classes")
    content = []
    in_block = False
    start_line = 0
    max_width = 0
    for line in lines:
        if line.startswith("```"):
            if not in_block:
                # starting block, so keep track of line no
                start_line = len(content) + 1
                max_width = 0
                content.append("") # markdown has to have empty lines around divs
                content.append("") # this is our index
                content.append("")
                content.append(line)
            else:
                # if we're coming out, add the end div
                if max_width == 0:
                    content[start_line + 2] = ""
                    continue
                content.append(line)
                content.append("")
                content.append("</div>")
                content.append("")
                # add the classes
                cls = ""
                if max_width < 61:
                    cls = "reduced-code"
                if max_width > 79:
                    cls = "expanded-code"
                content[start_line] = f'<div class="{cls} width-{max_width}" markdown=1>'

            in_block = not in_block
        else:
            # Add the normal content without changing anything
            if in_block:
                max_width = max(max_width, len(line))
            content.append(line)
    return content


def clean(file_path: Path):
    dir = file_path.parent
    for d in dir.glob("*_files"):
        if d.is_dir():
            shutil.rmtree(d.absolute())
    
def remove_dumb_shit(lines: list[str]) -> list[str]:
    remove = ["texmanager", "DeprecationWarnin", "InteractiveShellApp", "dedent function was deprecated"]
    results = []
    for l in lines:
        for r in remove:
            if r in l:
                break
        else:
            results.append(l)
    return results

def convert_notebook(file_path: Path) -> Path:
    basedir = file_path.parent
    expected_output = file_path.with_suffix(".md")
    logger.info(f"\tCalling nbconvert on {file_path}")
    subprocess.run(
        f'jupyter nbconvert "{file_path}" --to markdown --output-dir "{basedir}" --TagRemovePreprocessor.enabled=True --TagRemovePreprocessor.remove_cell_tags remove --TagRemovePreprocessor.remove_input_tags remove_input --TagRemovePreprocessor.remove_all_outputs_tags remove_output',
        check=True,
        shell=True,
    )
    if not expected_output.exists():
        raise RuntimeError(f"Expected output {expected_output} does not exist")

    output = expected_output.with_stem("index")
    logger.info(f"\tRenaming output to {output}")
    if output.exists():
        output.unlink()
    expected_output.rename(output)
    return output


def load_markdown(file_path: Path) -> list[str]:
    with open(file_path, "r") as f:
        return f.read().splitlines()


def remove_pandas_html(lines: list[str]) -> list[str]:
    newline_token = "|||"
    search = re.compile(r"(<style scoped.*?style>)")
    content = newline_token.join(lines)
    matches = search.findall(content)
    logger.debug(f"\tRemoving {len(matches)} pandas table headers")
    for match in matches:
        content = content.replace(match, "")
    return content.split(newline_token)


def remove_code(lines: list[str]) -> list[str]:
    logger.debug("\tRemoving unneeded python lines")
    remove_comment = "###remove"
    return [x for x in lines if remove_comment not in x.lower().replace(" ", "")]

def swap_videos(lines: list[str]) -> list[str]:
    for i, line in enumerate(lines):
        if "Your browser does not support the".lower() in line.lower():
            lines[i] = ""
        elif "</video>" in line:
            lines[i] = ""
        elif "<video src" in line:
            src = line.split("src=\"")[1].split('"')[0]
            lines[i] = f"![]({src})"
    return lines

def add_classes(lines: list[str]) -> list[str]:
    logger.debug("\tAdding classes to images blocks")

    current_classes = ""
    lines = lines[::-1]
    for i, line in enumerate(lines):
        if "!!!" in line:
            current_classes = line.replace("!", "").strip().replace(" ", ",")
            lines[i] = ""
        if current_classes and line.startswith("!["):
            lines[i] = line[:-1] + f'?class="{current_classes}")'
            current_classes = ""
    return lines[::-1]


def add_thumbnail(lines: list[str], file_path: Path) -> list[str]:
    logger.debug("\tAdding thumbnail to frontmatter")
    base_dir = file_path.parent

    def adjust(lines, index):
        line = lines[index]
        image_loc = line.split("](")[1].split(")")[0].split("?")[0]
        image_path = base_dir / image_loc
        if not image_path.exists():
            logger.error(f"Unable to find expected image at {image_path}")
        new_path = base_dir / image_path.with_stem("cover").name
        if new_path.exists():
            new_path.unlink()
        image_path.rename(new_path)
        lines[index] = lines[index].replace(image_loc, new_path.name)

    for i, line in enumerate(lines):
        if "img-main" in line:
            adjust(lines, i)
            return lines
    for i, line in enumerate(lines):
            if "![" in line:
                adjust(lines, i)
                break
    return lines


def remove_main(lines: list[str]) -> list[str]:
    for i, line in enumerate(lines):
        if "![](" in line and "remove" in line:
            lines[i] = ""
    return lines

def put_all_code_at_the_end(lines: list[str]) -> list[str]:
    logger.debug("\tAdding code at the end of the document")
    end_code = ["", "******", "", "For your convenience, here's the code in one block:", "", "```python"]
    in_code= False
    for line in lines:
        if "```python" in line:
            in_code = True
            continue
        elif "```" in line and in_code:
            in_code = False
        if in_code:
            end_code.append(line)
    end_code.append("```")
    return lines + end_code

    

def style_tables(lines: list[str]) -> list[str]:
    logger.debug("\tAdding classes to tables")
    for i, line in enumerate(lines):
        if line.startswith("<table"):
            lines[i] = '<table class="table-auto table dataframe">'
    return lines

def load_hashes(file_path: Path) -> dict[str, str]:
    if not file_path.exists():
        return {}
    with open(file_path, "r") as f:
        return json.load(f)


def get_hash(file_path: Path) -> str:
    content = file_path.read_bytes()
    return hashlib.blake2b(content).hexdigest()


def save_hashes(file_path: Path, hashes: dict[str, str]):
    with open(file_path, "w") as f:
        json.dump(hashes, f, indent=4)


if __name__ == "__main__":
    logger.setLevel(level=logging.DEBUG)
    logger.addHandler(RichHandler())

    parser = argparse.ArgumentParser(description="Convert a notebook to markdown")
    parser.add_argument("file_path", nargs="?", type=str, help="Path to the notebook", default=None)
    args = parser.parse_args()

    here = Path(__file__).parent

    count = 0
    if args.file_path:
        notebook_path = Path(args.file_path)
        process_notebook(notebook_path)

    else:
        logger.info("Processing all notebooks")

        # Load hashes
        hash_file = here / "hashes.json"
        hashes = load_hashes(hash_file)
        hashes_original = hashes.copy()

        all_notebooks = here.parent.glob("content/**/*.ipynb")
        for notebook_path in all_notebooks:
            key = str(notebook_path.relative_to(here.parent).as_posix())
            hash = get_hash(notebook_path)
            if key in hashes and hashes[key] == hash:
                logger.info(f"Skipping {key} as hash is unchanged")
                continue
            process_notebook(notebook_path.absolute())
            hashes[key] = hash

        if hashes != hashes_original:
            save_hashes(hash_file, hashes)
