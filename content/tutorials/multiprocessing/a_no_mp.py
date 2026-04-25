from time import time

from slow import do_some_slow_computation, get_jobs


def work(jobs):
    return [do_some_slow_computation(j) for j in jobs]


if __name__ == "__main__":
    jobs = get_jobs()

    start = time()
    results = work(jobs)
    end = time()
    print(f"{len(jobs)} jobs took {end - start} seconds")

    # 512 jobs took 35.41598415374756 seconds
