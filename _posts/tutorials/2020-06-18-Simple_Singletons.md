---
layout: post
title:  "One Line Python Singletons"
desc: "Goodbye boilerplate code, hello an elegant one line solution to get singletons in python"
date: 2020-06-18
categories: [tutorial]
tags: [snippet]
loc: 'tutorials/simple_singletons/'
permalink: tutorials/simple_singletons 
redirect_from: "/singletons"
math: true
---

Singletons are the idea that you want to get an instance of a class, but you *only ever want there to be a single instance of that class instantiated*. A nice example might be a configuration class, or a coordinator class that is used by various pieces of you code, and you want to make sure that they're all pointing to the same instance without having to pass the object around in eery invocation!

Let's create some dummy Singleton class (which isn't a singleton yet)

<div class=" reduced-code" markdown="1">
```python
class Singleton():
    def __init__(self):
        self.state = "I am alive!"
    def set_state(self, state):
        self.state = state
    def get_state(self):
        return self.state
```
</div>

Great, now obviously if we get a new instance in two different functions, they are going to be totally independent of each other

<div class=" reduced-code" markdown="1">
```python
def function_A():
    s = Singleton()
    s.set_state("I was asked for in function_A")
    return s

def function_B():
    s = Singleton()
    s.set_state("I was asked for in function_B")
    return s

s1 = function_A()
s2 = function_B()
print([s1.state, s2.state])
```
</div>

    ['I was asked for in function_A', 'I was asked for in function_B']
    
So you can see they are different. We could also check the ids, but you believe me. Now, one easy solution is to just make `s = Singleton()` happen globally, outside the function scope. But then we'd be breaking scope, and that is **bad**. Global variables should be avoided like the plague in structured code like this. So how can we request the same instance, without having global state?

<div class="carbon-code  reduced-code" markdown="1">
```python
from functools import lru_cache

@lru_cache(maxsize=1)
def singleton_factory():
    return Singleton()
```
</div>

Easy, we utilise the decorator `lru_cache`. Let's see it in action first.

<div class=" reduced-code" markdown="1">
```python
def function_C():
    s = singleton_factory()
    s.set_state("I was asked for in function_C")
    return s

def function_D():
    s = singleton_factory()
    s.set_state("I was asked for in function_D")
    return s

s3 = function_C()
s4 = function_D()
print([s3.state, s4.state])
```
</div>

    ['I was asked for in function_D', 'I was asked for in function_D']
    
And you can see that we get the state from function D out twice, because the functions were modifying the same (and only) instance of `Singleton`. So what `lru_cache(maxsize=1)` is doing is saying "I'm going to remember the last 1 time called this function with given inputs, and if they call the function the same way again, I'm not going to run it, I'm going to return the previous result, which I've got stored."

In this way, the first call to the function creates the class (so we are only computing when asked to, unlike a global variable which would always be created), and then all subsequent calls get the same instance.

To help better explain `lru_cache`, lets do a simple example with numbers:

<div class=" reduced-code" markdown="1">
```python
@lru_cache(maxsize=2)
def double(x):
    print(f"I am doubling {x}")
    return 2 * x

inputs = [1, 1, 2, 3, 1]
for i in inputs:
    print(double(i))
```
</div>

    I am doubling 1
    2
    2
    I am doubling 2
    4
    I am doubling 3
    6
    I am doubling 1
    2
    
The first time we say to double, `lru_cache` checks its (empty) dictionary mapping inputs to outputs, sees it doesn't have anything under an input of `x=1`, so it hits the function. The second time, there is no print statement, because `lru_cache` finds the previous run we just did and uses its stored result.

Then it goes to two, and `x=2` is a new input, so the function runs. Same for `x=3`. And then it gets back to `x=1`, but because we said `maxsize=2` (ie only remember the last two unique runs), it had cleared out the saved `x=1` run, and has to do it again. Of course, `maxsize=2` is a tiny number, and you can bump this up to some power of 2 that is more useful. One thing to take note of is that any function you want to cache like this has to have hashable inputs. So numbers, strings (primitives in general), however generic objects without hashes will not be able to be saved, and you'll see a warning. 

`lru_cache` is a great way of defining both singletons, and providing a cheap and easy way of speeding up your code if you are doing things over and over!
{% include badge.html %}

Here's the full code for convenience:

<div class="expanded-code" markdown="1">```python
from functools import lru_cache

class Singleton():
    def __init__(self):
        self.state = "I am alive!"
    def set_state(self, state):
        self.state = state
    def get_state(self):
        return self.state

def function_A():
    s = Singleton()
    s.set_state("I was asked for in function_A")
    return s

def function_B():
    s = Singleton()
    s.set_state("I was asked for in function_B")
    return s

s1 = function_A()
s2 = function_B()
print([s1.state, s2.state])


@lru_cache(maxsize=1)
def singleton_factory():
    return Singleton()

def function_C():
    s = singleton_factory()
    s.set_state("I was asked for in function_C")
    return s

def function_D():
    s = singleton_factory()
    s.set_state("I was asked for in function_D")
    return s

s3 = function_C()
s4 = function_D()
print([s3.state, s4.state])

@lru_cache(maxsize=2)
def double(x):
    print(f"I am doubling {x}")
    return 2 * x

inputs = [1, 1, 2, 3, 1]
for i in inputs:
    print(double(i))

```
</div>