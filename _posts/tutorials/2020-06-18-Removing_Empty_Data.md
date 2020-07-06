---
layout: post
title:  "Removing Empty Columns"
desc: "Remove mostly empty columns to clean your data using pandas."
date: 2020-06-18
categories: [tutorial]
tags: [snippet]
loc: 'tutorials/removing_empty_data/'
permalink: /tutorials/removing_empty_data
redirect_from: "/removing_empty"
math: true
---

The sad reality of life as a data scientist is we spend too much time cleaning and processing data. And a lot of the time, our data contains some features which simply need to go in the bin. A column of 1000 values with only 2 entries is probably not going to be useful, after all. Let's make some data to illustrate this:


```python
import pandas as pd
import numpy as np

data = np.random.random(size=(100, 3))  # Random data between 0 and 1
data[data[:, 2] < 0.95, 2] = np.nan  # Set most of the last column to NaN
df = pd.DataFrame(data, columns=["A", "B", "C"])
display(df)
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
      <th>A</th>
      <th>B</th>
      <th>C</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>0</th>
      <td>0.220628</td>
      <td>0.245779</td>
      <td>NaN</td>
    </tr>
    <tr>
      <th>1</th>
      <td>0.854705</td>
      <td>0.370203</td>
      <td>NaN</td>
    </tr>
    <tr>
      <th>2</th>
      <td>0.669266</td>
      <td>0.735099</td>
      <td>NaN</td>
    </tr>
    <tr>
      <th>3</th>
      <td>0.890542</td>
      <td>0.267307</td>
      <td>NaN</td>
    </tr>
    <tr>
      <th>4</th>
      <td>0.595718</td>
      <td>0.001851</td>
      <td>NaN</td>
    </tr>
    <tr>
      <th>...</th>
      <td>...</td>
      <td>...</td>
      <td>...</td>
    </tr>
    <tr>
      <th>95</th>
      <td>0.544113</td>
      <td>0.792105</td>
      <td>NaN</td>
    </tr>
    <tr>
      <th>96</th>
      <td>0.734058</td>
      <td>0.224512</td>
      <td>NaN</td>
    </tr>
    <tr>
      <th>97</th>
      <td>0.500468</td>
      <td>0.004238</td>
      <td>NaN</td>
    </tr>
    <tr>
      <th>98</th>
      <td>0.152202</td>
      <td>0.780630</td>
      <td>NaN</td>
    </tr>
    <tr>
      <th>99</th>
      <td>0.279031</td>
      <td>0.041635</td>
      <td>NaN</td>
    </tr>
  </tbody>
</table>
<p>100 rows × 3 columns</p>
</div>


Here is a handy snippet to remove columns which are more than `threshold` empty:



{% include image.html url="empty.png" class="img-carbon" %}

Super simple. Notice the use of `isnull` here instead of `isnan` - the former is more general.


```python
df2 = remove_empty_columns(df)
display(df2)
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
      <th>A</th>
      <th>B</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>0</th>
      <td>0.220628</td>
      <td>0.245779</td>
    </tr>
    <tr>
      <th>1</th>
      <td>0.854705</td>
      <td>0.370203</td>
    </tr>
    <tr>
      <th>2</th>
      <td>0.669266</td>
      <td>0.735099</td>
    </tr>
    <tr>
      <th>3</th>
      <td>0.890542</td>
      <td>0.267307</td>
    </tr>
    <tr>
      <th>4</th>
      <td>0.595718</td>
      <td>0.001851</td>
    </tr>
    <tr>
      <th>...</th>
      <td>...</td>
      <td>...</td>
    </tr>
    <tr>
      <th>95</th>
      <td>0.544113</td>
      <td>0.792105</td>
    </tr>
    <tr>
      <th>96</th>
      <td>0.734058</td>
      <td>0.224512</td>
    </tr>
    <tr>
      <th>97</th>
      <td>0.500468</td>
      <td>0.004238</td>
    </tr>
    <tr>
      <th>98</th>
      <td>0.152202</td>
      <td>0.780630</td>
    </tr>
    <tr>
      <th>99</th>
      <td>0.279031</td>
      <td>0.041635</td>
    </tr>
  </tbody>
</table>
<p>100 rows × 2 columns</p>
</div>


And *bam*, column C is gone!

That's it for this post, wanted to keep this one super short because I know I've seen at least a dozen different implementations to remove empty columns, and some of them are definitely better than others. May this hopefully be a useful snippet!

{% include badge.html %}

Here's the full code for convenience:

```python
import numpy as np
import pandas as pd


data = np.random.random(size=(100, 3))  # Random data between 0 and 1
data[data[:, 2] < 0.95, 2] = np.nan  # Set most of the last column to NaN
df = pd.DataFrame(data, columns=["A", "B", "C"])
display(df)

def remove_empty_columns(df, threshold=0.9):
    column_mask = df.isnull().mean(axis=0) < threshold
    return df.loc[:, column_mask]

df2 = remove_empty_columns(df)
display(df2)

```
