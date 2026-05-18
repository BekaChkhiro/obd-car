import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .logging import configure_logging

configure_logging()

log = structlog.get_logger(__name__)

app = FastAPI(title="OBD-II AI Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    log.info("backend started", env=settings.app_env)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
