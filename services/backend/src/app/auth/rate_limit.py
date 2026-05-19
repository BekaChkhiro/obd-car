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
