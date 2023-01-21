import sys

sys.path.append(".")
from slow import get_jobs, slow_fn
from time import time
from pathos.multiprocessing import ProcessPool


def work(jobs):
    pool = ProcessPool()
    results = pool.map(slow_fn, jobs, chunksize=16)
    return results


if __name__ == "__main__":
    jobs = get_jobs()

    start = time()
    results = work(jobs)
    end = time()
    print(f"{len(jobs)} jobs took {end - start} seconds")
    # 512 jobs took 6.76653790473938 seconds
