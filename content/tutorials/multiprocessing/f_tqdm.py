import sys

sys.path.append(".")
from slow import get_jobs, slow_fn
from time import time
from p_tqdm import p_map


def work(jobs):
    results = p_map(slow_fn, jobs)  # No chunksize
    return results


if __name__ == "__main__":
    jobs = get_jobs()

    start = time()
    results = work(jobs)
    end = time()
    print(f"{len(jobs)} jobs took {end - start} seconds")
    # 512 jobs took 6.954061031341553 seconds
