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
print(f"Short name is {short_name}")

basedir = f"_posts/tutorials/"
print("Calling convert")
subprocess.run(f"jupyter nbconvert {name} --to markdown --output-dir {basedir} --TagRemovePreprocessor.enabled=True --TagRemovePreprocessor.remove_cell_tags=\"['remove']\" --TagRemovePreprocessor.remove_input_tags=\"['remove_input']\"  --TagRemovePreprocessor.remove_all_outputs_tags=\"['remove_output']\"", check=True)


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
with open(md_file, 'r') as fin:
    data = fin.read().splitlines(True)


def get_carbon_image(file, is_main, watermark=False):
    if is_main:
        name = f"main.png"
    else:
        name = f"carbon_{start}.png"
    if watermark:
        name = name.replace(".png", "_share.png")

    command = f"carbon-now --config carbon_config.json -h -l {desired_img_dir} -t {name.replace('.png', '')} {file}"
    print(f"Executing command: {command}")
    subprocess.run(command, check=False, shell=True)
    return name

main_img = None
img_index = None
code_content = []
in_code = False
to_copy = []
for i, l in enumerate(data):
    if l.startswith("!!!replace"):
        name2 = name.replace('\\', '/')
        data[i] = ""
        # data[i] = f"[Download the notebook here](https://cosmiccoding.com.au/{name2})"
    if l.startswith("![png]"):
        loc = l.split("[png]")[1][1:-2].split("/")[1]
        e = ''
        c = 1
        while len(data) > i + c:
            if data[i + c].strip() == "":
                c += 1
            else:
                t = data[i+c]
                if t.startswith("!!!") and "poster" in t:
                    print("Turning image into poster")
                    e = 'class="img-poster"'
                break
        replacement = f'{{% include image.html url="{loc}" {e} %}}'
        print(f"Replacing image insert {loc}")
        data[i] = replacement
        img_index = i
    if l.startswith("![jpeg]"):
        loc = l.split("[jpeg]")[1][1:-2].split("/")[1].replace("jpeg", "jpg")
        e = ''
        c = 1
        while len(data) > i + c:
            if data[i + c].strip() == "":
                c += 1
            else:
                t = data[i+c]
                if t.startswith("!!!") and "poster" in t:
                    print("Turning image into poster")
                    e = 'class="img-poster"'
                break
        replacement = f'{{% include image.html url="{loc}" {e} %}}'
        print(f"Replacing image insert {loc}")
        data[i] = replacement
        img_index = i
    if l.startswith('<table border="1" class="dataframe"'):
        data[i] = '<table class="table table-hover table-bordered">'
    if l.startswith("!!!"):
        if "main" in l and "carbon" not in l:
            main_img = loc
            data[img_index] = data[img_index].replace(loc, "main.png")
            print(f"Found main image {loc}")
            data[i] = ""
    if "RuntimeWarning" in l or "DeprecationWarning" in l:
        data[i] = ""
        data[i + 1] = ""
    if "from ipykernel" in l:
        data[i] = ""

    if l.startswith("<video"):
        if "src" in l:
            file = l.split("src=")[1].split('"')[1]
            to_copy.append(file)
            basename = os.path.basename(file)
            data[i] = f'{{% include video.html url="{basename}" autoplay="true" class="img-poster" %}}'
            j = 1
            while True:
                if data[i+j].strip().startswith("</video"):
                    data[i+j] = ""
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
                    data[i + j] = f'{{% include video.html url="{basename}" autoplay="true" class="img-poster" %}}'
                elif "</video>" in data[i + j]:
                    data[i + j] = ""
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

# Go through and detect any carbon content
code_start, code_end = None, None
in_code = False
for i, l in enumerate(data):
    if l.startswith("```python"):
        code_start = i + 1
        in_code = True
    elif in_code:
        if l.startswith("```"):
            in_code = False
            code_end = i
    if l.startswith("!!!") and "carbon" in l:
        tmp = tempfile.NamedTemporaryFile(suffix='.py').name
        tmp2 = tempfile.NamedTemporaryFile(suffix='.py').name
        with open(tmp, "w") as f:
            for x in range(code_start, code_end):
                f.write(data[x])

        with open(tmp2, "w") as f:
            for x in range(code_start, code_end):
                f.write(data[x])
            f.write("\n")
            f.write(f"# Details at cosmiccoding.com.au/tutorials/{short_name}")

        for x in range(code_start - 1, code_end + 1):
            data[x] = ""
        is_main = "main" in l
        img = get_carbon_image(tmp, is_main, watermark=False)
        img2 = get_carbon_image(tmp2, is_main, watermark=True)

        data[i] = f'{{% include image.html url="{img}" class="img-carbon" %}}'
        if is_main:
            main_img = img

for i, l in enumerate(data):
    if l.startswith("!!!"):
        data[i] = ""

# Sort the import statements
imports = [c for c in code_content if c.startswith("import ") or c.startswith("from ") and "import" in c]
rest = [c for c in code_content if c not in imports]
imports = sorted(imports)


data.append("\nHere's the full code for convenience:\n\n")
data.append("```python\n")
data += imports
data.append("\n")
data += rest
data.append("```\n")

if "---" not in data[0]:
    data.insert(0, "---\n")
with open(md_file, 'w') as fout:
    fout.writelines(data)

# Rename the right image to main
if main_img is None:
    print("WAT NO MAIN IMAGE FOUND, ADD A MARKDOWN '!!!main' after the image you want as the thumbnail")
else:
    print(f"Main image is found as {main_img}")
    shutil.move(os.path.join(desired_img_dir, main_img), os.path.join(desired_img_dir, "main.png"))

for file in to_copy:
    og = os.path.join(dir_name, file)
    new_file = os.path.join(img_dir, os.path.basename(file))
    shutil.copy(og, new_file)
    print(f"Copied {og} to {new_file}")
# Process images
print("Processing images")
subprocess.run(["createThumbSquish.bat", f"tutorials/{short_name}"], check=True)

print("Updating thumbs")
#subprocess.run("python crunch.py", check=False)

