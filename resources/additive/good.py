import numpy as np
import matplotlib.pyplot as plt

# Sample our data
n = 20000
np.random.seed(0)
x = np.random.normal(size=n)
y = np.random.normal(size=n)

# Create a figure with the axis filling it, with a black background
fig = plt.figure(figsize=(8,6))
ax = fig.add_subplot(111, axisbg="#000000")
fig.subplots_adjust(0, 0, 1, 1)

# Draw the empty axis, which we use as a base.
fig.canvas.draw()
w, h = fig.canvas.get_width_height()
buffer = np.frombuffer(fig.canvas.buffer_rgba(), np.uint8)
first = buffer.astype(np.int16).reshape(h, w, -1).copy() #int16 so we dont overflow
first[first[:, :, -1] == 0] = 0 # Set transparent pixels to 0

layers = 20 # Number of layers to add. Higher numbers are better but slower
for i in range(layers):
    ax.clear()
    ax.patch.set_facecolor("#000000")
    ax.scatter(x[i::layers], y[i::layers], alpha=0.3, c="#1E3B9C", lw=0)
    fig.canvas.draw()
    img = np.frombuffer(fig.canvas.buffer_rgba(), np.uint8).astype(np.int16).reshape(h, w, -1)
    img[img[:, :, -1] == 0] = 0
    first += img # Add these particles to the main layer
    
first = np.clip(first, 0, 255) # Clip buffer back to int8 range

ax.clear()
plt.axis("off")
ax.imshow(first.astype(np.uint8), aspect='auto')
fig.savefig("good.png", pad_inches=0)