---
title:  "Handy Python Decorators"
description: "A short example on how to use decorators in your code to provide extra functionality"
date: 2020-06-20
categories: [tutorial]
tags: [snippet]
aliases: ["/decorators"]
math: true
---

Decorators are something that are criminally underused in the analysis codes I have seen in academia. So, give me a few seconds to try and espouse their virtues. First, if you are new to decorators, how they work is simple: they are a function that returns a function which has wrapped another function. Simple!

It's easier to explain in code.



<div class="reduced-code width-49" markdown=1>

```python
def decorator(fn):
    def wrapper(*args, **kwargs):
        print("Look, I've added something here!")
        return fn(*args, **kwargs)
    return wrapper

@decorator
def add(a, b):
    return a + b

add(1, 2)
```

</div>


    Look, I've added something here!
    




    3



So you can see what is happening here is that by decoratoring the `add` function, when we now call `add`, we actually hit the `wrapper` function, which prints a statement, and *then* it hits the original `add` function. So the `@` syntax is the same for just a reassignment



<div class="reduced-code width-22" markdown=1>

```python
# Does the same thing:
def add(a, b):
    return a + b
add = decorator(add)
add(1, 2)
```

</div>


    Look, I've added something here!
    




    3



So this allows us to do a bunch of things. We could use it for logging. For timing functions. For trying to detect or sanitise input. For caching results (see `lru_cache` for an implementation of this that is part of the base python libraries). For a ton of things. So what you *could* have in your code base, is a collection of decorators that you can throw on and off your functions when you need them. Things not running smoothly, put a `@debug`. Want to time the function, add a `@timer`. Want to make sure a function is only run once, add `@run_once`. Examples of all of this are below.

First, lets set up logging. I add the reload because if you run this in a notebook it will already have done the basic config for you, and you wont see any logging unless you reload and re-configure it.



<div class="expanded-code width-109" markdown=1>

```python
import logging
import importlib
importlib.reload(logging)

logging.basicConfig(format='%(asctime)s %(levelname)s: %(message)s', level=logging.DEBUG, datefmt='%I:%M:%S')
```

</div>


Alright, so here is a useful debug decorator:



<div class="reduced-code width-48" markdown=1>

```python
def debug(fn):
    def wrapper(*args, **kwargs):
        logging.debug(f"Invoking {fn.__name__}")
        logging.debug(f"  args: {args}")
        logging.debug(f"  kwargs: {kwargs}")
        result = fn(*args, **kwargs)
        logging.debug(f"  returned {result}")
        return result
    return wrapper
    
@debug
def add(a, b):
    return a + b
```

</div>




And now in my code, when something looks... funky... I can just throw a quick `@debug` on the most suspicious function and ensure that it is functioning properly.



<div class="reduced-code width-9" markdown=1>

```python
add(1, 2)
```

</div>


    10:03:37 DEBUG: Invoking add
    10:03:37 DEBUG:   args: (1, 2)
    10:03:37 DEBUG:   kwargs: {}
    10:03:37 DEBUG:   returned 3
    




    3



Now lets get a function to figure out how long execution takes!



<div class="reduced-code width-51" markdown=1>

```python
import time

def timer(fn):
    def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        result = fn(*args, **kwargs)
        end_time = time.perf_counter()
        duration = (end_time - start_time) * 1000
        logging.debug(f"  Took {duration:0.4f} ms")
        return result
    return wrapper

@timer
def add(a, b):
    return a + b

add(3, 4)
```

</div>


    10:03:37 DEBUG:   Took 0.0008 ms
    




    7



And note we can combine decorators! Want to debug **and** time the function?



<div class="reduced-code width-16" markdown=1>

```python
@debug
@timer
def add(a, b):
    return a + b

add(5, 6)
```

</div>


    10:03:37 DEBUG: Invoking wrapper
    10:03:37 DEBUG:   args: (5, 6)
    10:03:37 DEBUG:   kwargs: {}
    10:03:37 DEBUG:   Took 0.0008 ms
    10:03:37 DEBUG:   returned 11
    




    11



Note the importance of the order. Debug goes first, so its wrapper executes first, then timers wrapper, then the original function. If you swap the order, you'll note the time now goes up to multiple miliseconds because `@timer` is now also timing the logging!

Finally as another handy decorator, what if we want to ensure a function is only run once?



<div class="reduced-code width-38" markdown=1>

```python
def run_once(fn):
    def wrapper(*args, **kwargs):
        if not wrapper.has_run:
            wrapper.has_run = True
            return fn(*args, **kwargs)
        else:
            print("NO! NOT ALLOWED!")
    wrapper.has_run = False
    return wrapper

@run_once
def add(a, b):
    return a + b

print(add(6, 7))
print(add(7, 8))
```

</div>


    13
    NO! NOT ALLOWED!
    None
    

In python functions are objects too, so we can attack attributes to them, like `has_run`, and then check the attribute status when executing. In the output, you can see the first `add` works fine, but then the second time we try we get a mean print message and a result of `None`. You could make this an exception if you want, I just need it to be able to execute for the write up!

Anyway, I hope this has given you some useful ideas. Having a `decorators` utility file to throw around can add value to any project you have!

******

For your convenience, here's the code in one block:

```python
def decorator(fn):
    def wrapper(*args, **kwargs):
        print("Look, I've added something here!")
        return fn(*args, **kwargs)
    return wrapper

@decorator
def add(a, b):
    return a + b

add(1, 2)
# Does the same thing:
def add(a, b):
    return a + b
add = decorator(add)
add(1, 2)
import logging
import importlib
importlib.reload(logging)

logging.basicConfig(format='%(asctime)s %(levelname)s: %(message)s', level=logging.DEBUG, datefmt='%I:%M:%S')
def debug(fn):
    def wrapper(*args, **kwargs):
        logging.debug(f"Invoking {fn.__name__}")
        logging.debug(f"  args: {args}")
        logging.debug(f"  kwargs: {kwargs}")
        result = fn(*args, **kwargs)
        logging.debug(f"  returned {result}")
        return result
    return wrapper
    
@debug
def add(a, b):
    return a + b
add(1, 2)
import time

def timer(fn):
    def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        result = fn(*args, **kwargs)
        end_time = time.perf_counter()
        duration = (end_time - start_time) * 1000
        logging.debug(f"  Took {duration:0.4f} ms")
        return result
    return wrapper

@timer
def add(a, b):
    return a + b

add(3, 4)
@debug
@timer
def add(a, b):
    return a + b

add(5, 6)
def run_once(fn):
    def wrapper(*args, **kwargs):
        if not wrapper.has_run:
            wrapper.has_run = True
            return fn(*args, **kwargs)
        else:
            print("NO! NOT ALLOWED!")
    wrapper.has_run = False
    return wrapper

@run_once
def add(a, b):
    return a + b

print(add(6, 7))
print(add(7, 8))
```