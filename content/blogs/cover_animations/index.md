---
layout: post
title:  "Cover Animations"
description: "Comparing different services"
date: 2022-10-18
categories: [blog]
tags: [writing]

aliases: [/blog/cover_animations]
---

I've wanted to animate my book cover for a while, but unsure about the best way to go about it. Some websites claim to do it for you using AI, but you have to pay for access, and are they good? Others offer it as a service, but prices range from $10USD into the hundreds, so would an expensive animation be worth the investment? Is there any real difference in what you'd get?

To that last question, I still have no idea - I'm not going to drop several hundreds to find out. Instead, I went with a few cheaper artists.

## Morgan Wright

Highly recommended by several other authors, has done thousands of covers. Price point is 12 euros. Three more euros for rapid turnaround. [Website link](https://www.morganwrightbooks.com/book-cover-animations-service). The colour levels got a little crushed and contrast reduced, but I really appreciated the more energetic particle effect going here.

![](morgan.mp4?class="max-w-md")

## Embers25 from Fiverr

Approximately the same price, two day turnaround. [Fiverr link](https://www.fiverr.com/embers25/animate-your-fiction-book-cover).

![](embers25.mp4?class="max-w-md")

## Doing it myself

I noticed that both the MOV and mp4 that I got back from the two respective services were not suitable to put on a website, so I re-encoded them to H264 with ffmpeg. But given I was playing with ffmpeg, I thought "eh, let's see what happens if I do it all myself."

Using the motion leap app (free version, not pro), which limits the export resolution and how much I can do with it. 

![](soul_relic.mp4?class="max-w-md")

I provided everyone with the layers separated, so I used that here - only animating the magic and then adding it atop the static background 
with ffmpeg.

```bash
ffmpeg -i m.mp4 -i SoulRelic_5_LayerAllNoAeon.jpg -filter_complex "[1:v][0:v]scale2ref[ckout][vid];[vid]format=gbrp[vid];[vid][ckout] blend=all_mode=screen[x];[x]format=yuv420p[y];[y]scale=-1:550 [out]" -map "[out]" -y soul_relic_small.mp4
ffmpeg -i m.mp4 -i SoulRelic_5_LayerAllNoAeon.jpg -filter_complex "[1:v][0:v]scale2ref[ckout][vid];[vid]format=gbrp[vid];[vid][ckout] blend=all_mode=screen[x];[x]format=yuv420p [out]" -map "[out]" -y soul_relic.mp4
```

If you know any other useful apps or services which could add to this, let me know!