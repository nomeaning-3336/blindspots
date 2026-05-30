"""Maia4All service entry point.

This module intentionally refuses to start until the real Maia4All source and
checkpoint are provided. It exists to make the integration boundary explicit
without pretending to implement Maia4All.
"""

from __future__ import annotations

import os
from pathlib import Path


class Maia4AllArtifactError(RuntimeError):
    pass


def require_existing_path(env_name: str) -> Path:
    raw_path = os.environ.get(env_name)
    if not raw_path:
        raise Maia4AllArtifactError(f"{env_name} is required")

    path = Path(raw_path)
    if not path.exists():
        raise Maia4AllArtifactError(f"{env_name} does not exist: {path}")

    return path


def main() -> None:
    require_existing_path("MAIA4ALL_CODE_PATH")
    require_existing_path("MAIA4ALL_CHECKPOINT_PATH")
    raise Maia4AllArtifactError(
        "Real Maia4All adapter not implemented because the required code and "
        "checkpoint are not present in this repository."
    )


if __name__ == "__main__":
    main()
