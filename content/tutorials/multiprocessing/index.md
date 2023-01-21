---
title: "Simple Multiprocessing in Python"
description: "Comparing inbuilt solutions to a range of external libraries."
date: 2021-05-15
categories: [tutorial]
tags: [snippet]
aliases: ["/multiprocessing"]
---


In this short writeup I'll give examples of various multiprocessing libraries, how to use them with minimal setup, and what their strengths are.

If you want a TL;DR - I recommend trying out `loky` for single machine tasks, check out Ray for larger tasks.



<div class="reduced-code width-46" markdown=1>

```python
# Loky, great for single machine parallelism 
from loky import get_reusable_executor
executor = get_reusable_executor()
results = list(executor.map(fn, jobs))

# Ray, great for distributing over machines
import ray
ray.init()
workfn = ray.remote(fn)
results = [workfn.remote(job) for job in jobs]
ray.get(results)
ray.shutdown();
```

</div>




# CPU bound tasks

Most of the jobs we (I) want to execute are CPU bound. All I'm doing is crunching some numbers, retraining models, over and over, and I want to spend the least amount of time twiddling my thumbs.

So let's simulate a common task, which is evaluating some arbitrarily slow function over and over again. Here I create a function which takes some array of parameters as input, and produces a single number as output. And then I create 512 different vectors in parameter space, and want to evaluate the function of each of the 512 sets of parameters.



<div class=" width-65" markdown=1>

```python
import numpy as np

def slow_fn(args):
    """ Simulated an optimisation problem with args coming in
    and function value being output """
    n = 10000
    y = 0
    for j in range(n):
        j = j / n
        for i, p in enumerate(args):
            y += j * (p ** (i + 1))
    return y / n

def get_jobs(num_jobs=512, num_args=5):
    """ Simulated sampling our parameter space multiple times """
    return [j for j in np.random.random((num_jobs, num_args))]

jobs = get_jobs()

# Check out this single core performance
for job in jobs:
    slow_fn(job)
```

</div>


On my struggling laptop, these 512 jobs took `20.30s` to complete when running the functions in serial.

## Pythons Concurrent.Futures

It's best to start with some of the provided options in the standard library.



<div class=" width-62" markdown=1>

```python
from concurrent.futures import ProcessPoolExecutor
with ProcessPoolExecutor(max_workers=4) as executor:
    results = list(executor.map(slow_fn, jobs, chunksize=16));
```

</div>


With four workers and a chunksize of 16, this took me `6.47s`. If we disable chunking (which is a bad idea for small functions like this when you have a lot of them), it takes `6.57s`. Not much of a difference, but then again, 512 jobs isn't a particularly large number. Like effectively all of the multiprocessing options provided in the standard library, this method relies on process forking and **will not work inside a Jupyter notebook,** instead you'll need to throw the code into a python file and run it the good old `python yourfile.py` way.



## Loky

