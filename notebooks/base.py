
# manim imports
import jupyter_manim
from manimlib.imports import *

# Matplotlib imports
import matplotlib.pyplot as plt
plt.rcParams['figure.figsize'] = (8, 4)
plt.rcParams['figure.dpi'] = 200
plt.rcParams['hist.bins'] = 50
plt.rcParams['lines.markersize'] = 2
plt.rcParams['lines.linewidth'] = 2
plt.rcParams["axes.labelsize"] = 14
plt.rcParams["ytick.labelsize"] = 12
plt.rcParams["xtick.labelsize"] = 12
plt.rcParams["font.size"] = 14

plt.rc('text', usetex=False)
plt.rc('font', family='sans-serif')
plt.rcParams['legend.frameon'] = False

from cycler import cycler	  
plt.rcParams['axes.prop_cycle'] = (cycler(color=['#003049', '#D62828', '#F77F00', '#FCBF49', '#EAE2B7']) + cycler(linestyle=['-', '--', ':', '-.', '-']))

class DefaultScene(Scene):
    CONFIG={
        "camera_config":{"background_color":"#FFFFFF"}
    }
