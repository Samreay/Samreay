#!/usr/bin/env -S uv run --script
#
# /// script
# requires-python = ">=3.12"
# dependencies = ["prefect", "pydantic"]
# ///

import json
from collections import defaultdict
from pathlib import Path

from prefect import Flow, deploy, flow, task
from prefect.deployments.runner import RunnerDeployment
from prefect.settings import PREFECT_API_URL, temporary_settings
from pydantic import BaseModel, Field

THIS_IMAGE = "ghcr.io/wherever/your/cicd/image/uploads/to"


class DeploymentConfig(BaseModel):
    name: str = Field(default="default")
    cron: str | None = Field(default=None)
    active: bool = Field(default=True)
    work_pool: str = Field(default="default")


class Registry:
    def __init__(self):
        self.deployments: list[tuple[Flow, DeploymentConfig]] = []

    def __call__(self, config: DeploymentConfig):
        def inner(fn: Flow):
            self.deployments.append((fn, config))
            return fn

        return inner


registry = Registry()


@task
def load_data(data_path: str) -> list[dict]:
    return json.loads(Path(data_path).read_text())


@task
def filter_data(data: list[dict]) -> list[dict]:
    return [item for item in data if item.get("active")]


@task
def save_data(data: list[dict], output_path: str):
    Path(output_path).write_text(json.dumps(data))


@registry(DeploymentConfig(cron="0 9 * * *"))
@flow
def some_process(data_path: str, output_path: str):
    raw = load_data(data_path)
    filtered = filter_data(raw)
    save_data(filtered, output_path)


def get_deployments() -> dict[str, list[RunnerDeployment]]:
    """Return a map of work pool to deployments."""
    deployments = defaultdict(list)
    for flow, deployment in registry.deployments:
        runner_deployment = flow.to_deployment(
            name=deployment.name,
            work_pool_name=deployment.work_pool,
            paused=not deployment.active,
            cron=deployment.cron,
        )
        # Depending on how you have your code inside your image
        # you may need to adjust the runner_deployment.entrypoint
        deployments[deployment.work_pool].append(runner_deployment)
    return deployments


def register_deployments(deployment_map: dict[str, list[RunnerDeployment]]) -> None:
    # Each deploy call has a single work pool name (dont ask me why)
    # which is why the previous map is grouped by work pool
    for work_pool, deployments in deployment_map.items():
        deploy(
            *deployments,
            work_pool_name=work_pool,
            image=THIS_IMAGE,
            build=False,
            push=False,
        )


if __name__ == "__main__":
    url = "http://localhost:4200/api"
    with temporary_settings({PREFECT_API_URL: url}):
        deployment_map = get_deployments()
        register_deployments(deployment_map)
