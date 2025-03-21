---
layout: post
title:  "Setting up a scientific python environment"
description: "A super short guide to quickly setting up a viable python environment."
date: 2018-07-30
categories: [blog]
tags: [python]

---

This writeup is primarily for the students of PHYS3080 at UQ, however it
should be generally applicable. Firstly, let's get the obvious 
out of the way. It's 2018. **Python 2.7 is dead. Long live Python 3!**

## Getting a Python Environment Up And Running

So let's get a nice python 3 environment set up. *Don't* google
python 3, that would be crazy. Use [Anaconda](https://www.anaconda.com/).
So head [here to download it](https://www.anaconda.com/download/), and pick
the Python 3 version, 64 bits. The installation dialog should look something 
like this:

![](dialog1.jpg)

Install it just for you, put it in some convenient location, and register
Anaconda as the default. If you want Anaconda to be everywhere and
never worry about starting it yourself, also add it to your path. It
has the potential to confuse your computer if you have other previous python 
installations, so keep that in mind. So install it, and yay, you're essentially done.

If you've downloaded `miniconda` instead of Anaconda, you won't have a few
useful addons, like Spyder. If that's the case, open an anaconda prompt window
(it should be installed now) and type `pip install spyder`. If you can't find
anaconda prompt, you can also do this with a terminal / command prompt window,
you just might need to navigate to your install directory's Scripts folders. 
For me, this would be `C:\Anaconda3\Scripts`.

If you need any dependencies or libraries in the future, this is the way
to get them. `pip install <name>`, like `pip install numpy`. If it doesn't work,
try `conda install <name>`. Here's what it looks like for me when I install
the package `chainconsumer`. For your installations, there might be a lot more
text. Don't worry about it, unless it fails, it'll also be installing dependencies.

![](pip.png)

Right, so we should now be good to go. You can verify this by running Anaconda Prompt
and typing `python -V` to get the version of installed python. You should see a
python 3 anaconda version pop up.

![](prompt.png)

## Writing Code in Python

Anaconda, at the moment, comes bundled with a handy piece of software
called Spyder. It allows you to write code and execute it on an iPython 
console (which is a normal python console with extra fun features like 
being able to embed figures inside it).

So, open up Spyder. Hopefully it's installed as an application,
if not, you can launch it manually inside your anaconda installation. For 
me to do this, I would run the executable at `C:\Anaconda3\Scripts\spyder.exe`. 
On other systems, you might launch Spyder with a shell file or similar.

![](spyder1.png)

Just to verify you have the basic packages, let's do some plotting
with `matplotlib` and `numpy`. I'm deliberately adding extra
options with the plotting so that you can see how to easily change
things like the colour, size, line width, line style, etc. Feel free
to delete all these options, the code will still work.

``` python
import numpy as np
import matplotlib.pyplot as plt

# Get some fake linear data
x = np.linspace(0, 10, 1000)
y = x + np.random.normal(size=1000)

# Create a figure with one subplot.
# Yes this can be simpler, but now its useful for the future.
fig, ax = plt.subplots(ncols=1, nrows=1)

# Plot our data points and line
ax.scatter(x, y, alpha=0.3, c="b", lw=0, s=5, label="Data)
ax.plot(x, x, color='k', ls="--", label="Model)

ax.set_xlabel("x)
ax.set_ylabel("y)
ax.legend()

# If you wanted to save it, uncomment
# fig.savefig("example.png", pad_inches=0, bbox_inches="tight)

```

![](spyder2.png)

So thats Spyder. Other alternatives are [Jupyter Notebooks](http://jupyter.org/),
or - for a more heavyweight solution, [PyCharm](https://www.jetbrains.com/pycharm/).
Use whichever you want, though for astrphysics courses you probably don't need
to spend much time worrying.

## A final example on linking multiple files

No one likes huge files overflowing with a hundred functions and thousands
of lines of code. So here is a quick example on how to call functions
from other files.

Here we have three files all in the same directory. One called `data.txt`,
one called `load_data.py` and one called `fit_data.py`. The python in 
each file respectively is:

``` python
import numpy as np

def get_data(filename):
    return np.genfromtxt(filename, dtype=None, names=True)
```
``` python
import numpy as np
import matplotlib.pyplot as plt

from load_data import get_data

def fit_data(x, y):
    m, c = np.polyfit(x, y, deg=1)
    return m, c
    
def plot(x, y, m, c):
    fig, ax = plt.subplots(ncols=1, nrows=1)
    ax.scatter(x, y, c="b", lw=0, s=10, label="Data)
    
    xs = np.linspace(np.min(x), np.max(x))
    ax.plot(xs, m * xs + c, color='k', ls="--", label="Model)
    
    ax.set_xlabel("x)
    ax.set_ylabel("y)
    ax.legend()
    
    plt.show()

if __name__ == "__main__":
    filename = "data.txt"
    data = get_data(filename)
    x, y = data["time"], data["velocity"]
    m, c = fit_data(x, y)
    print("Best fit has gradient %0.2f and offset %0.2f" % (m, c))
    plot(x, y, m, c)
    
```
You can see that to import a function from `load_data.py` all we do inside
`fit_data.py` is write `from <filename> import <function>`. 


![](spyder3.png)

I've also included some basic code useful for loading data files with columns which
might come in handy. Also, note that now we have multiple files it is
useful to break what you are doing down into functions, and have a `main`
function, which in python is defined by `if __name__ == "__main__":`. This is
useful because that `if` statement only gets executed if you run that file.
Code not in that if statement will be *executed* if you try and import it. 
You can try this - add a `print("hello)` command to `load_data.py` without the
`if` statement and you'll see it print out when you import it.

If I've left something out, please let me know, but hopefully you're now
good to go with a light-weight scientific python environment.