"""Bounded per-process login throttle for the single-worker deployment."""

from collections import OrderedDict
from threading import Lock
from time import monotonic

from fastapi import HTTPException

_attempts: OrderedDict[str, tuple[float, int]] = OrderedDict()
_lock = Lock()


def check_login_limit(ip_address: str) -> None:
    now = monotonic()
    with _lock:
        while _attempts and next(iter(_attempts.values()))[0] <= now - 60:
            _attempts.popitem(last=False)
        started, count = _attempts.get(ip_address, (now, 0))
        if count >= 20:
            raise HTTPException(
                status_code=429, detail="Too many login attempts. Try again in one minute.",
                headers={"Retry-After": str(max(1, int(60 - (now - started))))},
            )
        _attempts[ip_address] = (started, count + 1)
        if len(_attempts) > 4096:
            _attempts.popitem(last=False)
