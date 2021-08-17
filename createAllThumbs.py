import os
import sys
import inspect
import subprocess
import base64
import json
from PIL import Image

cur_dir = os.path.dirname(os.path.abspath(inspect.stack()[0][1]))
print(cur_dir)

if len(sys.argv) > 1:
    selected = sys.argv[1]
else:
    selected = None
categories = ["blog/", "tutorials/"]
for category in categories:
    full = cur_dir + "/static/img/" + category
    print("Looking at %s" % category)
    folders = [i for i in os.listdir(full) if not i.startswith(".") and os.path.isdir(full + i)]
    for folder in folders:
        if selected is not None and folder != selected:
            continue
        arg = category + folder
        print(arg)
        subprocess.run(["createThumb.bat", arg], stdout=subprocess.PIPE, cwd=cur_dir)

        
