---
layout: post
title:  "Survey Visualiser"
desc: "A small python project to visualise cosmological surveys."
date: 2016-09-04
categories: [project]
tags: [matplotlib,python,visualisation,surveys]
icon: fa-bookmark-o
thumb: 'static/img/blog/surveyvis/thumb.jpg'
---

I was making a poster for the CAASTRO annual retreat on my BAO work,
and realised what it really needed was a nice comparison of the 
WiggleZ survey compared to other more local surveys, to highlight
the redshift depth of WiggleZ.

And because I am a stubborn fool, I wrote a python project. Then
I loaded in tons of data sets. And then I asked around to see if
anyone else wanted figures, and soon was making figures for 
OzDES, 6dF, 2dFLenS and TAIPAN.

Here's the figure I ended up creating with all datasets:

{% include carousel.html imgs="All|all.jpg;WiggleZ|wigglez.jpg;SDSS|sdss.jpg;6dF|6df.jpg;2dF|2df.jpg" folder="surveyvis" %}

Each point on the plot is a galaxy. Blue is WiggleZ, yellow is
6dFGRS, red is 2dFGRS, purple is SDSS, green is GAMA and the 
thin gold bands are OzDES.

Then, because I felt like that didn't quite have the impact I wanted,
I decided to make everything spin.

Twenty hours of work later, and here we are. Best to watch it on repeat,
if that's even possible.




{% include youtube.html url="https://www.youtube.com/embed/Zmy-ycEHY8k"  %}

