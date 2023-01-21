import sys

sys.path.append(".")
from slow import get_jobs, slow_fn
from time import time
from dask.distributed import Client


def work(client, jobs):
    # Send off jobs
    futures = client.map(slow_fn, jobs)
    # Get their outputs
    return client.gather(futures)


if __name__ == "__main__":
    jobs = get_jobs()
    start1 = time()
    client = Client()

    start2 = time()
    results = work(client, jobs)
    end = time()
    print(f"{len(jobs)} jobs took {end - start2} seconds")
    print(f"{len(jobs)} jobs took {end - start1} seconds")
    print(results)
    # 512 jobs took 6.76653790473938 seconds
