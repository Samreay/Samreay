from slow import get_jobs, do_some_slow_computation_malloc
from time import time


def work(jobs):
    return [do_some_slow_computation_malloc(j) for j in jobs]


if __name__ == "__main__":
    jobs = get_jobs()

    start = time()
    results = work(jobs)
    end = time()
    print(f"{len(jobs)} jobs took {end - start} seconds")

    # 512 jobs took 22.10852599143982 seconds