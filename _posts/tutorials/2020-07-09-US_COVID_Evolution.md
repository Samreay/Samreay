---
layout: post
title:  "Evolution of US COVID-19 cases"
desc: "Practise with pandas, python and plotly."
date: 2020-07-09
categories: [tutorial]
tags: [plotting]
loc: 'tutorials/us_covid_evolution/'
permalink: tutorials/us_covid_evolution 
redirect_from: "/uscovidevolution"

---

This plot was first [inspired by this absolute masterpiece of a visualisation](https://www.reddit.com/r/dataisbeautiful/comments/hl20sz/watch_covid19_spread_throughout_the_continental/). I was chatting with [David Morton](https://github.com/DavidMorton) about how much work it must have taken (coding up textures, exporting to blender, creating the model, rendering, compositing, loading back into code, annotating, so much work). David then went and [created a python only version of the plot](https://github.com/DavidMorton/COVID-19-Analysis), and I decided I'd give it a crack too. We've used the same data, but the transformations, plotting and output are all different.

Here's what we'll be making:

{% include video.html url="evolution.mp4" autoplay="true" class="img-poster" %}To start, I cloned down the Johns Hopkins [COVID-19 repo](https://github.com/CSSEGISandData/COVID-19). I then added into the `root` dir shown below both the [population counts](https://www.census.gov/data/datasets/time-series/demo/popest/2010s-counties-total.html) for ech county, and the [`geojson`](https://github.com/plotly/datasets/blob/master/geojson-counties-fips.json) file that allows us to plot said counties.

```python
import os
import pandas as pd
import numpy as np
from matplotlib.colors import to_hex
import matplotlib.pyplot as plt
import cmasher as cmr
import plotly.express as px
import plotly.graph_objects as go
from functools import lru_cache

# Dir where you clone out https://github.com/CSSEGISandData/COVID-19
root = "D:/data/covid/COVID-19/csse_covid_19_data/csse_covid_19_time_series/"
```

Then, lets find all the csv files for the US states and load them in.

```python
df = pd.read_csv(os.path.join(root, "time_series_covid19_confirmed_US.csv"))
print(df.columns)
```

    Index(['UID', 'iso2', 'iso3', 'code3', 'FIPS', 'Admin2', 'Province_State',
           'Country_Region', 'Lat', 'Long_',
           ...
           '7/2/20', '7/3/20', '7/4/20', '7/5/20', '7/6/20', '7/7/20', '7/8/20',
           '7/9/20', '7/10/20', '7/11/20'],
          dtype='object', length=183)
    
Right, so its sort of pivoted already. But I dont actually want this, because I want smooth interpolation. I want dates on the index, and FIPS on the columns. On top of that, I want the relative increase in number of cases per 100k residents, or we'll just be [replicating a population map](https://xkcd.com/1138/).

So first, lets get the estimate population of each FIPS:

```python
# Load the population for each county
df_pop = pd.read_csv(os.path.join(root, "co-est2019-alldata.csv"), encoding="ISO-8859-1")
df_pop["FIPS"] = (df_pop["STATE"] * 1000 + df_pop["COUNTY"]).apply("{:0>5}".format)
df_pop = df_pop[["FIPS", "POPESTIMATE2019"]]
df_pop
```

<div>
<style scoped>
    .dataframe tbody tr th:only-of-type {
        vertical-align: middle;
    }

    .dataframe tbody tr th {
        vertical-align: top;
    }

    .dataframe thead th {
        text-align: right;
    }
</style>
<table class="table table-hover table-bordered">  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>FIPS</th>
      <th>POPESTIMATE2019</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>0</th>
      <td>01000</td>
      <td>4903185</td>
    </tr>
    <tr>
      <th>1</th>
      <td>01001</td>
      <td>55869</td>
    </tr>
    <tr>
      <th>2</th>
      <td>01003</td>
      <td>223234</td>
    </tr>
    <tr>
      <th>3</th>
      <td>01005</td>
      <td>24686</td>
    </tr>
    <tr>
      <th>4</th>
      <td>01007</td>
      <td>22394</td>
    </tr>
    <tr>
      <th>...</th>
      <td>...</td>
      <td>...</td>
    </tr>
    <tr>
      <th>3188</th>
      <td>56037</td>
      <td>42343</td>
    </tr>
    <tr>
      <th>3189</th>
      <td>56039</td>
      <td>23464</td>
    </tr>
    <tr>
      <th>3190</th>
      <td>56041</td>
      <td>20226</td>
    </tr>
    <tr>
      <th>3191</th>
      <td>56043</td>
      <td>7805</td>
    </tr>
    <tr>
      <th>3192</th>
      <td>56045</td>
      <td>6927</td>
    </tr>
  </tbody>
</table>
<p>3193 rows × 2 columns</p>
</div>

Great, lets merge that in. In addition, you know, to melting, converting units and smoothing it out.

```python
# Determine useless columns
drop = [x for x in df.columns if "/" not in x and x != "FIPS"]

# Melt it down so we can convert types easily
df2 = df.drop(columns=drop).melt(id_vars="FIPS", var_name="date").dropna()
df2["date"] = pd.to_datetime(df2["date"])
df2["FIPS"] = df2["FIPS"].astype(int).apply("{:0>5}".format)

# Add the populations
df2 = df2.merge(df_pop, on="FIPS")
df2["value"] = 100000 * df2["value"] / df2["POPESTIMATE2019"]

# Pivot and get the difference
df2 = df2.pivot(columns="FIPS", index="date", values="value").diff(axis=0)
# Smooth it out a touch and remove some 0 rows
df2 = df2.rolling(7).mean().iloc[50:, :]
```

We've got the data in a format we want. But I'll also want to turn this into a shiny animation, probably around 10 seconds in length or more. At 30FPS, thats 300+ frames. More than we have rows. So time for interpolation!

```python
fr = 30  # frame rate
t = 12  # seconds
new_index = pd.date_range(df2.index.min(), df2.index.max(), fr * t)

# Combine index, interp, remove original index
df3 = df2.reindex(new_index | df2.index).interpolate().loc[new_index]
df3.iloc[:5, :5]
```

<div>
<style scoped>
    .dataframe tbody tr th:only-of-type {
        vertical-align: middle;
    }

    .dataframe tbody tr th {
        vertical-align: top;
    }

    .dataframe thead th {
        text-align: right;
    }
</style>
<table class="table table-hover table-bordered">  <thead>
    <tr style="text-align: right;">
      <th>FIPS</th>
      <th>01001</th>
      <th>01003</th>
      <th>01005</th>
      <th>01007</th>
      <th>01009</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>2020-03-12 00:00:00.000000000</th>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
    </tr>
    <tr>
      <th>2020-03-12 08:05:20.891364902</th>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
    </tr>
    <tr>
      <th>2020-03-12 16:10:41.782729805</th>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
    </tr>
    <tr>
      <th>2020-03-13 00:16:02.674094707</th>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
    </tr>
    <tr>
      <th>2020-03-13 08:21:23.565459610</th>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
      <td>0.0</td>
    </tr>
  </tbody>
</table>
</div>

Perfect. So now lets make a plot for this:

```python
@lru_cache(maxsize=1)
def get_all_counties():
    with open(os.path.join(root, 'geojson-counties-fips.json')) as f:
        allcounties = json.load(f)
    return allcounties

@lru_cache(maxsize=1)
def get_cmap():
    """ Gets am ember-like cmap with brighter tail """
    cmap = plt.get_cmap('cmr.ember')
    array = 1 - cmap(np.linspace(0, 1, 100))
    brightening = np.clip(np.linspace(-10, 3, 100), 1, 4)
    final = np.clip(1 - (array / brightening[:, None]), 0, 1)
    return [to_hex(x) for x in final]

def default_configure(fig, date, vmax, bgcolor="#15171c"):
    """ Visual styling and labels, ignore this function as its boring """
    fig.update_geos(showcountries=False, showcoastlines=False, showframe=False,
                    oceancolor=bgcolor, lakecolor=bgcolor, showland=False, showlakes=False, 
                    showocean=False,subunitcolor=bgcolor, landcolor=bgcolor, bgcolor=bgcolor)
    fig.update_traces(marker_line_width=0, showscale=False)
    annotations = [
    dict(x=0.03,y=-0.03,font=dict(color="#635f5d",size=12),showarrow=False,
        text='Data from Johns Hopkins COVID-19 DataSet',
        xref="paper",yref="paper", yanchor="bottom"),
    dict(x=1.0,y=-0.03,font=dict(color="#635f5d",size=12),showarrow=False,
        text='Code at https://cosmiccoding.com.au/uscovidevolution',
        xref="paper",yref="paper", xanchor="right", yanchor="bottom"),
    dict(x=0.52, y=1.04, yanchor='top', xanchor='center', font=dict(size=24),
         showarrow=False, text='Daily New COVID-19 Cases Per 100k People', xref="paper", yref="paper"),
    dict(x=0.52, y=0.95, yanchor='top', xanchor='center', font=dict(color="#bfbfbf", size=16),
     showarrow=False, text=date, xref="paper", yref="paper")
    ]
    fig.update_layout(plot_bgcolor=bgcolor, paper_bgcolor=bgcolor,
                      margin={"r": 20,"t":40,"l":0,"b":20}, annotations=annotations,
                     coloraxis_colorbar=dict(thicknessmode="pixels", thickness=12, ticks="", 
                                             tickmode="array", 
                                             ticktext=[" 0", f" {int(vmax / 2)}", f" {vmax}+"], 
                                             tickvals=[0, int(vmax/2), 0.97 * vmax],
                                             x=0.92, y=0.5,
                                             tickfont=dict(size=16),
                                             len=0.65))

def save_fig(fig, n):
    out = "us_covid_evolution/png"
    os.makedirs(out, exist_ok=True)
    fig.write_image(os.path.join(out, f"{n:0>4}.png"), scale=3)

def plot_row(df, row, vmax=50, show=False):
    tmp = df.iloc[row, :].T.reset_index()
    date = tmp.columns[1].strftime("%d - %B")
    tmp.columns = ["FIPS", "c"]
    fig = px.choropleth(tmp, geojson=get_all_counties(), locations='FIPS', 
                        color="c", color_continuous_scale=get_cmap(), labels={"c": ""},
                        scope="usa", range_color=(0, vmax), template='plotly_dark')
    default_configure(fig, date, vmax)
    save_fig(fig, row)
    return fig
        
# Lets just plot the final frame to make sure it looks good   
n = df3.shape[0] - 1
fig = plot_row(df3, n, show=True)

# Want a PNG, not interactive
from IPython.display import Image
Image(fig.to_image(format="png", scale=2))
```

{% include image.html url="main.png" class="img-poster" %}
What an image! Now to save out a whole bunch of images. I'm doing this in a notebook, but `joblib` still works with the threading back end.

```python
from joblib import Parallel, delayed
Parallel(prefer="threads", n_jobs=4)(delayed(plot_row)(df3, n) for n in range(df3.shape[0]))
```

    ---------------------------------------------------------------------------

    KeyboardInterrupt                         Traceback (most recent call last)

    <ipython-input-14-11e8d807fa0e> in <module>
          1 from joblib import Parallel, delayed
    ----> 2 Parallel(prefer="threads", n_jobs=4)(delayed(plot_row)(df3, n) for n in range(df3.shape[0]))
    
    D:\anaconda3\lib\site-packages\IPython\core\displayhook.py in __call__(self, result)
        260             self.start_displayhook()
        261             self.write_output_prompt()
    --> 262             format_dict, md_dict = self.compute_format_data(result)
        263             self.update_user_ns(result)
        264             self.fill_exec_result(result)
    
    D:\anaconda3\lib\site-packages\IPython\core\displayhook.py in compute_format_data(self, result)
        149 
        150         """
    --> 151         return self.shell.display_formatter.format(result)
        152 
        153     # This can be set to True by the write_output_prompt method in a subclass
    
    D:\anaconda3\lib\site-packages\IPython\core\formatters.py in format(self, obj, include, exclude)
        178             md = None
        179             try:
    --> 180                 data = formatter(obj)
        181             except:
        182                 # FIXME: log the exception
    
    <decorator-gen-10> in __call__(self, obj)
    
    D:\anaconda3\lib\site-packages\IPython\core\formatters.py in catch_format_error(method, self, *args, **kwargs)
        222     """show traceback on failed format call"""
        223     try:
    --> 224         r = method(self, *args, **kwargs)
        225     except NotImplementedError:
        226         # don't warn on NotImplementedErrors
    
    D:\anaconda3\lib\site-packages\IPython\core\formatters.py in __call__(self, obj)
        700                 type_pprinters=self.type_printers,
        701                 deferred_pprinters=self.deferred_printers)
    --> 702             printer.pretty(obj)
        703             printer.flush()
        704             return stream.getvalue()
    
    D:\anaconda3\lib\site-packages\IPython\lib\pretty.py in pretty(self, obj)
        375                 if cls in self.type_pprinters:
        376                     # printer registered in self.type_pprinters
    --> 377                     return self.type_pprinters[cls](obj, self, cycle)
        378                 else:
        379                     # deferred printer
    
    D:\anaconda3\lib\site-packages\IPython\lib\pretty.py in inner(obj, p, cycle)
        553                 p.text(',')
        554                 p.breakable()
    --> 555             p.pretty(x)
        556         if len(obj) == 1 and type(obj) is tuple:
        557             # Special case for 1-item tuples.
    
    D:\anaconda3\lib\site-packages\IPython\lib\pretty.py in pretty(self, obj)
        392                         if cls is not object \
        393                                 and callable(cls.__dict__.get('__repr__')):
    --> 394                             return _repr_pprint(obj, self, cycle)
        395 
        396             return _default_pprint(obj, self, cycle)
    
    D:\anaconda3\lib\site-packages\IPython\lib\pretty.py in _repr_pprint(obj, p, cycle)
        682     """A pprint that just redirects to the normal repr function."""
        683     # Find newlines and replace them with p.break_()
    --> 684     output = repr(obj)
        685     lines = output.splitlines()
        686     with p.group():
    
    D:\anaconda3\lib\site-packages\plotly\basedatatypes.py in __repr__(self)
        420 
        421         repr_str = BasePlotlyType._build_repr_for_class(
    --> 422             props=props, class_name=self.__class__.__name__
        423         )
        424 
    
    D:\anaconda3\lib\site-packages\plotly\basedatatypes.py in _build_repr_for_class(props, class_name, parent_path_str)
       3583         else:
       3584             pprinter = ElidedPrettyPrinter(threshold=200, width=120)
    -> 3585             pprint_res = pprinter.pformat(props)
       3586 
       3587             # pprint_res is indented by 1 space. Add extra 3 spaces for PEP8
    
    D:\anaconda3\lib\pprint.py in pformat(self, object)
        142     def pformat(self, object):
        143         sio = _StringIO()
    --> 144         self._format(object, sio, 0, 0, {}, 0)
        145         return sio.getvalue()
        146 
    
    D:\anaconda3\lib\site-packages\plotly\utils.py in _format(self, val, stream, indent, allowance, context, level)
        127         else:
        128             return PrettyPrinter._format(
    --> 129                 self, val, stream, indent, allowance, context, level
        130             )
        131 
    
    D:\anaconda3\lib\pprint.py in _format(self, object, stream, indent, allowance, context, level)
        165             if p is not None:
        166                 context[objid] = 1
    --> 167                 p(self, object, stream, indent, allowance, context, level + 1)
        168                 del context[objid]
        169                 return
    
    D:\anaconda3\lib\pprint.py in _pprint_dict(self, object, stream, indent, allowance, context, level)
        187             items = sorted(object.items(), key=_safe_tuple)
        188             self._format_dict_items(items, stream, indent, allowance + 1,
    --> 189                                     context, level)
        190         write('}')
        191 
    
    D:\anaconda3\lib\pprint.py in _format_dict_items(self, items, stream, indent, allowance, context, level)
        344             self._format(ent, stream, indent + len(rep) + 2,
        345                          allowance if last else 1,
    --> 346                          context, level)
        347             if not last:
        348                 write(delimnl)
    
    D:\anaconda3\lib\site-packages\plotly\utils.py in _format(self, val, stream, indent, allowance, context, level)
        127         else:
        128             return PrettyPrinter._format(
    --> 129                 self, val, stream, indent, allowance, context, level
        130             )
        131 
    
    D:\anaconda3\lib\pprint.py in _format(self, object, stream, indent, allowance, context, level)
        165             if p is not None:
        166                 context[objid] = 1
    --> 167                 p(self, object, stream, indent, allowance, context, level + 1)
        168                 del context[objid]
        169                 return
    
    D:\anaconda3\lib\pprint.py in _pprint_list(self, object, stream, indent, allowance, context, level)
        208         stream.write('[')
        209         self._format_items(object, stream, indent, allowance + 1,
    --> 210                            context, level)
        211         stream.write(']')
        212 
    
    D:\anaconda3\lib\pprint.py in _format_items(self, items, stream, indent, allowance, context, level)
        387             self._format(ent, stream, indent,
        388                          allowance if last else 1,
    --> 389                          context, level)
        390 
        391     def _repr(self, object, context, level):
    
    D:\anaconda3\lib\site-packages\plotly\utils.py in _format(self, val, stream, indent, allowance, context, level)
        127         else:
        128             return PrettyPrinter._format(
    --> 129                 self, val, stream, indent, allowance, context, level
        130             )
        131 
    
    D:\anaconda3\lib\pprint.py in _format(self, object, stream, indent, allowance, context, level)
        165             if p is not None:
        166                 context[objid] = 1
    --> 167                 p(self, object, stream, indent, allowance, context, level + 1)
        168                 del context[objid]
        169                 return
    
    D:\anaconda3\lib\pprint.py in _pprint_dict(self, object, stream, indent, allowance, context, level)
        187             items = sorted(object.items(), key=_safe_tuple)
        188             self._format_dict_items(items, stream, indent, allowance + 1,
    --> 189                                     context, level)
        190         write('}')
        191 
    
    D:\anaconda3\lib\pprint.py in _format_dict_items(self, items, stream, indent, allowance, context, level)
        344             self._format(ent, stream, indent + len(rep) + 2,
        345                          allowance if last else 1,
    --> 346                          context, level)
        347             if not last:
        348                 write(delimnl)
    
    D:\anaconda3\lib\site-packages\plotly\utils.py in _format(self, val, stream, indent, allowance, context, level)
        127         else:
        128             return PrettyPrinter._format(
    --> 129                 self, val, stream, indent, allowance, context, level
        130             )
        131 
    
    D:\anaconda3\lib\pprint.py in _format(self, object, stream, indent, allowance, context, level)
        165             if p is not None:
        166                 context[objid] = 1
    --> 167                 p(self, object, stream, indent, allowance, context, level + 1)
        168                 del context[objid]
        169                 return
    
    D:\anaconda3\lib\pprint.py in _pprint_dict(self, object, stream, indent, allowance, context, level)
        187             items = sorted(object.items(), key=_safe_tuple)
        188             self._format_dict_items(items, stream, indent, allowance + 1,
    --> 189                                     context, level)
        190         write('}')
        191 
    
    D:\anaconda3\lib\pprint.py in _format_dict_items(self, items, stream, indent, allowance, context, level)
        344             self._format(ent, stream, indent + len(rep) + 2,
        345                          allowance if last else 1,
    --> 346                          context, level)
        347             if not last:
        348                 write(delimnl)
    
    D:\anaconda3\lib\site-packages\plotly\utils.py in _format(self, val, stream, indent, allowance, context, level)
        127         else:
        128             return PrettyPrinter._format(
    --> 129                 self, val, stream, indent, allowance, context, level
        130             )
        131 
    
    D:\anaconda3\lib\pprint.py in _format(self, object, stream, indent, allowance, context, level)
        165             if p is not None:
        166                 context[objid] = 1
    --> 167                 p(self, object, stream, indent, allowance, context, level + 1)
        168                 del context[objid]
        169                 return
    
    D:\anaconda3\lib\pprint.py in _pprint_list(self, object, stream, indent, allowance, context, level)
        208         stream.write('[')
        209         self._format_items(object, stream, indent, allowance + 1,
    --> 210                            context, level)
        211         stream.write(']')
        212 
    
    D:\anaconda3\lib\pprint.py in _format_items(self, items, stream, indent, allowance, context, level)
        387             self._format(ent, stream, indent,
        388                          allowance if last else 1,
    --> 389                          context, level)
        390 
        391     def _repr(self, object, context, level):
    
    D:\anaconda3\lib\site-packages\plotly\utils.py in _format(self, val, stream, indent, allowance, context, level)
        127         else:
        128             return PrettyPrinter._format(
    --> 129                 self, val, stream, indent, allowance, context, level
        130             )
        131 
    
    D:\anaconda3\lib\pprint.py in _format(self, object, stream, indent, allowance, context, level)
        159             self._readable = False
        160             return
    --> 161         rep = self._repr(object, context, level)
        162         max_width = self._width - indent - allowance
        163         if len(rep) > max_width:
    
    D:\anaconda3\lib\pprint.py in _repr(self, object, context, level)
        391     def _repr(self, object, context, level):
        392         repr, readable, recursive = self.format(object, context.copy(),
    --> 393                                                 self._depth, level)
        394         if not readable:
        395             self._readable = False
    
    D:\anaconda3\lib\pprint.py in format(self, object, context, maxlevels, level)
        403         and whether the object represents a recursive construct.
        404         """
    --> 405         return _safe_repr(object, context, maxlevels, level)
        406 
        407     def _pprint_default_dict(self, object, stream, indent, allowance, context, level):
    
    D:\anaconda3\lib\pprint.py in _safe_repr(object, context, maxlevels, level)
        512         for k, v in items:
        513             krepr, kreadable, krecur = saferepr(k, context, maxlevels, level)
    --> 514             vrepr, vreadable, vrecur = saferepr(v, context, maxlevels, level)
        515             append("%s: %s" % (krepr, vrepr))
        516             readable = readable and kreadable and vreadable
    
    D:\anaconda3\lib\pprint.py in _safe_repr(object, context, maxlevels, level)
        512         for k, v in items:
        513             krepr, kreadable, krecur = saferepr(k, context, maxlevels, level)
    --> 514             vrepr, vreadable, vrecur = saferepr(v, context, maxlevels, level)
        515             append("%s: %s" % (krepr, vrepr))
        516             readable = readable and kreadable and vreadable
    
    D:\anaconda3\lib\pprint.py in _safe_repr(object, context, maxlevels, level)
        544         level += 1
        545         for o in object:
    --> 546             orepr, oreadable, orecur = _safe_repr(o, context, maxlevels, level)
        547             append(orepr)
        548             if not oreadable:
    
    D:\anaconda3\lib\pprint.py in _safe_repr(object, context, maxlevels, level)
        544         level += 1
        545         for o in object:
    --> 546             orepr, oreadable, orecur = _safe_repr(o, context, maxlevels, level)
        547             append(orepr)
        548             if not oreadable:
    
    D:\anaconda3\lib\pprint.py in _safe_repr(object, context, maxlevels, level)
        544         level += 1
        545         for o in object:
    --> 546             orepr, oreadable, orecur = _safe_repr(o, context, maxlevels, level)
        547             append(orepr)
        548             if not oreadable:
    
    D:\anaconda3\lib\pprint.py in _safe_repr(object, context, maxlevels, level)
        491     typ = type(object)
        492     if typ in _builtin_scalars:
    --> 493         return repr(object), True, False
        494 
        495     r = getattr(typ, "__repr__", None)
    
    KeyboardInterrupt: 

And now that we have a PNG sequence, lets render it out to an mp4 file. Im going to also add a mask (which is black but transparent over the country and colorbar that I want to glow, I threw it together in photoshop) and some complex filters to emulate a glow effect without having to throw it in After Effects, and it also makes it pause on the last frame for a bit without having to rend out things over and over.

```
ffmpeg -r 30 -i us_covid_evolution/png/%04d.png -i us_covid_evolution/mask.png -filter_complex "      [1]setsar=sar=0[p],
[0]split[a][b],
[a][p]overlay,lumakey=0:tolerance=0.5:softness=0.5[x];
color=black,format=rgb24[c];
[c][x]scale2ref[c][i];
[c][i]overlay=format=auto:shortest=1,
setsar=sar=1,
gblur=30:3,
curves=all='0/0 1/1'[d],
[b]setsar=sar=1[e],
[d][e]blend=all_mode=addition,
scale=1920:-2,
tpad=stop_mode=clone:stop_duration=2
" -vcodec libx264 -crf 23 -movflags faststart -pix_fmt yuv420p us_covid_evolution/evolution.mp4
```

For a super brief explanation of the `-filter_complex`:
* Load in the mask and overlay it on the image so that the black "blacks-out" the parts I dont want
* lumakey then makes sure anything dim becomes transparent, so it wont glow
* Merge a black solid on top
* Apply a guassian glur
* Intensity the blurred image
* Add it on top of the original image
* Rescale it to 1920 pixels wide
* Add 2 seconds of video at the end which is the last frame frozen out.

After that has run, we should have a nice animated version of the PNG sequence! In fact, I'll put the video up the top. If you dont want the glow, the entire filter can just be the scaling the the `tpad`, much simpler.

{% include badge.html %}

Here's the full code for convenience:

```python
from IPython.display import Image
from functools import lru_cache
from joblib import Parallel, delayed
from matplotlib.colors import to_hex
import cmasher as cmr
import matplotlib.pyplot as plt
import numpy as np
import os
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go


# Dir where you clone out https://github.com/CSSEGISandData/COVID-19
root = "D:/data/covid/COVID-19/csse_covid_19_data/csse_covid_19_time_series/"

df = pd.read_csv(os.path.join(root, "time_series_covid19_confirmed_US.csv"))
print(df.columns)

# Load the population for each county
df_pop = pd.read_csv(os.path.join(root, "co-est2019-alldata.csv"), encoding="ISO-8859-1")
df_pop["FIPS"] = (df_pop["STATE"] * 1000 + df_pop["COUNTY"]).apply("{:0>5}".format)
df_pop = df_pop[["FIPS", "POPESTIMATE2019"]]
df_pop

# Determine useless columns
drop = [x for x in df.columns if "/" not in x and x != "FIPS"]

# Melt it down so we can convert types easily
df2 = df.drop(columns=drop).melt(id_vars="FIPS", var_name="date").dropna()
df2["date"] = pd.to_datetime(df2["date"])
df2["FIPS"] = df2["FIPS"].astype(int).apply("{:0>5}".format)

# Add the populations
df2 = df2.merge(df_pop, on="FIPS")
df2["value"] = 100000 * df2["value"] / df2["POPESTIMATE2019"]

# Pivot and get the difference
df2 = df2.pivot(columns="FIPS", index="date", values="value").diff(axis=0)
# Smooth it out a touch and remove some 0 rows
df2 = df2.rolling(7).mean().iloc[50:, :]

fr = 30  # frame rate
t = 12  # seconds
new_index = pd.date_range(df2.index.min(), df2.index.max(), fr * t)

# Combine index, interp, remove original index
df3 = df2.reindex(new_index | df2.index).interpolate().loc[new_index]
df3.iloc[:5, :5]

@lru_cache(maxsize=1)
def get_all_counties():
    with open(os.path.join(root, 'geojson-counties-fips.json')) as f:
        allcounties = json.load(f)
    return allcounties

@lru_cache(maxsize=1)
def get_cmap():
    """ Gets am ember-like cmap with brighter tail """
    cmap = plt.get_cmap('cmr.ember')
    array = 1 - cmap(np.linspace(0, 1, 100))
    brightening = np.clip(np.linspace(-10, 3, 100), 1, 4)
    final = np.clip(1 - (array / brightening[:, None]), 0, 1)
    return [to_hex(x) for x in final]

def default_configure(fig, date, vmax, bgcolor="#15171c"):
    """ Visual styling and labels, ignore this function as its boring """
    fig.update_geos(showcountries=False, showcoastlines=False, showframe=False,
                    oceancolor=bgcolor, lakecolor=bgcolor, showland=False, showlakes=False, 
                    showocean=False,subunitcolor=bgcolor, landcolor=bgcolor, bgcolor=bgcolor)
    fig.update_traces(marker_line_width=0, showscale=False)
    annotations = [
    dict(x=0.03,y=-0.03,font=dict(color="#635f5d",size=12),showarrow=False,
        text='Data from Johns Hopkins COVID-19 DataSet',
        xref="paper",yref="paper", yanchor="bottom"),
    dict(x=1.0,y=-0.03,font=dict(color="#635f5d",size=12),showarrow=False,
        text='Code at https://cosmiccoding.com.au/uscovidevolution',
        xref="paper",yref="paper", xanchor="right", yanchor="bottom"),
    dict(x=0.52, y=1.04, yanchor='top', xanchor='center', font=dict(size=24),
         showarrow=False, text='Daily New COVID-19 Cases Per 100k People', xref="paper", yref="paper"),
    dict(x=0.52, y=0.95, yanchor='top', xanchor='center', font=dict(color="#bfbfbf", size=16),
     showarrow=False, text=date, xref="paper", yref="paper")
    ]
    fig.update_layout(plot_bgcolor=bgcolor, paper_bgcolor=bgcolor,
                      margin={"r": 20,"t":40,"l":0,"b":20}, annotations=annotations,
                     coloraxis_colorbar=dict(thicknessmode="pixels", thickness=12, ticks="", 
                                             tickmode="array", 
                                             ticktext=[" 0", f" {int(vmax / 2)}", f" {vmax}+"], 
                                             tickvals=[0, int(vmax/2), 0.97 * vmax],
                                             x=0.92, y=0.5,
                                             tickfont=dict(size=16),
                                             len=0.65))

def save_fig(fig, n):
    out = "us_covid_evolution/png"
    os.makedirs(out, exist_ok=True)
    fig.write_image(os.path.join(out, f"{n:0>4}.png"), scale=3)

def plot_row(df, row, vmax=50, show=False):
    tmp = df.iloc[row, :].T.reset_index()
    date = tmp.columns[1].strftime("%d - %B")
    tmp.columns = ["FIPS", "c"]
    fig = px.choropleth(tmp, geojson=get_all_counties(), locations='FIPS', 
                        color="c", color_continuous_scale=get_cmap(), labels={"c": ""},
                        scope="usa", range_color=(0, vmax), template='plotly_dark')
    default_configure(fig, date, vmax)
    save_fig(fig, row)
    return fig
        
# Lets just plot the final frame to make sure it looks good   
n = df3.shape[0] - 1
fig = plot_row(df3, n, show=True)

# Want a PNG, not interactive
Image(fig.to_image(format="png", scale=2))

Parallel(prefer="threads", n_jobs=4)(delayed(plot_row)(df3, n) for n in range(df3.shape[0]))



```
