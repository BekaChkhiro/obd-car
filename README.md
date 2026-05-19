# OBD-II AI Diagnostic Assistant

Mobile-first AI-powered car diagnostic app. React Native (Expo) pairs with an ELM327 OBD-II adapter over Bluetooth LE, streams live vehicle data, and exposes it to a Claude-powered chat assistant via a FastAPI orchestrator.

See [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) for the full plan.

## Layout

```
obd-car/
  apps/
    mobile/          # Expo app (T0.2)
  services/
    backend/         # FastAPI app (T0.3)
  packages/
    obd-protocol/    # Shared TS types — PIDs, DTC codes, tool schemas (T0.4)
  docs/
    PRIVACY_POLICY.md   # User-facing privacy policy + App Store / Play Store disclosures
    DATA_HANDLING.md    # Internal data-handling reference (categories, retention, security)
```

## Requirements

- Node.js >= 20.19 (mobile + shared packages)
- pnpm >= 10
- Python 3.12 (backend)

## Setup

```bash
pnpm install
```

Per-workspace setup lives in each package's README.

## Scripts

| Script              | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `pnpm lint`         | Run lint across every workspace that defines it |
| `pnpm typecheck`    | Run typecheck across every workspace            |
| `pnpm test`         | Run tests across every workspace                |
| `pnpm format`       | Prettier-format all TS/JS/JSON/MD               |
| `pnpm format:check` | Prettier check (CI)                             |

The Python backend uses its own tooling (ruff, pytest, mypy) — see `services/backend/README.md` once T0.3 lands.
