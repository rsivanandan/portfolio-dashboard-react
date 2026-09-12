import threading
import time

_lock = threading.Lock()
_store: dict[str, tuple[float, object, int | None]] = {}


def get(key: str, default_ttl: int = 0) -> object | None:
    with _lock:
        item = _store.get(key)
    if not item:
        return None
    stamp, value, ttl = item
    if time.time() - stamp > (ttl if ttl is not None else default_ttl):
        return None
    return value


def set(key: str, value: object, ttl: int | None = None) -> None:
    with _lock:
        _store[key] = (time.time(), value, ttl)


def invalidate(prefix: str = "ai:") -> None:
    with _lock:
        for key in [k for k in _store if k.startswith(prefix)]:
            del _store[key]