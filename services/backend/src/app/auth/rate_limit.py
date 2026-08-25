import time

from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import MovingWindowRateLimiter
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..config import settings

limiter = Limiter(key_func=get_remote_address, default_limits=[])

AUTH_RATE_LIMIT = settings.auth_rate_limit

_ai_storage = MemoryStorage()
_ai_limiter = MovingWindowRateLimiter(_ai_storage)


def check_ai_rate_limit(user_id: int) -> bool:
    """Return True if the user is within the AI turn rate limit, False if exceeded."""
    limit = parse(settings.ai_rate_limit)
    return _ai_limiter.hit(limit, f"user:{user_id}")


_sms_ip_storage = MemoryStorage()
_sms_ip_limiter = MovingWindowRateLimiter(_sms_ip_storage)


def check_sms_ip_rate_limit(ip: str) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds).

    Checked and shaped by hand rather than through the `@limiter.limit(...)`
    decorator slowapi's other endpoints use: `/auth/request-code` needs a
    `retry_after` in the body and a `Retry-After` header, in the same shape
    as the per-phone limit below it, and slowapi's own 429 handler has no way
    to say that.
    """
    limit = parse(settings.sms_request_ip_rate_limit)
    key = f"ip:{ip}"
    if not _sms_ip_limiter.test(limit, key):
        stats = _sms_ip_limiter.get_window_stats(limit, key)
        retry_after = max(1, int(stats.reset_time - time.time()))
        return False, retry_after
    _sms_ip_limiter.hit(limit, key)
    return True, 0
