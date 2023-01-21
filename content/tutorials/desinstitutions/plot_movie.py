from matplotlib.colors import LinearSegmentedColormap as LSC
import numpy as np
import os
# Sorry about this, shouldn't have install it in the root env, but ah well
os.environ['PROJ_LIB'] = r'C:\Anaconda3\pkgs\proj4-5.2.0-ha925a31_1\Library\share'
from mpl_toolkits.basemap import Basemap
import matplotlib.pyplot as plt
import pandas as pd


data = pd.read_csv("institutions.csv")
colors = {
    "Australia": "#FFB300",
    "US": "#1976D2",
    "UK": "#4DD0E1",
    "Germany": "#98e63e",
    "Spain": "#E91E63",
    "Switzerland": "#FB8C00",
    "Brazil": "#43A047",
    "South Africa": "#8956e3",
    "Chile": "#f74f98"
}

# sort data
data = data.sort_values(by="long")
countries_order = ["US", "Chile", "Brazil", "Spain", "UK", "Switzerland", "Germany", "South Africa", "Australia"]
data["timing"] = 0

t = 0.5
dt = 0.3
ci = list(data.columns).index("country")
for c in countries_order:
    for i in range(data.shape[0]):
        if data.iloc[i, ci] == c:
            data.iloc[i, -1] = t
            t += dt

def get_power(dt):
    return 0.25
def get_mag(dt):
    if dt < 0:
        return 0
    else:
        return 1 + 2 * np.exp(-dt * 10)
def get_t_alpha(dt):
    if 0 < dt < 0.35:
        return 1
    else:
        return 0
def get_ha(long):
    if long < 190:
        return "left"
    else:
        return "right"

def get_basemap():
    return Basemap(projection='cyl', llcrnrlat=-80,urcrnrlat=90, 
                llcrnrlon=-170, urcrnrlon=190, area_thresh=10000.)
def get_base_fig():
    # Lets define some colors
    bg_color = "#000000"
    coast_color = "#222222"
    country_color = "#111111"
    plt.figure(figsize=(12, 6))
    m = get_basemap()
    m.fillcontinents(color=bg_color, lake_color=bg_color, zorder=-2)
    m.drawcoastlines(color=coast_color, linewidth=1.0, zorder=-1)
    m.drawcountries(color=country_color, linewidth=1.0, zorder=-1)
    m.drawmapboundary(fill_color=bg_color, zorder=-2)
    
    return m

def rgb_to_hex2(t):
    def clamp(x): 
        return int(max(0, min(x, 255)))
    return "#{0:02x}{1:02x}{2:02x}".format(clamp(t[0]), clamp(t[1]), clamp(t[2]))

def hex_to_rgb(h):
    h = h[1:]
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
    
def make_whiter(h):
    t = hex_to_rgb(h)
    mix = tuple(0.5 * (255 + i) for i in t)
    return rgb_to_hex2(mix)

def get_shaded(time, frame, final=False):
    m = get_base_fig()

    # Compute the limits and mesh
    zs = []
    scale = 1.2  # The size of the blur

    for country in np.unique(data.country):
        # Find the colour and create a smooth colour ramp
        c = colors[country]
        cmap = LSC.from_list("fade", [c + "00", c,"#FFFFFF"], N=1000)
        subset = data.loc[(data.country == country) & (data.timing <= time), :]
        
        # Find a vmax that looks good on all countries
        vmax = min(2, 0.7 * subset.shape[0]**0.7)
        
        # Compute the mesh values
        z = np.zeros(X.shape)
        for row in subset.itertuples(index=False):
            t = row.timing
            shape = get_power(time - t)
            mag = get_mag(time - t)
            talpha = get_t_alpha(time - t)

            x, y = m(row.long, row.lat)
            dist = ((x - X)**2 + (y - Y)**2)**shape # Sharp falloff
            z += np.exp(-dist * scale) * mag
            
            if talpha > 0:
                plt.text(x,y,"   " + row.shortname, c=make_whiter(c), fontsize=10, verticalalignment="center")
        # Show the mesh and add the white dots
        m.imshow(z, origin="lower", extent=[x0,x1,y0,y1], 
                 cmap=cmap, vmax=vmax, zorder=2)
        m.scatter(subset.long, subset.lat, latlon=True, c="#FFFFFF", 
                  alpha=0.8, s=2, zorder=3)
        
    
    # Set the title, and make the background black
    plt.title("DES Institutions around the world", fontsize=14, 
              color="#EEEEEE", fontname="Open Sans")
    fig = plt.gcf()
    fig.patch.set_facecolor("#000000")
    name = f"output/out_{frame:04d}.png"
    fig.savefig(name, bbox_inches="tight", padding=0, facecolor=fig.get_facecolor(), transparent=False, dpi=300)
    plt.close(fig)
    if final:
        import shutil
        for nn in range(1, 4 * 30):
            shutil.copy(name, f"output/out_{frame + nn:04d}.png")
    return
    
fps = 30
max_t = data["timing"].max()
timings = np.arange(0, max_t + 1, 1/fps)

m = get_basemap()
x0, y0 = m(-170, -80)
x1, y1 = m(190, 90)
xs, ys = np.linspace(x0, x1, 2000), np.linspace(y0, y1, 2000)
X, Y = np.meshgrid(xs, ys)
del m

for frame, time in enumerate(timings):
    final = frame == (len(timings) - 1)
    if frame < 300:
        continue
    print(frame, time)
    get_shaded(time, frame, final=final)
#get_shaded(4, 0)