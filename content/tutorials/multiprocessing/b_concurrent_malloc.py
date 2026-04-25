import concurrent.futures
from time import time

from slow import do_some_slow_computation_malloc, get_jobs


def work(jobs):
    with concurrent.futures.ProcessPoolExecutor(max_workers=8) as executor:
        results = executor.map(do_some_slow_computation_malloc, jobs, chunksize=16)
        return list(results)


if __name__ == "__main__":
    jobs = get_jobs()

    start = time()
    results = work(jobs)
    end = time()
    print(f"{len(jobs)} jobs took {end - start} seconds")
    # 512 jobs took 12.907477855682373 seconds
