from slow import get_jobs, do_some_slow_computation
from time import time


def work(jobs):
    return [do_some_slow_computation(j) for j in jobs]


if __name__ == "__main__":
    jobs = get_jobs()

    start = time()
    results = work(jobs)
    end = time()
    print(f"{len(jobs)} jobs took {end - start} seconds")

    # 512 jobs took 35.41598415374756 seconds