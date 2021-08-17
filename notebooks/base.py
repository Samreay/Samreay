
# manim imports
#import jupyter_manim
#from manimlib.imports import *

# Matplotlib imports
import matplotlib.pyplot as plt


plt.style.use("dark_background")
plt.rcParams['figure.figsize'] = (8, 4)
plt.rcParams['figure.dpi'] = 200
plt.rcParams['hist.bins'] = 50
plt.rcParams['lines.markersize'] = 2
plt.rcParams['lines.linewidth'] = 1.5
plt.rcParams["axes.labelsize"] = 14
plt.rcParams["ytick.labelsize"] = 12
plt.rcParams["xtick.labelsize"] = 12
plt.rcParams["font.size"] = 14
plt.rcParams["image.cmap"] = "magma"

plt.rc('text', usetex=False)
plt.rc('font', family='sans-serif')
plt.rcParams['legend.frameon'] = False

plt.rcParams.update({
    "figure.facecolor":  (0.0, 0.0, 0.0, 0.0),  # red   with alpha = 30%
    "axes.facecolor":    (0.0, 0.0, 0.0, 0.0),  # green with alpha = 50%
    "savefig.facecolor": (0.0, 0.0, 0.0, 0.0),  # blue  with alpha = 20%
})


from cycler import cycler	  
plt.rcParams['axes.prop_cycle'] = (cycler(color=['#009aeb', '#f54545', '#ff890d', '#ffd075', '#96e879']) + cycler(linestyle=['-', '--', ':', '-.', '-']))

#class DefaultScene(Scene):
#    CONFIG={
#        "camera_config":{"background_color":"#FFFFFF"}
#    }
