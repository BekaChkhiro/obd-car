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

    # Google OAuth — server-side client ID for ID-token verification
    google_client_id: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
