---
layout: post
title:  "DataFrame filtering with chaining"
short_title: "DataFrame filtering with chaining"
desc: "Extending fluent design to filtering."
long_desc: "Extending fluent design to filtering."
date: 2022-11-07
categories: [tutorial]
tags: [snippet]
loc: 'tutorials/filter_chaining/'
permalink: tutorials/filter_chaining 
redirect_from: "/filtering"
---

If you're like me, breaking a nice method chain to do filtering is **annoying**.

You might have a nice long list of operations, and then interupt it like so:

<div class=" reduced-code" markdown="1">
```python
df = (
    df_raw.set_index("A")
    .sort_index()
    .unstack()
    .groupby("B")
    .mean()
)
df = df[df["C"] == "some_value"]
df = df.join(df2).reset_index()
```
</div>

I'm a simple man, and I just want everything in a single chain! 

Yes, in the trivial example above, you could just move the indexor into the chain, but what if you need to filter based a value in the dataframe at that instant, not in the raw dataframe? Then you'll have issues.

So, how can we better do simple filtering with method chaining? I looked at a few options, so I thought it would be smart to document them.

<div class=" expanded-code" markdown="1">
```python
import pandas as pd

df = pd.read_csv("https://github.com/PacktPublishing/Pandas-Cookbook/raw/master/data/flights.csv")
df = df[["MONTH", "DAY", "WEEKDAY", "ORG_AIR", "DEST_AIR", "CANCELLED"]]
df.head(5)
```
</div>

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
<table class="table-auto">  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>MONTH</th>
      <th>DAY</th>
      <th>WEEKDAY</th>
      <th>ORG_AIR</th>
      <th>DEST_AIR</th>
      <th>CANCELLED</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>0</th>
      <td>1</td>
      <td>1</td>
      <td>4</td>
      <td>LAX</td>
      <td>SLC</td>
      <td>0</td>
    </tr>
    <tr>
      <th>1</th>
      <td>1</td>
      <td>1</td>
      <td>4</td>
      <td>DEN</td>
      <td>IAD</td>
      <td>0</td>
    </tr>
    <tr>
      <th>2</th>
      <td>1</td>
      <td>1</td>
      <td>4</td>
      <td>DFW</td>
      <td>VPS</td>
      <td>0</td>
    </tr>
    <tr>
      <th>3</th>
      <td>1</td>
      <td>1</td>
      <td>4</td>
      <td>DFW</td>
      <td>DCA</td>
      <td>0</td>
    </tr>
    <tr>
      <th>4</th>
      <td>1</td>
      <td>1</td>
      <td>4</td>
      <td>LAX</td>
      <td>MCI</td>
      <td>0</td>
    </tr>
  </tbody>
</table>
</div>

Our goal: get some fluent API design going to filter to flights into Los Angeles (and the absolutely awful airport that is LAX).

<div class=" reduced-code" markdown="1">
```python
# Normal method. Boo!
df[df["DEST_AIR"] == "LAX"].head(2)
```
</div>

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
<table class="table-auto">  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>MONTH</th>
      <th>ORG_AIR</th>
      <th>DEST_AIR</th>
      <th>CANCELLED</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>262</th>
      <td>1</td>
      <td>SFO</td>
      <td>LAX</td>
      <td>0</td>
    </tr>
    <tr>
      <th>703</th>
      <td>1</td>
      <td>SFO</td>
      <td>LAX</td>
      <td>0</td>
    </tr>
  </tbody>
</table>
</div>

So, stock standard answer is "use query"!

<div class=" reduced-code" markdown="1">
```python
df.query("DEST_AIR == 'LAX'").head(2)
```
</div>

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
<table class="table-auto">  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>MONTH</th>
      <th>ORG_AIR</th>
      <th>DEST_AIR</th>
      <th>CANCELLED</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>262</th>
      <td>1</td>
      <td>SFO</td>
      <td>LAX</td>
      <td>0</td>
    </tr>
    <tr>
      <th>703</th>
      <td>1</td>
      <td>SFO</td>
      <td>LAX</td>
      <td>0</td>
    </tr>
  </tbody>
</table>
</div>

I do not like `query`. In a world of mypy, type hints, and similar, hiding away data manipulation logic inside a string feels fundamentally wrong to me.

A better solution, is to pass a callable into `loc`:

<div class=" reduced-code" markdown="1">
```python
df.loc[lambda x: x["DEST_AIR"] == "LAX"].head(2)
```
</div>

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
<table class="table-auto">  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>MONTH</th>
      <th>DAY</th>
      <th>WEEKDAY</th>
      <th>ORG_AIR</th>
      <th>DEST_AIR</th>
      <th>CANCELLED</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>19</th>
      <td>1</td>
      <td>1</td>
      <td>4</td>
      <td>PHX</td>
      <td>LAX</td>
      <td>0</td>
    </tr>
    <tr>
      <th>22</th>
      <td>1</td>
      <td>1</td>
      <td>4</td>
      <td>LAS</td>
      <td>LAX</td>
      <td>0</td>
    </tr>
  </tbody>
</table>
</div>

So this is a little nicer. The lambda function means we can filter on the dataframe at that point in time, which is the critical thing.

Of course, if we didn't like the lambda functions, we could slap our own method onto the dataframe:

