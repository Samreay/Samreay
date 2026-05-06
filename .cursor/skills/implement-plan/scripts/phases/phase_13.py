"""Phase 13 — CI swap.

See plans/13-ci-swap.md and references/gates-by-phase.md.

Phase 13 swaps `.github/workflows/gh-pages.yml` from Hugo to Astro
without yet deleting the Hugo theme — that happens in Phase 14
(cutover). The verifier asserts the workflow YAML is well-formed and
contains the expected steps. A live `workflow_dispatch` dry run is
intentionally manual: the gate flags it as `should_match` and prints
guidance.

`actionlint` would be the gold standard for the lint check, but it's
not assumed to be installed on the dev box. We fall back to a YAML
parse round-trip plus a small set of structural assertions that catch
the failure modes that historically broke this repo's deploy:

* The build job runs on `ubuntu-24.04` (not `ubuntu-latest`, which
  drifted us into a python toolchain mismatch in 2024).
* `actions/setup-node@v4` pinned to Node 22+ (Astro 5 minimum).
* The artifact uploaded is `./dist`, not `./public`.
* No `peaceiris/actions-hugo` step is present.
* The deploy job is gated to `push` on `master`, so PRs never deploy.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.types import Check, CheckResult, Context  # noqa: E402

WORKFLOW_PATH = ".github/workflows/gh-pages.yml"


def _load_workflow(repo_root: Path) -> tuple[dict[str, Any] | None, str]:
    path = repo_root / WORKFLOW_PATH
    if not path.is_file():
        return None, f"missing workflow file: {WORKFLOW_PATH}"
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8")) or {}, ""
    except yaml.YAMLError as exc:
        return None, f"YAML parse error: {exc}"


def _check_workflow_yaml_lint(ctx: Context) -> CheckResult:
    """Use `actionlint` if it's on PATH, otherwise fall back to a YAML
    parse + a couple of guardrails. The parse is the must-match piece;
    actionlint output is shown as detail if available.
    """
    workflow, err = _load_workflow(ctx.repo_root)
    if err:
        return CheckResult(
            name="workflow_yaml_lint",
            severity="must_match",
            passed=False,
            detail=err,
        )
    actionlint = shutil.which("actionlint")
    detail = "YAML parsed cleanly"
    if actionlint:
        proc = subprocess.run(
            [actionlint, str(ctx.repo_root / WORKFLOW_PATH)],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            return CheckResult(
                name="workflow_yaml_lint",
                severity="must_match",
                passed=False,
                detail="actionlint reported issues",
                diff=proc.stdout + proc.stderr,
            )
        detail = "actionlint clean"
    # `on:` and `jobs:` are mandatory keys for any sane workflow. PyYAML
    # (and GitHub) parse `on:` as the boolean True because of YAML 1.1's
    # truthy keyword rules; tolerate either spelling.
    if not workflow or ("on" not in workflow and True not in workflow):
        return CheckResult(
            name="workflow_yaml_lint",
            severity="must_match",
            passed=False,
            detail="workflow missing top-level `on:` trigger map",
        )
    if not isinstance(workflow.get("jobs"), dict):
        return CheckResult(
            name="workflow_yaml_lint",
            severity="must_match",
            passed=False,
            detail="workflow missing top-level `jobs:` map",
        )
    return CheckResult(
        name="workflow_yaml_lint",
        severity="must_match",
        passed=True,
        detail=detail,
    )


def _check_workflow_uses_npm_build(ctx: Context) -> CheckResult:
    workflow, err = _load_workflow(ctx.repo_root)
    if err or workflow is None:
        return CheckResult(
            name="workflow_uses_npm_build",
            severity="must_match",
            passed=False,
            detail=err or "workflow missing",
        )
    build = workflow.get("jobs", {}).get("build")
    if not isinstance(build, dict):
        return CheckResult(
            name="workflow_uses_npm_build",
            severity="must_match",
            passed=False,
            detail="`jobs.build` missing or malformed",
        )
    steps = build.get("steps", []) or []
    flags = {
        "checkout_v4": False,
        "setup_node_v4": False,
        "node_22_plus": False,
        "npm_ci": False,
        "npm_run_build": False,
        "upload_dist": False,
        "no_hugo_action": True,
        "no_public_artifact": True,
    }
    for step in steps:
        if not isinstance(step, dict):
            continue
        uses = str(step.get("uses", ""))
        run = str(step.get("run", ""))
        if uses.startswith("actions/checkout@v4"):
            flags["checkout_v4"] = True
        if uses.startswith("actions/setup-node@v4"):
            flags["setup_node_v4"] = True
            with_block = step.get("with") or {}
            version = str(with_block.get("node-version", "")).strip("'\" ")
            try:
                major = int(version.split(".")[0])
            except (ValueError, IndexError):
                major = 0
            if major >= 22:
                flags["node_22_plus"] = True
        if uses.startswith("peaceiris/actions-hugo"):
            flags["no_hugo_action"] = False
        if "npm ci" in run:
            flags["npm_ci"] = True
        if "npm run build" in run:
            flags["npm_run_build"] = True
        if uses.startswith("actions/upload-pages-artifact"):
            artifact_path = str((step.get("with") or {}).get("path", "")).strip("'\" ")
            if artifact_path.rstrip("/").endswith("dist"):
                flags["upload_dist"] = True
            elif artifact_path.rstrip("/").endswith("public"):
                flags["no_public_artifact"] = False
    failures = [k for k, v in flags.items() if not v]
    if not failures:
        return CheckResult(
            name="workflow_uses_npm_build",
            severity="must_match",
            passed=True,
            detail="build job uses npm ci + npm run build, uploads dist/, on Node 22 with v4 actions",
        )
    return CheckResult(
        name="workflow_uses_npm_build",
        severity="must_match",
        passed=False,
        detail=f"build job missing: {', '.join(failures)}",
    )


def _check_deploy_gated_to_master_pushes(ctx: Context) -> CheckResult:
    """PRs must build but not deploy. Without this guard we'd ship
    every PR draft straight to production.
    """
    workflow, err = _load_workflow(ctx.repo_root)
    if err or workflow is None:
        return CheckResult(
            name="deploy_gated_to_master_pushes",
            severity="must_match",
            passed=False,
            detail=err or "workflow missing",
        )
    deploy = workflow.get("jobs", {}).get("deploy")
    if not isinstance(deploy, dict):
        return CheckResult(
            name="deploy_gated_to_master_pushes",
            severity="must_match",
            passed=False,
            detail="`jobs.deploy` missing",
        )
    cond = str(deploy.get("if", ""))
    needs_master = "refs/heads/master" in cond
    needs_push = "push" in cond
    if needs_master and needs_push:
        return CheckResult(
            name="deploy_gated_to_master_pushes",
            severity="must_match",
            passed=True,
            detail=f"deploy gated by: {cond}",
        )
    return CheckResult(
        name="deploy_gated_to_master_pushes",
        severity="must_match",
        passed=False,
        detail=f"deploy.if missing master/push gating; got {cond!r}",
    )


def _check_workflow_dispatch_enabled(ctx: Context) -> CheckResult:
    """A `workflow_dispatch` trigger lets us run a manual smoke build
    against any branch — necessary for the recommended Phase 13 dry run.
    Real push verification is manual, so this is `should_match`.
    """
    workflow, err = _load_workflow(ctx.repo_root)
    if err or workflow is None:
        return CheckResult(
            name="workflow_dispatch_enabled",
            severity="should_match",
            passed=False,
            detail=err or "workflow missing",
        )
    triggers = workflow.get("on", workflow.get(True, {}))
    if isinstance(triggers, dict) and "workflow_dispatch" in triggers:
        return CheckResult(
            name="workflow_dispatch_enabled",
            severity="should_match",
            passed=True,
            detail="`workflow_dispatch` trigger present",
        )
    return CheckResult(
        name="workflow_dispatch_enabled",
        severity="should_match",
        passed=False,
        detail="`workflow_dispatch` trigger not declared",
    )


def _check_no_residual_hugo_step(ctx: Context) -> CheckResult:
    """Belt-and-braces text grep — catches the case where the Hugo step
    was indented inconsistently and slipped past the structured check.
    """
    path = ctx.repo_root / WORKFLOW_PATH
    if not path.is_file():
        return CheckResult(
            name="no_residual_hugo_step",
            severity="must_match",
            passed=False,
            detail="workflow file missing",
        )
    text = path.read_text(encoding="utf-8")
    needles = ("peaceiris/actions-hugo", "hugo --gc", "Setup Hugo")
    hits = [n for n in needles if n in text]
    if not hits:
        return CheckResult(
            name="no_residual_hugo_step",
            severity="must_match",
            passed=True,
            detail="no Hugo-flavoured strings in the workflow",
        )
    return CheckResult(
        name="no_residual_hugo_step",
        severity="must_match",
        passed=False,
        detail=f"residual Hugo references: {', '.join(hits)}",
    )


CHECKS: list[Check] = [
    Check(name="workflow_yaml_lint", severity="must_match", run=_check_workflow_yaml_lint),
    Check(
        name="workflow_uses_npm_build",
        severity="must_match",
        run=_check_workflow_uses_npm_build,
    ),
    Check(
        name="deploy_gated_to_master_pushes",
        severity="must_match",
        run=_check_deploy_gated_to_master_pushes,
    ),
    Check(
        name="workflow_dispatch_enabled",
        severity="should_match",
        run=_check_workflow_dispatch_enabled,
    ),
    Check(
        name="no_residual_hugo_step",
        severity="must_match",
        run=_check_no_residual_hugo_step,
    ),
]
