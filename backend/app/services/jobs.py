"""In-process registry of running ingest tasks.

Deliberately in-memory and not in the DB: it holds asyncio handles and cancel flags,
which are process-local by nature. This is why uvicorn runs with a single worker.
"""

from __future__ import annotations

import asyncio
import logging

log = logging.getLogger(__name__)

_tasks: dict[str, asyncio.Task] = {}
_cancelled: set[str] = set()


def register(job_id: str, task: asyncio.Task) -> None:
    _tasks[job_id] = task
    task.add_done_callback(lambda _t: _tasks.pop(job_id, None))


def request_cancel(job_id: str) -> bool:
    """Flag a job for cancellation. The pipeline checks this between files."""
    if job_id not in _tasks:
        return False
    _cancelled.add(job_id)
    return True


def is_cancelled(job_id: str) -> bool:
    return job_id in _cancelled


def clear(job_id: str) -> None:
    _cancelled.discard(job_id)
    _tasks.pop(job_id, None)


def running_count() -> int:
    return len(_tasks)


async def shutdown(timeout: float = 5.0) -> None:
    """Cancel in-flight ingests on shutdown so we do not leave staging dirs behind."""
    if not _tasks:
        return
    log.info("cancelling %d in-flight ingest task(s)", len(_tasks))
    for job_id in list(_tasks):
        _cancelled.add(job_id)
    tasks = list(_tasks.values())
    for task in tasks:
        task.cancel()
    await asyncio.wait(tasks, timeout=timeout)