[Loky](https://github.com/joblib/loky) (from the smart cookies at joblib) is a suped up version of the Executor pool above that features reusable executors and code serialisation.



<div class="reduced-code width-58" markdown=1>

```python
from loky import get_reusable_executor
executor = get_reusable_executor(max_workers=4)
results = list(executor.map(slow_fn, jobs, chunksize=16));
```

</div>


This ran in `6.31s` on my machine, the fastest yet. 

Loky has the benefit of distributing work by pickling the code you are trying to run and the arguments (using `cloudpickle`). This means it is much more flexible, and this method **will** run inside a Jupter notebook. Hell, it should run just about anywhere. 

The benefit you get from this freedom might start to be outweighed by the fact you are adding overhead (serialising the code) to your workload, but often this can be kept to a bare minimum. And in our case, the overhead of pickling the code was less than the overhead of the process setup used by the inbuilt `concurrent.futures` module, so we ran things faster.

Cloudpickle will not serialise code outside of the local module, so if you want to lower the pickling overhead, just extract the function to another file (and if you're shipping the code off to an external machine, make sure it has said file too).

To try and make sure this point is clear, the function `slow_fn` is defined within this file. Cloudpickle will turn all its code into bytes. If I move the function into `foo.py`, cloudpickle would only save out "Call `foo.slow_fn`" instead of the code itself. Reduce overheads, but add requirements for code to be in the right place. This overhead should be minimial unless you have a truly mammoth single function you're exporting. Still, your choice!





## MPI4PY

[MPI](https://en.wikipedia.org/wiki/Message_Passing_Interface) (Mesasge Parsing Interface) is a super handy way of spreading computational load not just around on one CPU, but across multiple CPU. [mpi4py](https://mpi4py.readthedocs.io/en/stable/) is a python implementation making our lives easier. It is used commonly in super computers, where you use systems like PBS, SGE, Torque, or Slurm to request many CPUs that might be located on completely different nodes. If you are only looking at once CPU and have no plans to move off it, there are simpler methods than MPI. If you did want to use MPI, you would do something like this:



<div class=" width-62" markdown=1>

```python
from mpi4py.futures import MPIPoolExecutor
with MPIPoolExecutor() as executor:
    results = list(executor.map(slow_fn, jobs, chunksize=16));
```

</div>


And you would execute the code not using `python yourfile.py`, but instead use `mpirun` or `mpiexec` and tell it how many cores you have. Like so:


<div class="expanded-code width-396" markdown=1>

```mpiexec -n 8 python =-m mpi4py.futures yourfile.py```

I've used MPI to distribute parallel processing loads which require minimal cross-talk. To go back to my astrophysics days, if you have 10k images of the night sky and need to process all of them, this is a great way of easily shipping the processing off to whatever CPU you can get your hands on in the supercomputers you have access to.

Just keep in mind - the message parsing part is the expensive part. Minimise the network overhead to maximise your processing speed. For local CPU tasks, this will give you the same speed as `concurrent.futures`.

## Ray

Want to go a lot fancier and start bringing in some big guns? [Ray](https://docs.ray.io/en/master/index.html) is also great for distributing your tasks over more than one CPU, and the setup for it is also very minimal. That being said, don't think Ray is a simple piece of code, there is a LOT in it, and it can do a lot of things (dashboards, autoscaling, model serving, and a whole bunch more).


```python

</div>

import ray
ray.init()

workfn = ray.remote(slow_fn)
results = [workfn.remote(job) for job in jobs]
ray.get(results)

ray.shutdown();

<div class="expanded-code width-589" markdown=1>

```

Because this is also shipping your code elsewhere, it should run no issues in a Jupyter Notebook. Not that you'd normally want to do that, generally you'd put the ray server on a compute node somewhere, and then just connect to it, farming your jobs out. 

Anyway, the principle is straightforward. I set up a server, tell it that a specific function should be executed remotely (which in this case, is still my machine, but using all my cores now), and then send it off.

All up, this took `16s` to run, but of those, `4.89s` was on actual computation, and the other `12s` was setting up and shutting down the server.

Pretty impressive. Add onto that the fact that Ray has a ton of integrations (including some great [`HyperOptSearch`](https://docs.ray.io/en/latest/tune/api_docs/suggestion.html)) and I'm a fan.


## Dask

If you liked the sound of Ray, you'll probably like the sound of [`Dask`](https://dask.org/). Similar principle with workers and a controlling node. More focus on numerical computation, and it sits behind a lot of other distributed software (like `Prefect` as a single example). Note that if you're on windows, this may give you some issues, and for me [versioning mismatches in the conda release](https://github.com/dask/community/issues/150) made this a painful install, but hopefully this was just me getting unlucky with updating to a bugged version, and it doesn't affect anyone else.

Once you have it installed, the rest is easy. Again, super basic usage only - making `Client()` set up a local client in the background isn't something you'd productionise!


```python

</div>

from dask.distributed import Client
client = Client()
# Send off jobs
futures = client.map(slow_fn, jobs)
# Get their outputs
results = client.gather(futures)

<div class="expanded-code width-343" markdown=1>

```

All up this took `7.4s`, with `5.8s` spent on compute and the rest launching the local cluster in the background.

## p_tqdm (aka Pathos + tqdm)

[tqdm](https://github.com/tqdm/tqdm) is not an acronym, but it is a progress bar. [Pathos](https://pathos.readthedocs.io/en/latest/pathos.html) is a framework for heterogeneous computing. [p_tqdm](https://github.com/swansonk14/p_tqdm) is a library where @swansonk14 has stuck them both together. So think more a competitor to Ray than to Loky.


```python

</div>

from p_tqdm import p_map
results = p_map(slow_fn, jobs);

<div class="expanded-code width-397" markdown=1>

```

    100%|██████████| 512/512 [00:05<00:00, 96.89it/s] 
    

I was surprised this ran faster than both `concurrent.futures` and `loky`, it came in at only `5.38s`. And you even get a progress bar so that you know things are still running and progressing smoothly. Obviously in my case, I don't really need it, but if you have a job which will take 10 hours to run, it would be great to know that its slowly chewing through the tasks and not actually hanging.

And as you saw, its ridiculously easy to set up. If you want to see the other things you can do `map` (blocking) vs `imap` (non-blocking) vs `amap` (async) then jump into their documentation linked above.

If you don't care at all about the progress bar, to get stock pathos multiprocessing working, this will work:


```python

</div>

from pathos.multiprocessing import ProcessPool
pool = ProcessPool()
results = pool.map(slow_fn, jobs, chunksize=16);

<div class="expanded-code width-267" markdown=1>

```

# Memory Blocking

A common issue with attempts at multiprocessing on a single physical CPU is that there are many things which can bottleneck CPU execution. On many machines, memory management is done at the kernel level, which means that any `malloc` calls cannot be done in parallel.

First, consider our original `slow_fn` - it took 20 seconds to run in serial, and around 5s to run over 4 cores. This is the ideal result.

Now consider a vectorised version of our `slow_fn`, like so:


```python

</div>

def slow_fn_malloc(args):
    n = 100000
    x = np.linspace(0, 1, n)
    y = np.zeros(n)
    for i, p in enumerate(args):
        y += x * (p ** (i + 1))
    return y.sum() / n

for job in jobs:
    slow_fn_malloc(job)

<div class="expanded-code width-177" markdown=1>

```

Now, by all accounts, this function is *better*.  Running this took `58ms`.  From 20 seconds down to a twentieth of a second... Vectorisation is great.

Let me increase the number of jobs, now that we're burning through jobs so quickly. Oh, I'll also make `n` ten times larger, to increase the numerical precision of our function.


```python

</div>

def get_many_jobs(num_jobs=4096, num_args=5):
    return [j for j in np.random.random((num_jobs, num_args))]

many_jobs = get_many_jobs()

<div class="reduced-code width-22" markdown=1>

```

And timing it we have:


```python

</div>

%%time
for job in many_jobs:
    slow_fn_malloc(job)

<div class="expanded-code width-264" markdown=1>

```

    Wall time: 3.56 s
    

So with even more jobs, and an increase in `n`, this now takes `3.56s` to take. Still, very impressive considering this is all on one core now. So what happens if we try to ship it out to multiple cores? Any of the above libraries would work, I'll just use `loky`:


```python

</div>

%%time
executor = get_reusable_executor(max_workers=4)
results = list(executor.map(slow_fn_malloc, many_jobs, chunksize=16));



```

    Wall time: 3.54 s
    

Wait, `3.54s`... it didn't improve at all!

The reason is fairly simple. In `slow_fn_malloc` the time is being taken creating the arrays, not adding them up. And because creating the arrays requires assigning memory, and thus on many operating systems (like macOS, Windows, and non-compute linux distros) is not parallelised, it doesn't matter how many CPU cores you have, you're just going to be waiting on memory.

Just thought I'd bring that up, in case you're trying to debug why your execution time isn't scaling like how you want - network, disc, and memory are the three most common bottlenecks that get in the way.

Anyway, hope this short example on how to use a bunch of different multiprocessing libraries is useful!

******

For your convenience, here's the code in one block:

```python
# Loky, great for single machine parallelism 
from loky import get_reusable_executor
executor = get_reusable_executor()
results = list(executor.map(fn, jobs))

# Ray, great for distributing over machines
import ray
ray.init()
workfn = ray.remote(fn)
results = [workfn.remote(job) for job in jobs]
ray.get(results)
ray.shutdown();
import numpy as np

def slow_fn(args):
    """ Simulated an optimisation problem with args coming in
    and function value being output """
    n = 10000
    y = 0
    for j in range(n):
        j = j / n
        for i, p in enumerate(args):
            y += j * (p ** (i + 1))
    return y / n

def get_jobs(num_jobs=512, num_args=5):
    """ Simulated sampling our parameter space multiple times """
    return [j for j in np.random.random((num_jobs, num_args))]

jobs = get_jobs()

# Check out this single core performance
for job in jobs:
    slow_fn(job)
from concurrent.futures import ProcessPoolExecutor
with ProcessPoolExecutor(max_workers=4) as executor:
    results = list(executor.map(slow_fn, jobs, chunksize=16));
from loky import get_reusable_executor
executor = get_reusable_executor(max_workers=4)
results = list(executor.map(slow_fn, jobs, chunksize=16));
from mpi4py.futures import MPIPoolExecutor
with MPIPoolExecutor() as executor:
    results = list(executor.map(slow_fn, jobs, chunksize=16));

</div>

import ray
ray.init()

workfn = ray.remote(slow_fn)
results = [workfn.remote(job) for job in jobs]
ray.get(results)

ray.shutdown();

<div class="expanded-code width-589" markdown=1>


</div>

from dask.distributed import Client
client = Client()
# Send off jobs
futures = client.map(slow_fn, jobs)
# Get their outputs
results = client.gather(futures)

<div class="expanded-code width-343" markdown=1>


</div>

from p_tqdm import p_map
results = p_map(slow_fn, jobs);

<div class="expanded-code width-397" markdown=1>


</div>

from pathos.multiprocessing import ProcessPool
pool = ProcessPool()
results = pool.map(slow_fn, jobs, chunksize=16);

<div class="expanded-code width-267" markdown=1>


</div>

def slow_fn_malloc(args):
    n = 100000
    x = np.linspace(0, 1, n)
    y = np.zeros(n)
    for i, p in enumerate(args):
        y += x * (p ** (i + 1))
    return y.sum() / n

for job in jobs:
    slow_fn_malloc(job)

<div class="expanded-code width-177" markdown=1>


</div>

def get_many_jobs(num_jobs=4096, num_args=5):
    return [j for j in np.random.random((num_jobs, num_args))]

many_jobs = get_many_jobs()

<div class="reduced-code width-22" markdown=1>


</div>

%%time
for job in many_jobs:
    slow_fn_malloc(job)

<div class="expanded-code width-264" markdown=1>


</div>

%%time
executor = get_reusable_executor(max_workers=4)
results = list(executor.map(slow_fn_malloc, many_jobs, chunksize=16));



```