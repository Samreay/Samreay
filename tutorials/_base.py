import matplotlib.pyplot as plt
from cycler import cycler

# A bunch of imports to keep the plotting code minimal
plt.style.use("default")
plt.rcParams["figure.figsize"] = (8, 4)
plt.rcParams["figure.dpi"] = 300
plt.rcParams["hist.bins"] = 50
plt.rcParams["lines.markersize"] = 2
plt.rcParams["lines.linewidth"] = 1.5
plt.rcParams["axes.labelsize"] = 14
plt.rcParams["ytick.labelsize"] = 12
plt.rcParams["xtick.labelsize"] = 12
plt.rcParams["font.size"] = 14
plt.rcParams["axes.grid"] = False
plt.rcParams["image.cmap"] = "magma"
plt.rc("text", usetex=False)
plt.rc("font", family="sans-serif")
plt.rcParams["legend.frameon"] = False
plt.rcParams["axes.spines.right"] = False
plt.rcParams["axes.spines.top"] = False
plt.rcParams.update(
    {
        "figure.facecolor": (0.0, 0.0, 0.0, 0.0),
        "axes.facecolor": (0.0, 0.0, 0.0, 0.0),
        "savefig.facecolor": (0.0, 0.0, 0.0, 0.0),
    }
)
plt.rcParams["axes.prop_cycle"] = cycler(color=["#009aeb", "#3df2e0", "#ff890d", "#ffd075", "#96e879"]) + cycler(
    linestyle=["-", "--", ":", "-.", "-"]
)
