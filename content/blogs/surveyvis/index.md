---
layout: post
title:  "Survey Visualiser"
description: "Visualising the thousands of galaxies in modern surveys."
date: 2016-09-04
categories: [blog]
tags: [python,project]

aliases: [/blog/surveyvis]
---

I was making a poster for the CAASTRO annual retreat on [my BAO work](/project/2015/10/20/bao.html),
and realised what it really needed was a nice comparison of the 
WiggleZ survey compared to other more local surveys, to highlight
the redshift depth of WiggleZ in comparison to other surveys of the same period, 
such as 2dF.

And because I am a stubborn fool, I decided to extend what I did to the general case.
And then I thought, if I've done this, other people might be able to use it, so best
[put it on GitHub](https://github.com/Samreay/SurveyVisualiser). Then
I loaded in tons of data sets. And then I asked around to see if
anyone else wanted figures, and soon was making figures for 
OzDES, 6dF, [2dFLenS](http://2dflens.swin.edu.au/) and TAIPAN.

Here's the figure I ended up creating with all datasets:

![](all.jpg?class="img-reduced")
![](wigglez.jpg?class="img-reduced")
![](sdss.jpg?class="img-reduced")
![](6df.jpg?class="img-reduced")
![](2df.jpg?class="img-reduced")

Each point on the plot is a galaxy. Blue is WiggleZ, yellow is
6dFGRS, red is 2dFGRS, purple is SDSS, green is GAMA and the 
thin gold bands are OzDES.

By far the most time was spent on getting the blending to happen nicely. Unfortunately, `matplotlib` 
has nothing equivalent to additive blending like you can find in Adobe AfterEffects, and so rendering
multiple colours on top of each other does very little. I talk about the method used to fake
additive blending in a [separate blog post](/blog/2016/10/01/additive.html), complete with a small example.

Then, because I felt like that didn't quite have the impact I wanted,
I decided to make everything spin. I know that `matplotlib` now has an animation class
that I could use to get video output, however the quality and more importantly, filesize, of the output
render is completely outclassed by `ffmpeg`, such that the OzDES supernova video shown at the bottom of the page
is only 2MB in size!

Twenty hours of work later, and here we are. Best to watch it on repeat,
if that's even possible. The top video is a comparison of all galaxy surveys I have, and the 
bottom video is an extension to my original work created by myself and an undergraduate student, Hugh McDougall. 
You can clearly see the three separate observing seasons in DES, and the bursts of light are the roughly thousand
supernovae DES has detected in those three years.



{% include youtube.html url="https://www.youtube.com/embed/Zmy-ycEHY8k)

{% include youtube.html url="https://www.youtube.com/embed/gFRNffGapls)
