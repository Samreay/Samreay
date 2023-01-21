import sys

sys.path.append(".")
from slow import get_jobs, slow_fn
from time import time
from loky import get_reusable_executor


def work(jobs):
    executor = get_reusable_executor(max_workers=4)
    results = executor.map(slow_fn, jobs, chunksize=64)
    return list(results)


def slow_fn2(args):
    n = 10000
    y = 0
    for j in range(n):
        j = j / n
        for i, p in enumerate(args):
            y += j * (p ** (i + 1))
    return y / n


if __name__ == "__main__":
    jobs = get_jobs()

    start = time()
    results = work(jobs)
    end = time()
    print(f"{len(jobs)} jobs took {end - start} seconds")
    # 512 jobs took 6.61572790145874 seconds
