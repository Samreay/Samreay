from slow import get_jobs, do_some_slow_computation
from time import time
from mpi4py.futures import MPIPoolExecutor


def work(jobs):
    with MPIPoolExecutor(max_workers=4) as executor:
        results = executor.map(do_some_slow_computation, jobs, chunksize=16)
        return list(results)


if __name__ == "__main__":
    # mpiexec -n 8 python -m mpi4py.futures c_mpi.py

    jobs = get_jobs()

    start = time()
    results = work(jobs)
    end = time()
    print(f"{len(jobs)} jobs took {end - start} seconds")
    # 512 jobs took 7.176983118057251 seconds