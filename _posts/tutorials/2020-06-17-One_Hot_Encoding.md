---
layout: post
title:  "Trivial One Hot Encoding in Python"
desc: "The most efficient code snippet to one-hot encode columns"
date: 2020-06-17
categories: [tutorial]
tags: [snippet]
loc: 'tutorials/one_hot_encoding/'
permalink: /tutorials/one_hot_encoding
math: true
---


One hot encoding is something we do very commonly in machine learning, where we want to turn a categorical feature into a vector of ones and zeros that algorithms can make much easier sense of. 

For example, take this toy example dataframe of people and their favourite food. At the moment, it's useless to us.


```python
import pandas as pd

df = pd.DataFrame({
    "Person": ["Sam", "Ali", "Jane", "John"], 
    "FavFood": ["Pizza", "Vegetables", "Cake", "Hapiness"]
}).set_index("Person")

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
      <th>FavFood</th>
    </tr>
    <tr>
      <th>Person</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>Sam</th>
      <td>Pizza</td>
    </tr>
    <tr>
      <th>Ali</th>
      <td>Vegetables</td>
    </tr>
    <tr>
      <th>Jane</th>
      <td>Cake</td>
    </tr>
    <tr>
      <th>John</th>
      <td>Hapiness</td>
    </tr>
  </tbody>
</table>
</div>


I've seen enough different implementations of one-hot But in machine learning from first pricinples, that I thought I'd throw my own version into the ring. If you want a "big boy" solution, you can always just appeal to [scikit-learn's OneHotEncoder](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.OneHotEncoder.html), but the method just below is even simpler in my mind.



{% include image.html url="main.png" class="img-carbon" %}
You can see if we invoke the method on our dataframe from before, it automatically pulls out the index (as melt doesn't preserve the index), and then uses a pivot to determine whether or not you get a one or a zero in your encoded columns.


```python
display(one_hot(df))
```




<div>
<style scoped>
    .dataframe tbody tr th:only-of-type {
        vertical-align: middle;
    }

    .dataframe tbody tr th {
        vertical-align: top;
    }

    .dataframe thead tr th {
        text-align: left;
    }

    .dataframe thead tr:last-of-type th {
        text-align: right;
    }
</style>
<table class="table table-hover table-bordered">  <thead>
    <tr>
      <th>variable</th>
      <th colspan="4" halign="left">FavFood</th>
    </tr>
    <tr>
      <th>value</th>
      <th>Cake</th>
      <th>Hapiness</th>
      <th>Pizza</th>
      <th>Vegetables</th>
    </tr>
    <tr>
      <th>index</th>
      <th></th>
      <th></th>
      <th></th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>Ali</th>
      <td>0</td>
      <td>0</td>
      <td>0</td>
      <td>1</td>
    </tr>
    <tr>
      <th>Jane</th>
      <td>1</td>
      <td>0</td>
      <td>0</td>
      <td>0</td>
    </tr>
    <tr>
      <th>John</th>
      <td>0</td>
      <td>1</td>
      <td>0</td>
      <td>0</td>
    </tr>
    <tr>
      <th>Sam</th>
      <td>0</td>
      <td>0</td>
      <td>1</td>
      <td>0</td>
    </tr>
  </tbody>
</table>
</div>



Amazing and super simple!

Here's the full code for convenience:

```python
import pandas as pd


df = pd.DataFrame({
    "Person": ["Sam", "Ali", "Jane", "John"], 
    "FavFood": ["Pizza", "Vegetables", "Cake", "Hapiness"]
}).set_index("Person")

display(df)

def one_hot(df):
    names = df.index.names
    melted = df.reset_index().melt(id_vars=names)
    return melted.pivot_table(index=names, 
                              columns=["variable", "value"], 
                              aggfunc=len, 
                              fill_value=0)

display(one_hot(df))

```
