---
layout: post
title:  "ChainConsumer"
desc: "A library I wrote for better consumer chains and grids to get parameter summaries."
date: 2016-08-01
categories: [project]
tags: [blog]
icon: fa-bookmark-o
thumb: 'static/img/blog/chainconsumer/thumb.png'
---

I was working with some chains one day and wanted to plot different cosmologies
against each other, and realised that they had different parameters. Unfortunately,
this meant that the library I was using couldn't handle the task, so I wrote my own!

If you want to know more and see plenty of examples see the 
[**online documentation here**](https://samreay.github.io/ChainConsumer/).
 
The API is fairly straightforward I hope, with a simple example shown below.

``` python
import numpy as np
from numpy.random import normal, multivariate_normal
from chainconsumer import ChainConsumer


if __name__ == "__main__":
    np.random.seed(0)
    cov = normal(size=(3, 3))
    cov2 = normal(size=(4, 4))
    data = multivariate_normal(normal(size=3), 0.5 * (cov + cov.T), size=100000)
    data2 = multivariate_normal(normal(size=4), 0.5 * (cov2 + cov2.T), size=100000)

    c = ChainConsumer()
    c.add_chain(data, parameters=["$x$", "$y$", r"$\alpha$"])
    c.add_chain(data2, parameters=["$x$", "$y$", r"$\alpha$", r"$\gamma$"])
    fig = c.plot()
```

And the above code gives the following contour:

{% include image.html url="/chainconsumer/two.png"  %}

I've tried to build in a lot of plotting options to make customisation
easy:

{% include image.html url="/chainconsumer/mixed.png"  %}
