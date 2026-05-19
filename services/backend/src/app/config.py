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

    # Google OAuth — server-side client ID for ID-token verification
    google_client_id: str = ""

    # Sentry — leave blank to disable crash reporting
    sentry_dsn: str = ""

    # Rate limits — applied to /auth/* endpoints
    auth_rate_limit: str = "10/minute"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def database_url(self) -> str:
        return f"sqlite+aiosqlite:///{self.db_path}"


settings = Settings()