<div class=" reduced-code" markdown="1">
```python
select = lambda df, col, val: df[df[col] == val]
pd.DataFrame.select = select

df.select("DEST_AIR", "LAX").head(2)
```
</div>

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
<table class="table-auto">  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>MONTH</th>
      <th>DAY</th>
      <th>WEEKDAY</th>
      <th>ORG_AIR</th>
      <th>DEST_AIR</th>
      <th>CANCELLED</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>19</th>
      <td>1</td>
      <td>1</td>
      <td>4</td>
      <td>PHX</td>
      <td>LAX</td>
      <td>0</td>
    </tr>
    <tr>
      <th>22</th>
      <td>1</td>
      <td>1</td>
      <td>4</td>
      <td>LAS</td>
      <td>LAX</td>
      <td>0</td>
    </tr>
  </tbody>
</table>
</div>

Provided your filtering always takes this simple form, *and* provided you don't feel incredibly dirty patching your own method onto the `DataFrame` class, this is very chainable.

<div class="" markdown="1">
```python
df.select("DEST_AIR", "LAX").select("CANCELLED", 1).head(2)
```
</div>

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
<table class="table-auto">  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>MONTH</th>
      <th>DAY</th>
      <th>WEEKDAY</th>
      <th>ORG_AIR</th>
      <th>DEST_AIR</th>
      <th>CANCELLED</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>3069</th>
      <td>1</td>
      <td>20</td>
      <td>2</td>
      <td>SFO</td>
      <td>LAX</td>
      <td>1</td>
    </tr>
    <tr>
      <th>3164</th>
      <td>1</td>
      <td>20</td>
      <td>2</td>
      <td>SFO</td>
      <td>LAX</td>
      <td>1</td>
    </tr>
  </tbody>
</table>
</div>

Now, if you wanted the same function, but didn't want to patch the `DataFrame` class, consider:

<div class=" reduced-code" markdown="1">
```python
df.pipe(select, "DEST_AIR", "LAX").head(2)
```
</div>

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
<table class="table-auto">  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>MONTH</th>
      <th>DAY</th>
      <th>WEEKDAY</th>
      <th>ORG_AIR</th>
      <th>DEST_AIR</th>
      <th>CANCELLED</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>19</th>
      <td>1</td>
      <td>1</td>
      <td>4</td>
      <td>PHX</td>
      <td>LAX</td>
      <td>0</td>
    </tr>
    <tr>
      <th>22</th>
      <td>1</td>
      <td>1</td>
      <td>4</td>
      <td>LAS</td>
      <td>LAX</td>
      <td>0</td>
    </tr>
  </tbody>
</table>
</div>

Really I think that something like this method should be added into the base pandas library. Maybe I'll make a PR one day.

But for everything now in one place:

<div class="carbon-code " markdown="1">
```python
# Method chaining to filter your data!
import pandas as pd

# Download some data
repo = "https://github.com/PacktPublishing"
project = "Pandas-Cookbook/raw/master/data/flights.csv"
df_raw = pd.read_csv(f"{repo}/{project}")
df_raw = df_raw[["MONTH", "ORG_AIR", "DEST_AIR", "CANCELLED"]]

# Patch a custom method in
def select(df, col, val):
    return df[df[col] == val]
    
pd.DataFrame.select = select

# And then pick your favourite method!
df = (
    # You can use query
    df_raw.query("DEST_AIR == 'LAX'")
    # A custom patched method
    .select("MONTH", 1)
    # The same method via pipe
    .pipe(select, "ORG_AIR", "SFO")
    # Or pass a function to loc
    .loc[lambda x: x["CANCELLED"] == 0]
)
```
</div>

If you know of other useful ways of filtering, please let me know!
{% include badge.html %}

Here's the full code for convenience:

<div class="expanded-code" markdown="1">```python
import pandas as pd

df = (
    df_raw.set_index("A")
    .sort_index()
    .unstack()
    .groupby("B")
    .mean()
)
df = df[df["C"] == "some_value"]
df = df.join(df2).reset_index()


df = pd.read_csv("https://github.com/PacktPublishing/Pandas-Cookbook/raw/master/data/flights.csv")
df = df[["MONTH", "DAY", "WEEKDAY", "ORG_AIR", "DEST_AIR", "CANCELLED"]]
df.head(5)

# Normal method. Boo!
df[df["DEST_AIR"] == "LAX"].head(2)

df.query("DEST_AIR == 'LAX'").head(2)

df.loc[lambda x: x["DEST_AIR"] == "LAX"].head(2)

select = lambda df, col, val: df[df[col] == val]
pd.DataFrame.select = select

df.select("DEST_AIR", "LAX").head(2)

df.select("DEST_AIR", "LAX").select("CANCELLED", 1).head(2)

df.pipe(select, "DEST_AIR", "LAX").head(2)

# Method chaining to filter your data!

# Download some data
repo = "https://github.com/PacktPublishing"
project = "Pandas-Cookbook/raw/master/data/flights.csv"
df_raw = pd.read_csv(f"{repo}/{project}")
df_raw = df_raw[["MONTH", "ORG_AIR", "DEST_AIR", "CANCELLED"]]

# Patch a custom method in
def select(df, col, val):
    return df[df[col] == val]
    
pd.DataFrame.select = select

# And then pick your favourite method!
df = (
    # You can use query
    df_raw.query("DEST_AIR == 'LAX'")
    # A custom patched method
    .select("MONTH", 1)
    # The same method via pipe
    .pipe(select, "ORG_AIR", "SFO")
    # Or pass a function to loc
    .loc[lambda x: x["CANCELLED"] == 0]
)

```
</div>