import numpy as np
from time import perf_counter


def slow_fn(args):
    n = 10000
    y = 0
    for j in range(n):
        j = j / n
        for i, p in enumerate(args):
            y += j * (p ** (i + 1))
    return y / n


def slow_fn_malloc(args):
    n = 10000
    x = np.linspace(0, 1, n)
    y = np.zeros(n)
    for i, p in enumerate(args):
        y += x * (p ** (i + 1))
    return y.sum() / n


def get_jobs(num_jobs=512, num_args=5):
    return [j for j in np.random.random((num_jobs, num_args))]


if __name__ == "__main__":
    start = perf_counter()
    for job in get_jobs():
        slow_fn(job)
    end = perf_counter()
    print(f"Func to {end - start} seconds")
