import os
import subprocess
import shutil
import sys
import tempfile

name = sys.argv[1]
print(f"Converting {name}")

assert os.path.exists(name)
basename = os.path.basename(name).lower().split(".")[0]
dir_name = os.path.dirname(name)
short_name = basename.split("-")[-1]
date = "-".join(basename.split("-")[:3])
print(f"Short name is {short_name}")

basedir = f"_posts/tutorials/"
print("Calling convert PLEASE")
subprocess.run(
    f"jupyter nbconvert {name} --to markdown --output-dir {basedir} --TagRemovePreprocessor.enabled=True --TagRemovePreprocessor.remove_cell_tags remove --TagRemovePreprocessor.remove_input_tags remove_input --TagRemovePreprocessor.remove_all_outputs_tags remove_output",
    check=True,
)

img_dir = f"static\\img\\tutorials\\{short_name}"
print(f"Moving images around and into {img_dir}")
if os.path.exists(img_dir):
    print(f"Removing images from {img_dir}")
    shutil.rmtree(img_dir)

print(f"Making directory {img_dir}")
os.makedirs(img_dir, exist_ok=True)

output_img_dir = os.path.join(basedir, f"{basename}_files")
desired_img_dir = os.path.join(img_dir, "original")

if os.path.exists(output_img_dir):
    print(f"Moving from {output_img_dir} to {desired_img_dir}")
    shutil.move(output_img_dir, desired_img_dir)

if not os.path.exists(desired_img_dir):
    os.makedirs(desired_img_dir, exist_ok=True)

# Process MD file
print("Processing file")

md_file = os.path.join(basedir, f"{basename}.md")
with open(md_file, "r") as fin:
    data = fin.read().splitlines(True)


def get_carbon_image(file, name, spacing, watermark=False):
    name = f"{name}.png"
    if spacing:
        config = "carbon_config_square.json"
    else:
        config = "carbon_config.json"
    if watermark:
        name = name.replace(".png", "_share.png")

    command = (
        f"carbon-now --config {config} -h -l {desired_img_dir} -t {name.replace('.png', '')} {file}"
    )
    print(f"Executing command: {command}")
    subprocess.run(command, check=False, shell=True)
    return name


main_img = None
img_index = None
code_content = []
in_code = False
to_copy = []
url = "/tutorials/{short_name}"
include_code = True

