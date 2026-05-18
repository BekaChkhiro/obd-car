from slowapi import Limiter
from slowapi.util import get_remote_address

from ..config import settings


limiter = Limiter(key_func=get_remote_address, default_limits=[])

AUTH_RATE_LIMIT = settings.auth_rate_limit
