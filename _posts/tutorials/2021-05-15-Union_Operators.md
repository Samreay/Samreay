---
layout: post
title:  "Merging dictionaries Python 3.9's Union Operator"
short_title: "Merging dicts with the union operator"
desc: "Python 3.9 introduced a new operator to streamline unions."
long_desc: "Python 3.9 introduced the new union operator, to allow for simpler and more obvious syntax for merging dictionary content."
date: 2021-05-15
categories: [tutorial]
tags: [snippet]
loc: 'tutorials/union_operators/'
permalink: tutorials/union_operators 
redirect_from: "/union"

---

Merging two python dictionaries is a [very](https://stackoverflow.com/questions/2799064/how-do-i-merge-dictionaries-together-in-python) [common](https://stackoverflow.com/questions/1781571/how-to-concatenate-two-dictionaries-to-create-a-new-one-in-python) [question](https://stackoverflow.com/questions/9415785/merging-several-python-dictionaries) on StackOverflow. [Some](https://stackoverflow.com/questions/38987/how-do-i-merge-two-dictionaries-in-a-single-expression-taking-union-of-dictiona) of the better responses have been updated for later versions of Python, but I've seen this crop up a few times now to write it up here.

In **Python 3.9+**, merging two dictionaries is now staggeringly easy.

{% include image.html url="union.png" class="img-carbon" %}

Notice that the order of preference is right to left. So values from `y` will override values from `x`. Some may think this is a bit unintuitive - the `|` operator is tradionally used to represent bitwise `or`, and generally when we evaluate `or` expressions, we stop evaluation as soon as we get a `True`. Which, in our example, would mean to stop if the value is found in `x`. 

Do not think of the union operator as an `or` operator.

Start with `x`, and put `y` over the top.

## Prior Solutions

For completeness, if you don't have Python 3.9 yet (maybe because you're waiting for `tensorflow` support and docker images... please come soon), here are the other various ways of going about merging dictionaries.

```python
# Python 3.5+
z = {**x, **y}

# Python <3.5
z = x.copy()
z.update(y)
```

In terms of what **NOT** to do, *never* utilise the `dict` constructor when either merging or copying a dictionary.

```python
# Do not do this
z = dict(x, **y)
```

Here I have used `dict(x)` to essentially copy the dictionary, and added in the extra keys from `y`.

This works great, until you have *anything* but a string for a dictionary key.

```python
w = {"mixing": "types", 5: "danger"}
z = dict(x, **w)
```

    ---------------------------------------------------------------------------

    TypeError                                 Traceback (most recent call last)

    <ipython-input-7-7ebfe83d5cb9> in <module>
          1 w = {"mixing": "types", 5: "danger"}
    ----> 2 z = dict(x, **w)
    
    TypeError: keywords must be strings

Remember, dictionaries aren't tuples of keyword arguments, they are tuples of keys and values. The key's can be anything so long as it can be hashed.
{% include badge.html %}

Here's the full code for convenience:

```python

# New in Python 3.9

x = {"hello": "there", "general": "kenobi"}
y = {"general": "potato", "a": "b"}
z = x | y

# z = {'hello': 'there', 'general': 'potato', 'a': 'b'}

# Python 3.5+
z = {**x, **y}

# Python <3.5
z = x.copy()
z.update(y)

# Do not do this
z = dict(x, **y)

w = {"mixing": "types", 5: "danger"}
z = dict(x, **w)

```
