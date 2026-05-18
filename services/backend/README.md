# Backend — FastAPI orchestrator

Python 3.12 + FastAPI service that orchestrates Claude tool-use against
the mobile client. Persists sessions, messages, and auth in SQLite.

## Local development

```bash
# from services/backend
uv sync
cp .env.example .env   # fill in JWT_SECRET, ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID
uv run uvicorn app.main:app --reload
```

Generate a JWT secret:

```bash
openssl rand -hex 32
```

## Tests, lint, format

```bash
uv run pytest -q
uv run --with ruff ruff check src tests
uv run --with ruff ruff format src tests
```

## Docker

The `Dockerfile` is a two-stage build:

1. **builder** — installs deps into `/app/.venv` via `uv sync --frozen --no-dev`
2. **runtime** — copies the venv + source onto `python:3.12-slim-bookworm`, runs as a non-root user, exposes `:8000`

```bash
docker build -t obd-backend services/backend
docker run --rm -p 8000:8000 \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e ANTHROPIC_API_KEY="sk-ant-..." \
  -e GOOGLE_CLIENT_ID="..." \
  -v "$(pwd)/.docker-data:/data" \
  obd-backend
```

Inside the container, `DB_PATH=/data/obd.db` — mount a volume there so
the SQLite file survives container restarts.

## Deployment — Fly.io

The default target is [Fly.io](https://fly.io). `fly.toml` provisions a
persistent 1 GiB volume mounted at `/data` (SQLite lives in
`/data/obd.db`), a single rolling-deploy machine, and a `/health` HTTP
check.

### One-time setup

```bash
fly auth login
cd services/backend

fly apps create obd-ai-backend                       # match `app = ` in fly.toml
fly volumes create obd_data --region fra --size 1    # match [[mounts]].source
```

Set required secrets — these are stored encrypted by Fly and injected
as environment variables at runtime. **Never commit any of these.**

```bash
fly secrets set \
  JWT_SECRET="$(openssl rand -hex 32)" \
  ANTHROPIC_API_KEY="sk-ant-..." \
  GOOGLE_CLIENT_ID="...apps.googleusercontent.com" \
  CORS_ORIGINS="https://app.example.com"
```

Deploy manually:

```bash
fly deploy --remote-only
```

### Why a persistent volume?

Fly machines have ephemeral rootfs — every restart, scale event, or
deploy wipes any file not on a mounted volume. SQLite would lose every
session/message between deploys without `[[mounts]]`.

> **Single-writer constraint:** SQLite holds the write lock on one
> machine. `fly.toml` pins `min_machines_running = 1`,
> `auto_stop_machines = "stop"`, and `strategy = "rolling"` with
> `max_unavailable = 0` so we never have two VMs racing the same
> volume. If we later need horizontal scale, switch to Postgres before
> raising `min_machines_running`.

### Custom domain + TLS

```bash
fly certs add api.example.com
# add the AAAA/A records Fly prints, wait for cert issuance
fly certs show api.example.com
```

Then update `CORS_ORIGINS` (via `fly secrets set`) to include the
custom mobile/web origins.

### Health check

`fly.toml` polls `GET /health` every 30s — implemented in
`src/app/main.py`. The Dockerfile also has a container-level
`HEALTHCHECK` for local `docker run`.

## CI/CD — GitHub Actions

Two workflows live in `.github/workflows/`:

- **`backend-ci.yml`** — runs on PRs touching `services/backend/**`.
  Steps: `uv sync` → `ruff check` → `ruff format --check` → `pytest`
  → `docker build` (smoke).

- **`backend-deploy.yml`** — runs on push to `main` touching
  `services/backend/**`. Deploys to Fly.io via `flyctl deploy
  --remote-only` and probes `/health`. Uses a `production` environment
  for required reviewers / branch protection.

### Required GitHub secret

| Name            | Where to get it                                                              |
| --------------- | ---------------------------------------------------------------------------- |
| `FLY_API_TOKEN` | `fly tokens create deploy -x 999999h` (scope: this app) — set under repo settings → Secrets and variables → Actions |

App secrets themselves (`JWT_SECRET`, `ANTHROPIC_API_KEY`,
`GOOGLE_CLIENT_ID`, etc.) live in **Fly secrets**, not GitHub. GitHub
Actions only needs `FLY_API_TOKEN` — `flyctl deploy` picks the rest up
from Fly at runtime. This keeps prod credentials out of the CI
environment entirely.

## Environment variables

See `.env.example` for the full list. Production-critical:

| Name                | Notes                                                                |
| ------------------- | -------------------------------------------------------------------- |
| `JWT_SECRET`        | Required. ≥32 bytes of entropy. Rotating invalidates all sessions.   |
| `ANTHROPIC_API_KEY` | Required. Server-side key — never ship to the mobile client.         |
| `GOOGLE_CLIENT_ID`  | Required for Google Sign-In. Server-side client ID, not the mobile one. |
| `DB_PATH`           | In container: `/data/obd.db` (on the mounted volume).                |
| `CORS_ORIGINS`      | Comma-separated. Set to your real mobile/web origins in prod.        |
| `APP_ENV`           | `production` on Fly; flips structlog to JSON output (see `logging.py`). |
