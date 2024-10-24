---
layout: post
title:  "Barry: BAO Model Comparison"
description: "A python framework for comparing BAO model implementations."
date: 2020-03-01
categories: [blog]
tags: [python,project]

aliases: [/blog/barry]
---

BAO models are a dime a dozen these days. With multiple theroetical frameworks to start from (standard perturbation theory,
Lagranian perturbation theory, effective field theory, etc), and with different models implemented to account
for different physical effects, the phase space of viable BAO models is huge.

And this poses a problem for those of us wanting to utilise BAO models. How do we effectively compare
them and their performance on a robust set of numerical simulations? 

To try and solve this problem, Cullan Howlett and I created Barry. The idea was fairly simple - we 
ingest a few datasets and create a few models to start with, and then people can customise the models and use the
framework to do model comparison on arbitrary datasets in an efficient way.

We've implemented four models so far, and here are their best fit cosmologies to the SDSS DR12 simulation data.

![](models.jpg?class="img-invert")

In fact, we have a thousand realisations of the simulation data, which allows us to fit each
model to each of the thousand realisations, and investigate the correlation in output values.

Models closer to each other (in code and in theory) will give higher correlation.


![](scatter.jpg?class="img-invert")

We also used Barry to investigate some of the claims put forward by new models. For example, Noda (2019) claimed
to have a new method called the "BAO Extractor", which looked promising, and claimed it gave a huge benefit - resulting
in uncertainties on model fits roughly only half that of previous models. IE, it was twice as good. So we recreated their
model, turned their assumptions on and off, and had a look at the resulting cosmological contours.


![](noda.jpg?class="img-invert img-reduced")

And it turns out that the performance gain isn't due to their extractor, its just to double counting the data by
freezing model parameters to initial best fit values.

On top of that, when we looked at the distribution of fitting values for our 1000 simulation realisations, we also
found that many previous models underestimated their uncertainty, and provide a way to inflate the reported uncertainty such that it agrees 
with the determined model scatter.


![](uncert.jpg?class="img-invert img-reduced")

Our hope is to take Barry and apply it onto DESI data, and do some amazing science with it!

