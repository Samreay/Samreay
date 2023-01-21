---
title: "Merging dicts with the union operator"
description: "Python 3.9 introduced a new operator to streamline unions."
date: 2021-05-15
categories: [tutorial]
tags: [snippet]
aliases: ["/union"]
---


Merging two python dictionaries is a [very](https://stackoverflow.com/questions/2799064/how-do-i-merge-dictionaries-together-in-python) [common](https://stackoverflow.com/questions/1781571/how-to-concatenate-two-dictionaries-to-create-a-new-one-in-python) [question](https://stackoverflow.com/questions/9415785/merging-several-python-dictionaries) on StackOverflow. [Some](https://stackoverflow.com/questions/38987/how-do-i-merge-two-dictionaries-in-a-single-expression-taking-union-of-dictiona) of the better responses have been updated for later versions of Python, but I've seen this crop up a few times now to write it up here.

In **Python 3.9+**, merging two dictionaries is now staggeringly easy.



<div class="reduced-code width-55" markdown=1>

```python
# New in Python 3.9

x = {"hello": "there", "general": "kenobi"}
y = {"general": "potato", "a": "b"}
z = x | y

# z = {'hello': 'there', 'general': 'potato', 'a': 'b'}
```

</div>




Notice that the order of preference is right to left. So values from `y` will override values from `x`. Some may think this is a bit unintuitive - the `|` operator is tradionally used to represent bitwise `or`, and generally when we evaluate `or` expressions, we stop evaluation as soon as we get a `True`. Which, in our example, would mean to stop if the value is found in `x`. 

Do not think of the union operator as an `or` operator.

Start with `x`, and put `y` over the top.

## Prior Solutions

For completeness, if you don't have Python 3.9 yet (maybe because you're waiting for `tensorflow` support and docker images... please come soon), here are the other various ways of going about merging dictionaries.



<div class="reduced-code width-14" markdown=1>

```python
# Python 3.5+
z = {**x, **y}

# Python <3.5
z = x.copy()
z.update(y)
```

</div>


In terms of what **NOT** to do, *never* utilise the `dict` constructor when either merging or copying a dictionary.



<div class="reduced-code width-16" markdown=1>

```python
# Do not do this
z = dict(x, **y)
```

</div>


Here I have used `dict(x)` to essentially copy the dictionary, and added in the extra keys from `y`.

This works great, until you have *anything* but a string for a dictionary key.



<div class="reduced-code width-36" markdown=1>

```python
w = {"mixing": "types", 5: "danger"}
z = dict(x, **w)
```

</div>



    ---------------------------------------------------------------------------

    TypeError                                 Traceback (most recent call last)

    <ipython-input-7-7ebfe83d5cb9> in <module>
          1 w = {"mixing": "types", 5: "danger"}
    ----> 2 z = dict(x, **w)
    

    TypeError: keywords must be strings


Remember, dictionaries aren't tuples of keyword arguments, they are tuples of keys and values. The key's can be anything so long as it can be hashed.

******

For your convenience, here's the code in one block:

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