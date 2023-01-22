---
title:  "Trivial One Hot Encoding in Python"
description: "The most efficient code snippet to one-hot encode columns"
date: 2020-06-25
categories: [tutorial]
tags: [snippet]
aliases: ["/one_hot"]
math: true
---


One hot encoding is something we do very commonly in machine learning, where we want to turn a categorical feature into a vector of ones and zeros that algorithms can make much easier sense of. 

For example, take this toy example dataframe of people and their favourite food. At the moment, it's useless to us.



<div class="reduced-code width-59" markdown=1>

```python
import pandas as pd

df = pd.DataFrame({
    "Person": ["Sam", "Ali", "Jane", "John"], 
    "FavFood": ["Pizza", "Vegetables", "Cake", "Happiness"]
}).set_index("Person")

display(df)
```

</div>



<div>

<table class="table-auto table dataframe">
  <thead>
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
      <td>Happiness</td>
    </tr>
  </tbody>
</table>
</div>


I've seen enough different implementations of one-hot But in machine learning from first pricinples, that I thought I'd throw my own version into the ring. If you want a "big boy" solution, you can always just appeal to [scikit-learn's OneHotEncoder](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.OneHotEncoder.html), but the methods are even simpler. The first one operators on a dataframe as a whole, the second one operates on a specific column if that's all you care about.



<div class="reduced-code width-36" markdown=1>

```python
def one_hot_df(df):
    return pd.get_dummies(df)

def one_hot_col(df, col):
    return df[col].str.get_dummies()
```

</div>




Where we can see the difference between the two is how the column name is preserved using the generic version of `get_dummies`.



<div class="reduced-code width-51" markdown=1>

```python
display(one_hot_df(df), one_hot_col(df, "FavFood"))
```

</div>



<div>

<table class="table-auto table dataframe">
  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>FavFood_Cake</th>
      <th>FavFood_Happiness</th>
      <th>FavFood_Pizza</th>
      <th>FavFood_Vegetables</th>
    </tr>
    <tr>
      <th>Person</th>
      <th></th>
      <th></th>
      <th></th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>Sam</th>
      <td>0</td>
      <td>0</td>
      <td>1</td>
      <td>0</td>
    </tr>
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
  </tbody>
</table>
</div>



<div>

<table class="table-auto table dataframe">
  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>Cake</th>
      <th>Happiness</th>
      <th>Pizza</th>
      <th>Vegetables</th>
    </tr>
    <tr>
      <th>Person</th>
      <th></th>
      <th></th>
      <th></th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>Sam</th>
      <td>0</td>
      <td>0</td>
      <td>1</td>
      <td>0</td>
    </tr>
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
  </tbody>
</table>
</div>


Amazing and super simple!

## Unnecessary complications

But I've also seen survey results where there are multi-choice options, and the results have come back as lists. Like this:



<div class=" width-66" markdown=1>

```python
df2 = pd.DataFrame({
    "Person": ["Sam", "Ali", "Jane", "John"], 
    "Nationality": ["Australia", "Australia", "USA", "USA/German"]
}).set_index("Person")
display(df2)
```

</div>



<div>

<table class="table-auto table dataframe">
  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>Nationality</th>
    </tr>
    <tr>
      <th>Person</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>Sam</th>
      <td>Australia</td>
    </tr>
    <tr>
      <th>Ali</th>
      <td>Australia</td>
    </tr>
    <tr>
      <th>Jane</th>
      <td>USA</td>
    </tr>
    <tr>
      <th>John</th>
      <td>USA/German</td>
    </tr>
  </tbody>
</table>
</div>


So now the question is "What is the simplest way we can hot encode this data?" And the answer is to change *nothing*! `get_dummies` already accepts a separator input!



<div class="reduced-code width-43" markdown=1>

```python
def hot_encode_col(df, col, sep="/"):
    return df[col].str.get_dummies(sep=sep)

display(hot_encode_col(df2, "Nationality"))
```

</div>



<div>

<table class="table-auto table dataframe">
  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>Australia</th>
      <th>German</th>
      <th>USA</th>
    </tr>
    <tr>
      <th>Person</th>
      <th></th>
      <th></th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>Sam</th>
      <td>1</td>
      <td>0</td>
      <td>0</td>
    </tr>
    <tr>
      <th>Ali</th>
      <td>1</td>
      <td>0</td>
      <td>0</td>
    </tr>
    <tr>
      <th>Jane</th>
      <td>0</td>
      <td>0</td>
      <td>1</td>
    </tr>
    <tr>
      <th>John</th>
      <td>0</td>
      <td>1</td>
      <td>1</td>
    </tr>
  </tbody>
</table>
</div>


Very, very simple. And if for some reason, `get_dummies` is not behaving nicely, or you really want those multi-level indexes, you can do it manually using melt and pivot:



<div class=" width-61" markdown=1>

```python
def one_hot_melt_pivot(df):
    names = df.index.names
    melted = df.reset_index().melt(id_vars=names)
    return melted.pivot_table(index=names, 
                              columns=["variable", "value"], 
                              aggfunc=len, 
                              fill_value=0)

display(one_hot_melt_pivot(df))
```

</div>



<div>

<table class="table-auto table dataframe">
  <thead>
    <tr>
      <th>variable</th>
      <th colspan="4" halign="left">FavFood</th>
    </tr>
    <tr>
      <th>value</th>
      <th>Cake</th>
      <th>Happiness</th>
      <th>Pizza</th>
      <th>Vegetables</th>
    </tr>
    <tr>
      <th>Person</th>
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


******

For your convenience, here's the code in one block:

```python
import pandas as pd

df = pd.DataFrame({
    "Person": ["Sam", "Ali", "Jane", "John"], 
    "FavFood": ["Pizza", "Vegetables", "Cake", "Happiness"]
}).set_index("Person")

display(df)
def one_hot_df(df):
    return pd.get_dummies(df)

def one_hot_col(df, col):
    return df[col].str.get_dummies()
display(one_hot_df(df), one_hot_col(df, "FavFood"))
df2 = pd.DataFrame({
    "Person": ["Sam", "Ali", "Jane", "John"], 
    "Nationality": ["Australia", "Australia", "USA", "USA/German"]
}).set_index("Person")
display(df2)
def hot_encode_col(df, col, sep="/"):
    return df[col].str.get_dummies(sep=sep)

display(hot_encode_col(df2, "Nationality"))
def one_hot_melt_pivot(df):
    names = df.index.names
    melted = df.reset_index().melt(id_vars=names)
    return melted.pivot_table(index=names, 
                              columns=["variable", "value"], 
                              aggfunc=len, 
                              fill_value=0)

display(one_hot_melt_pivot(df))
```