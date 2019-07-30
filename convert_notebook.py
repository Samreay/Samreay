import os
import subprocess
import shutil
import sys

name = sys.argv[1]
print(f"Converting {name}")

assert os.path.exists(name)
basename = os.path.basename(name).lower().split(".")[0]
short_name = basename.split("-")[-1]
print(f"Short name is {short_name}")

basedir = f"_posts/blog/"
print("Calling convert")
subprocess.run(f"jupyter nbconvert {name} --to markdown --output-dir {basedir} --TagRemovePreprocessor.enabled=True --TagRemovePreprocessor.remove_cell_tags=\"['remove']\" --TagRemovePreprocessor.remove_input_tags=\"['remove_input']\"  --TagRemovePreprocessor.remove_all_outputs_tags=\"['remove_output']\"", check=True)


print("Moving images around")
img_dir = f"static/img/blog/{short_name}"
if os.path.exists(img_dir):
    print("Removing images")
    shutil.rmtree(img_dir)
os.makedirs(img_dir, exist_ok=True)
output_img_dir = os.path.join(basedir, f"{basename}_files")
desired_img_dir = os.path.join(img_dir, "original")
shutil.move(output_img_dir, desired_img_dir)

# Process MD file
print("Processing file")

md_file = f"{basedir}/{basename}.md"
with open(md_file, 'r') as fin:
    data = fin.read().splitlines(True)[1:]

main_img = None
img_index = None
removing = False
for i, l in enumerate(data):
    if l.startswith("!!!replace"):
        name2 = name.replace('\\', '/')
        data[i] = ""
        # data[i] = f"[Download the notebook here](https://cosmiccoding.com.au/{name2})"
    if l.startswith("![png]"):
        loc = l.split("[png]")[1][1:-2].split("/")[1]
        replacement = f'{{% include image.html url="{loc}"  %}}'
        print(f"Replacing image insert {loc}")
        data[i] = replacement
        img_index = i
    if l.startswith("!!!main"):
        main_img = loc
        data[img_index] = data[img_index].replace(loc, "main.png")
        print(f"Found main image {loc}")
        data[i] = ""
    if l.startswith("# Remove"):
        print("Found a code block to remove")
        data[i - 1] = ""
        removing = True
    if "RuntimeWarning" in l:
        data[i] = ""
        data[i + 1] = ""
    if removing:
        if l.startswith("```"):
            removing = False
        data[i] = ""
with open(md_file, 'w') as fout:
    fout.writelines(data)

# Rename the right image to main
if main_img is None:
    print("WAT NO MAIN IMAGE FOUND, ADD A MARKDOWN '!!!main' after the image you want as the thumbnail")
else:
    print(f"Main image is found as {main_img}")
    shutil.move(os.path.join(desired_img_dir, main_img), os.path.join(desired_img_dir, "main.png"))

# Process images
print("Processing images")
subprocess.run(["createThumb.bat", f"blog/{short_name}"], check=True)

print("Updating thumbs")
subprocess.run("python crunch.py", check=True)

