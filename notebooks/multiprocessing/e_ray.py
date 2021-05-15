import sys

sys.path.append(".")
from slow import get_jobs, slow_fn
from time import time
import ray

workfn = ray.remote(slow_fn)


def work(jobs):
    results = [workfn.remote(job) for job in jobs]
    return ray.get(results)


if __name__ == "__main__":
    start1 = time()

    ray.init()
    jobs = get_jobs()

    start2 = time()
    results = work(jobs)
    end = time()
    print(f"{len(jobs)} jobs took {end - start1} seconds")
    print(f"{len(jobs)} jobs took {end - start2} seconds")
    # 512 jobs took 7.742 seconds
