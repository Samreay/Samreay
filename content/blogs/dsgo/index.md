---
layout: post
title:  "Datascience Pipelines"
description: "For the DSGo 2020 Virtual Conference I put together a workshop on datascience pipelines. Check it out."
date: 2020-06-20
categories: [blog]
tags: [python,outreach]

---

Due to COVID-19 lots of conferences have moved online in 2020. DatascienceGo is one of those conferences, and I was invited to 
give a workshop on datascience pipelines. This invite comes off the back of some discussions and media about my role in the 
COVID-19 Critical Care Consortium and creating their data processing pipeline, which has been a challenging project.

For the workshop, I thought it best to try and generalise the content slightly, and instead of talking about
all the different things you can do to data and the headaches we've had to deal with, to instead talk about machine 
learning and how you can add tracking and logging to your processes super simply using the amazing mlflow library.

On top of that, because the DAG support for multi-step workflows is not yet released in mlflow, the final 
section is about how to use Apache Airflow to do the same thing.

Unfortunately, shortly before the conference, I was scheduled down for some surgery. Throat surgery. So talking wasn't going
to work fine, but luckily the amazing [Favio Vazquez](https://www.linkedin.com/in/faviovazquez/) was available to lead and present
the content, which we did absolutely fantastically whilst I lurked in the conference chat answering questions as they came in.

You can check out the [Github repo here](https://github.com/Samreay/DSGoPipeline) which has a fairly solid readme to reproduce 
the entire workshop.

If you want an introduction to what we talked about and did, check out the presentation below!

**I'll link the recording here once I have it.**

{% include presentation.html url="https://docs.google.com/presentation/d/e/2PACX-1vQL0qL0w6AjIqFSRaB4hdtjWtQoGkCQmXlredflXQQbjnQ8wC_muMxg6lG9TebM0Apv31sinoCBkaXr/embed?start=false&loop=false&delayms=60000)
