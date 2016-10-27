import numpy as np
import matplotlib.pyplot as plt

# Draw our data
n = 20000
np.random.seed(0)
x = np.random.normal(size=n)
y = np.random.normal(size=n)

# Create a figure with the axis filling it, with a black background
fig = plt.figure(figsize=(8,6))
ax = fig.add_subplot(111, axisbg="#000000")
fig.subplots_adjust(0, 0, 1, 1)

# Plot our data points
ax.scatter(x, y, alpha=0.3, c="b", lw=0)

# Save it out, without whitespace and labels getting in the way
ax.get_xaxis().set_visible(False)
ax.get_yaxis().set_visible(False)
fig.savefig("bad.png", pad_inches=0, bbox_inches="tight")