replaces = [
    ("###DATE", date),
    ("###LOC", f"'tutorials/{short_name}/'"),
    ("###LINK", f"tutorials/{short_name}"),
    ("--------------------------------------------------------------", ""),
    ("                               Traceback", " Traceback"),
    ("       Traceback", " Traceback"),
    ("   Traceback", " Traceback"),
]
for i, l in enumerate(data):
    if l.startswith("!!!replace"):
        name2 = name.replace("\\", "/")
        data[i] = ""
        # data[i] = f"[Download the notebook here](https://cosmiccoding.com.au/{name2})"

    for a, b in replaces:
        l = l.replace(a, b)

    data[i] = l
    if "###REMOVE" in l or "### REMOVE" in l:
        data[i] = ""
    if l.startswith("![png]"):
        loc = l.split("[png]")[1][1:-2].split("/")[1]
        e = ""
        c = 1
        while len(data) > i + c:
            if data[i + c].strip() == "":
                c += 1
            else:
                t = data[i + c]
                if "!!!" in t:
                    classes = t.replace("!!!", "").strip()
                    e = f'class="{classes}"'
                break
        replacement = f'{{% include image.html url="{loc}" {e} %}}'
        print(f"Replacing image insert {loc}")
        data[i] = replacement
        img_index = i
    if l.startswith("redirect_from"):
        redirect = l.split(":")[-1].strip().replace('"', "")
        if len(redirect) < len(url):
            url = redirect
    if l.startswith("![jpeg]"):
        loc = l.split("[jpeg]")[1][1:-2].split("/")[1].replace("jpeg", "jpg")
        e = ""
        c = 1
        while len(data) > i + c:
            if data[i + c].strip() == "":
                c += 1
            else:
                t = data[i + c]
                if "!!!" in t:
                    classes = t.replace("!!!", "").strip()
                    e = f'class="{classes}"'
                break
        replacement = f'{{% include image.html url="{loc}" {e} %}}'
        print(f"Replacing image insert {loc}")
        data[i] = replacement
        img_index = i
    if l.startswith('<table border="1" class="dataframe"'):
        data[i] = '<table class="table-auto">'
    if l.startswith("!!!"):
        if "nofinalcode" in l:
            include_code = False
        if "main" in l and "carbon" not in l:
            main_img = loc
            extension = loc.split(".")[-1]
            if "remove_main" in l:
                data[img_index] = ""
            else:
                data[img_index] = data[img_index].replace(loc, f"main.{extension}")
            print(f"Found main image {loc}")
            data[i] = ""
    if "RuntimeWarning" in l or "DeprecationWarning" in l or "Anaconda" in l:
        data[i] = ""
        data[i + 1] = ""
    if "from ipykernel" in l or "texmanager" in l:
        data[i] = ""

    if l.startswith("<video"):
        if "src" in l:
            file = l.split("src=")[1].split('"')[1]
            to_copy.append(file)
            basename = os.path.basename(file)
            data[
                i
            ] = f'{{% include video.html url="{basename}" autoplay="true" class="img-poster" %}}\n'
            j = 1
            while True:
                if data[i + j].strip().startswith("</video"):
                    data[i + j] = ""
                    k = 1
                    x = data[i + j + k]
                    while x == "" or "!!!" in x or x == "\n":
                        data[i + j + k] = ""
                        if "!!!" in x:
                            data[i] = data[i].replace(
                                "img-poster", x.replace("!!!", "").replace("\n", "").lstrip()
                            )
                        k += 1
                        x = data[i + j + k]
                    break
                data[i + j] = ""
                j += 1
        else:
            data[i] = ""
            j = 1
            while True:
                l2 = data[i + j]
                if "<source" in l2:
                    file = l2.split("src=")[1].split('"')[1]
                    to_copy.append(file)
                    basename = os.path.basename(file)
                    data[
                        i + j
                    ] = f'{{% include video.html url="{basename}" autoplay="true" class="img-poster" %}}\n'
                elif "</video>" in data[i + j]:
                    data[i + j] = ""
                    k = 1
                    x = data[i + j + k]
                    while x == "" or "!!!" in x or x == "\n":
                        data[i + j + k] = ""
                        if "!!!" in x:
                            data[i + j] = data[i + j].replace("img-poster", x.replace("!!!", ""))
                        k += 1
                        x = data[i + j + k]
                    break
                else:
                    data[i + j] = ""
                j += 1
    if l.startswith("```python"):
        in_code = True
    elif in_code:
        if l.startswith("```"):
            in_code = False
            code_content.append("\n")
        else:
            code_content.append(data[i])


# Remove empty code cells
in_code = False
had_code = False
start_code = 0


for i, l in enumerate(data):
    if l.startswith("```python"):
        in_code = True
        had_code = False
        start_code = i
    elif in_code:
        if l.startswith("```"):
            in_code = False
            if not had_code:
                for x in range(start_code, 1 + i):
                    data[x] = ""
        elif l.strip():
            had_code = True

# Go through and detect any carbon content plus add wrappers
code_start, code_end = None, None
in_code = False
add_wrapper = False
i = 0


def add_wrapper_to_code(data, code_start, code_end, i, extra_class):
    maxl = 0
    for j in range(code_start, code_end):
        maxl = max(maxl, len(data[j]))
    if ("carbon-code" in extra_class and maxl < 30) or maxl < 50:
        extra_class += " reduced-code"
    elif maxl > 70:
        extra_class += " expanded-code"
    data.insert(code_start - 1, f'<div class="{extra_class}" markdown="1">\n')
    data.insert(code_end + 2, "</div>\n")
    i += 2
    return i, extra_class


