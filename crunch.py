import os
import sys
import inspect
import subprocess
import base64
import json
from PIL import Image

cur_dir = os.path.dirname(os.path.abspath(inspect.stack()[0][1]))
print(cur_dir)

with open(data_file) as f:
    try:
        d = json.load(f)
    except json.JSONDecodeError:
        d = {}
 
#folder = sys.argv[1]
categories = ["blog/", "outreach/", "projects/", "trips/"]
for category in categories:
    full = cur_dir + "/static/img/" + category
    print("Looking at %s" % category)
    folders = [i for i in os.listdir(full) if not i.startswith(".") and os.path.isdir(full + i)]
    for folder in folders:
        print("Crunch images in %s" % folder)
        output_dir = full + folder + "/thumbs/"
        print("Thumbs output to %s" % output_dir)

        for filename in os.listdir(output_dir):
            path = output_dir + filename
            print("Digesting thumbnail %s" % path)
            key = category + folder + "/" + filename
            original_file = output_dir + "../" + filename
            im = Image.open(original_file)
            width, height = im.size
            im.close()
            with open(path, "rb") as f:
                encoded = base64.b64encode(f.read()).decode("utf-8")
            d[key] = {"width": width, "height": height, "data": encoded}
            
data_file = cur_dir + "/_data/imgdata.json"
with open(data_file, "w") as f:
    json.dump(d, f, indent=4, sort_keys=True)