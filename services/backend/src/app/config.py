from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    log_level: str = "INFO"

    # CORS — comma-separated list of allowed origins
    cors_origins: str = "http://localhost:8081,http://localhost:19006,exp://localhost:8081"

    # Anthropic
    anthropic_api_key: str = ""

    # SQLite database path (relative to service root)
    db_path: str = "db/obd.db"

    # JWT
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_minutes: int = 15
    jwt_refresh_ttl_days: int = 30

    # SMS delivery (sender.ge). Leave the key blank and verification codes are
    # written to the log instead of being sent — which is what you want in
    # development and must never be what happens in production.
    sender_ge_api_key: str = ""

    # Reserved numbers with a fixed code, for App Store review. Apple's
    # reviewers have US numbers; sender.ge only delivers to Georgian ones, and
    # phone auth is the only way into the app — without this, review is an
    # automatic Guideline 2.1 rejection because the reviewer can never receive
    # a code. Format: "+995555000001:1234,+995555000002:5678". Left empty,
    # this is a no-op: see `test_phone_numbers_map` below.
    test_phone_numbers: str = ""

    # Phone verification codes
    phone_code_ttl_minutes: int = 5
    phone_code_max_attempts: int = 5
    # Per-phone: how long a caller must wait before requesting another code.
    phone_code_resend_seconds: int = 60
    # Per-phone: codes allowed in a rolling hour, on top of the resend cooldown.
    phone_code_hourly_limit: int = 5

    # Sentry — leave blank to disable crash reporting
    sentry_dsn: str = ""

    # Rate limits — applied to /auth/* endpoints
    auth_rate_limit: str = "10/minute"
    # IP rate limit for /auth/request-code specifically — each send costs
    # real money, so this is tighter than the general auth limit above.
    sms_request_ip_rate_limit: str = "10/hour"

    # Rate limit for AI assistant turns per user (WebSocket user_message frames)
    ai_rate_limit: str = "20/hour"

    # Maximum total tokens (input + output) per WebSocket session; 0 = unlimited.
    # Default sized to fit one user's session within a budget while leaving
    # headroom for the 200K Claude context window.
    session_token_budget: int = 200000

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def test_phone_numbers_map(self) -> dict[str, str]:
        """Parse `test_phone_numbers` into {phone: fixed_code}.

        `"".split(",")` is `[""]`, not `[]` — without the per-entry `if phone
        and code` guard below, a blank setting would silently produce a
        `{"": ""}` mapping instead of the empty one this must be.
        """
        mapping: dict[str, str] = {}
        for entry in self.test_phone_numbers.split(","):
            phone, _, code = entry.strip().partition(":")
            phone, code = phone.strip(), code.strip()
            if phone and code:
                mapping[phone] = code
        return mapping

    @property
    def database_url(self) -> str:
        return f"sqlite+aiosqlite:///{self.db_path}"


settings = Settings()