while i < len(data):
    l = data[i]
    if l.startswith("```python"):
        if add_wrapper:
            # If we get here then we need to wrap prior block
            i, _ = add_wrapper_to_code(data, code_start, code_end, i, extra_class)
            add_wrapper = False
        code_start = i + 1
        in_code = True
        extra_class = ""

    elif in_code:
        if l.startswith("```"):
            in_code = False
            code_end = i
            add_wrapper = True

    if l.startswith("!!!") and "carbon" in l:
        tmp = tempfile.NamedTemporaryFile(suffix=".py").name
        tmp2 = tempfile.NamedTemporaryFile(suffix=".py").name
        with open(tmp, "w") as f:
            for x in range(code_start, code_end):
                f.write(data[x])

        with open(tmp2, "w") as f:
            for x in range(code_start, code_end):
                f.write(data[x])
            f.write("\n")
            f.write(f"# Details at cosmiccoding.com.au{url}")

        is_main = "main" in l
        args = l.split()
        name = args[-1]
        if len(args) > 2:
            extra_class = "carbon-code " + " ".join(args[3:])
        else:
            extra_class = "carbon-code"
        if is_main:
            main_img = get_carbon_image(tmp, "main", True, watermark=False)

        img = get_carbon_image(tmp, name, False, watermark=False)
        get_carbon_image(tmp2, name, False, watermark=True)
        get_carbon_image(tmp2, name + "_spaced", True, watermark=True)

    if add_wrapper and i > code_end and l and not l.isspace():
        add_wrapper = False
        i, extra_class = add_wrapper_to_code(data, code_start, code_end, i, extra_class)

    i += 1

    # data[i] = f'{{% include image.html url="{img}" class="img-carbon {extra_class}" %}}\n'


for i, l in enumerate(data):
    if l.startswith("!!!"):
        data[i] = ""

# Sort the import statements
imports = [
    c for c in code_content if c.startswith("import ") or c.startswith("from ") and "import" in c
]
rest = [c for c in code_content if c not in imports]
imports = sorted(list(set(imports)))

data.append(f"{{% include badge.html %}}\n")

if include_code:
    data.append("\nHere's the full code for convenience:\n\n")
    data.append('<div class="expanded-code" markdown="1">')
    data.append("```python\n")
    data += imports
    data.append("\n")
    data += rest
    data.append("```\n")
    data.append("</div>")

if "---" not in data[0]:
    data.insert(0, "---\n")

# Remove duplicate empty lines in code sections
print("Removing duplicate whitespace")
in_code = False
in_pre = False
prev_empty = False
data2 = []
for i, l in enumerate(data):
    add = True
    if l.strip().startswith("```"):
        in_code = not in_code
    in_pre = l.startswith("    ")
    is_empty = not bool(l.strip().replace("\n", ""))

    add = True
    if not in_code and is_empty and prev_empty:
        add = False

    prev_empty = is_empty

    if add:
        data2.append(l)

with open(md_file, "w") as fout:
    fout.writelines(data2)

# Rename the right image to main
if main_img is None:
    print(
        "WAT NO MAIN IMAGE FOUND, ADD A MARKDOWN '!!!main' after the image you want as the thumbnail"
    )
else:
    print(f"Main image is found as {main_img}")
    extension = main_img.split(".")[-1]
    shutil.move(
        os.path.join(desired_img_dir, main_img), os.path.join(desired_img_dir, f"main.{extension}")
    )

for file in to_copy:
    og = os.path.join(dir_name, file)
    new_file = os.path.join(img_dir, os.path.basename(file))
    shutil.copy(og, new_file)
    print(f"Copied {og} to {new_file}")
# Process images
print("Processing images")
subprocess.run(["createThumb.bat", f"tutorials/{short_name}"], check=True)

# print("Updating thumbs")
# subprocess.run("python crunch.py", check=False, stdout=subprocess.DEVNULL)

