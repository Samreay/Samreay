import sys

sys.path.append(".")
from slow import get_jobs, slow_fn
from time import time
import concurrent.futures


def work(jobs):
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as executor:
        results = executor.map(slow_fn, jobs, chunksize=1)
        return list(results)


if __name__ == "__main__":
    jobs = get_jobs()

    start = time()
    results = work(jobs)
    end = time()
    print(f"{len(jobs)} jobs took {end - start} seconds")
    # 512 jobs took 7.278368949890137 seconds
