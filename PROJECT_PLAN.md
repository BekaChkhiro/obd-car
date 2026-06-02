# OBD-II AI Diagnostic Assistant — Project Plan

## Overview

Mobile-first AI-powered car diagnostic app. React Native (Expo) front-end pairs with an ELM327 OBD-II adapter over Bluetooth LE, streams live vehicle data, and exposes it to a Claude-powered chat assistant via a FastAPI orchestrator.

## Tech Stack

- **Mobile**: React Native (Expo, dev client) + TypeScript + Tailwind (NativeWind) + Zustand (state) + react-native-ble-plx (BLE) + react-native-mmkv (local cache)
- **Backend**: Python 3.12 + FastAPI + Anthropic SDK + WebSockets + SQLite (sessions/history) + Pydantic
- **AI**: Claude Sonnet 4.6 (default) with prompt caching + streaming; Haiku 4.5 fallback for cheap routing
- **OBD layer**: ELM327 AT/PID command set implemented in TypeScript on-device (python-obd patterns ported); backend never talks to the adapter directly
- **Deployment**: Mobile via Expo EAS (iOS TestFlight + Android internal). Backend on Fly.io / Railway

## Architectural Decisions

> **Why mobile owns the OBD link (not a Python MCP server):** the adapter is paired to the phone over BLE. Running a separate Python daemon on the user's computer defeats the point of a mobile app. We therefore invert the original MCP model:
>
> - Phone holds the BLE socket and implements ELM327 read/write.
> - Backend orchestrates Claude with tool-use; each "tool call" is forwarded over a persistent WebSocket to the phone, which executes the OBD command and returns the value.
> - This preserves the MCP design intent (AI calls structured tools to fetch live data) without needing python-obd on the device.

- **Streaming-first**: Claude responses streamed to the phone via SSE (HTTP) or WS messages — chat UX requirement.
- **Prompt caching**: system prompt + tool schemas + recent DTC context cached (4×-cost reduction).
- **Read-only by default**: write tools (DTC clear) require explicit confirmation message from the user before the backend dispatches.
- **Offline-first journaling**: live data and chat history persist on-device (MMKV) and sync to backend SQLite when network is available.
- **i18n at the prompt layer**: language preference sent to Claude per request; UI strings via `react-i18next` (ka, en).

## Repository Layout

```
obd-car/
  apps/
    mobile/          # Expo app
  services/
    backend/         # FastAPI app
  packages/
    obd-protocol/    # Shared TS types (PIDs, DTC codes, tool schemas)
  docs/
  PROJECT_PLAN.md
```

---

## Tasks & Implementation Plan

### Phase 0: Foundations

#### T0.1: Bootstrap monorepo

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: None
- **Description**:
  - Set up pnpm workspaces with `apps/mobile`, `services/backend`, `packages/obd-protocol`
  - Commit `.gitignore`, root README, EditorConfig, Prettier + ESLint base configs

#### T0.2: Initialize Expo app

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T0.1
- **Description**:
  - Create Expo app with TypeScript template, expo-router, expo-dev-client
  - Add NativeWind, react-native-ble-plx, Zustand, react-native-mmkv
  - Verify run on iOS Simulator and Android Emulator

#### T0.3: Initialize FastAPI service

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: T0.1
- **Description**:
  - Bootstrap FastAPI with `uv` or Poetry, Python 3.12
  - Add `/health` endpoint, structlog, `.env` loader (pydantic-settings)
  - Configure CORS for Expo dev origin

#### T0.4: Shared OBD protocol package

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T0.1
- **Description**:
  - Define PID + DTC TypeScript types in `packages/obd-protocol`
  - Wire path alias for mobile app
  - Emit a JSON Schema artifact the Python backend can read for tool definitions

#### T0.5: Environment configuration

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 1 hour
- **Dependencies**: T0.2, T0.3
- **Description**:
  - Backend `.env.example` (ANTHROPIC_API_KEY, DB_PATH, LOG_LEVEL, JWT_SECRET, GOOGLE_CLIENT_ID)
  - Mobile `app.config.ts` with API_URL, WS_URL, GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID pulled from EAS env

#### T0.6: Auth backend (email + Google OAuth)

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 10 hours
- **Dependencies**: T0.3
- **Description**:
  - `users` table (id, email, password_hash nullable, google_sub nullable, locale, created_at)
  - POST `/auth/register`, `/auth/login` (bcrypt + JWT issue)
  - POST `/auth/google` — verifies Google ID token (google-auth lib), upserts user by `sub`
  - JWT middleware for protected routes; refresh token rotation
  - Rate limit auth endpoints

#### T0.7: Auth mobile UI

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 7 hours
- **Dependencies**: T0.6, T0.2
- **Description**:
  - Sign-in / sign-up screens (email + password, validation)
  - "Continue with Google" via `expo-auth-session/providers/google`
  - Token storage in `expo-secure-store`; auto-attach to API + WS calls
  - 401 interceptor with refresh-token retry; queue in-flight requests during refresh
  - Logout flow, password reset stub (Phase 6)

#### T0.8: Mobile SQLite for offline chat

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 5 hours
- **Dependencies**: T0.2
- **Description**:
  - `expo-sqlite` setup with migration runner
  - `schema_version` table; forward-only migration policy documented
  - Local schema mirrors backend: sessions, messages, tool_calls, vehicles
  - Repository layer abstracting reads (UI never hits raw SQL)
  - Append messages locally first, then send to backend (write-ahead pattern)

#### T0.9: Backend deployment infrastructure

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 5 hours
- **Dependencies**: T0.3
- **Description**:
  - Dockerfile for FastAPI service (multi-stage, slim base)
  - Fly.io / Railway deploy config with **persistent volume** for SQLite (default ephemeral storage loses data on restart)
  - Secrets management (ANTHROPIC_API_KEY, JWT_SECRET, GOOGLE_CLIENT_ID) via platform secrets, not committed
  - GitHub Actions CI: lint + test + build on PR, deploy on merge to main
  - Custom domain + TLS, health-check probe wired to T0.3 `/health`

### Phase 1: OBD Connectivity (mobile)

#### T1.1: BLE permissions and pairing UI

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T0.2
- **Description**:
  - iOS Info.plist entries for Bluetooth
  - Android runtime permission flow for BLUETOOTH_SCAN / CONNECT / LOCATION
  - Pairing screen lists discoverable BLE devices with RSSI

#### T1.2: ELM327 protocol module

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 8 hours
- **Dependencies**: T1.1, T0.4
- **Description**:
  - Implement AT command sequence (ATZ, ATE0, ATSP0, ATL0)
  - Response framing, hex parsing, prompt detection (`>`)
  - Timeout, retry, and graceful error handling

#### T1.3: PID reader API

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 5 hours
- **Dependencies**: T1.2
- **Description**:
  - Typed `readPid(mode, pid)` API returning decoded value + units
  - Encode standard formulas: RPM (0x010C), speed (0x010D), coolant temp (0x0105), fuel level (0x012F), battery (0x0142)

#### T1.4: Supported-PID auto-discovery

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T1.3
- **Description**:
  - Query bitmaps at 0x0100, 0x0120, 0x0140
  - Cache supported PID set keyed by VIN in MMKV

#### T1.5: Connection state machine

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T1.2
- **Description**:
  - States: disconnected → scanning → connecting → ready → reading → error
  - Automatic reconnect with backoff
  - Expose state to UI via Zustand store

#### T1.6: Mock adapter for simulator

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: T1.3
- **Description**:
  - In-memory adapter implementing the same interface as the BLE driver
  - Generates plausible RPM/speed/temp curves for demos and Detox tests

#### T1.7: BLE command queue / serialization

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T1.2
- **Description**:
  - Single-channel ELM327 means only one outstanding command at a time
  - Implement a FIFO queue with priority lanes (tool calls > dashboard polls)
  - Pause/resume polling when an AI tool call is in flight
  - Coalesce repeated dashboard reads of the same PID within a window
  - Expose queue depth + last latency to UI for diagnostics

#### T1.8: Protocol fallback and manual override

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T1.2
- **Description**:
  - ATSP0 auto-detect first; if no response within timeout, probe ATSP1..ATSP9 in order
  - Cache successful protocol per VIN in MMKV
  - Settings UI: manual protocol override for stubborn ECUs (ISO 9141, some Korean/Asian)
  - Surface "no protocol matched" with actionable error, not silent failure

### Phase 2: Real-Time Dashboard

#### T2.1: Dashboard layout and gauges

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 5 hours
- **Dependencies**: T1.3, T1.5, T1.7
- **Description**:
  - Gauge widgets for RPM, speed, coolant temp, fuel level, battery voltage
  - Independent poll intervals (RPM 250 ms, slow PIDs 1 s)

#### T2.2: Time-series buffer and charts

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T2.1
- **Description**:
  - 5-minute ring buffer per PID in Zustand
  - Charts via Victory Native or react-native-skia

#### T2.3: Threshold alerts

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T2.1
- **Description**:
  - Local notifications + in-app toasts for overheat / low battery / low fuel
  - Per-vehicle threshold overrides in settings

#### T2.4: Persist dashboard snapshot

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: T2.2
- **Description**:
  - Serialize last session's snapshot to MMKV
  - Hydrate dashboard instantly on app reopen

### Phase 3: Backend Orchestrator + Claude Integration

#### T3.1: WebSocket session endpoint

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T0.6
- **Description**:
  - `/ws/session/{id}` accepts phone connection, authenticated via JWT in query / first frame
  - Phone registers device capabilities on connect (supported PIDs, VIN, locale)
  - Reject unauthenticated or expired tokens

#### T3.2: Claude client wrapper

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 6 hours
- **Dependencies**: T0.3
- **Description**:
  - Anthropic SDK with streaming
  - Prompt-caching headers + cache-breakpoint helpers
  - Model routing: Sonnet 4.6 default, Haiku 4.5 for short clarifications

#### T3.3: Tool schemas

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T0.4
- **Description**:
  - Define JSON Schema tools: `read_pid`, `read_dtcs`, `read_freeze_frame`, `read_battery_voltage`
  - Define write tool `clear_dtcs` with required confirmation flag

#### T3.4: Tool dispatcher

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 12 hours
- **Dependencies**: T3.1, T3.2, T3.3, T1.7
- **Description**:
  - Parse the Anthropic streaming event stream: interleave `content_block_start`/`delta`/`stop` for text and tool_use blocks within a single assistant turn
  - When `stop_reason = tool_use`, dispatch typed RPC over WS to the phone (BLE queue T1.7 serializes execution)
  - Await response (5 s timeout), inject `tool_result`, resume the assistant turn until terminal stop_reason
  - Tool-result truncation: clip oversized payloads (e.g. long PID histories) to fit Anthropic content limits with a "[truncated]" marker
  - Handle write tools only after explicit user confirmation message

#### T3.5: System prompt builder

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T3.2
- **Description**:
  - Compose vehicle context (make / model / VIN / year), language, recent DTCs
  - Place stable sections behind prompt-cache breakpoints

#### T3.6: SQLite schema and migrations

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T0.6
- **Description**:
  - Tables: users (from T0.6), sessions, messages, tool_calls, vehicles
  - Foreign keys: sessions.user_id, vehicles.user_id, messages.session_id, tool_calls.message_id
  - sqlmodel models + Alembic migrations
  - Indexes on user_id + created_at for history queries

#### T3.7: Mobile ↔ backend sync strategy

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 6 hours
- **Dependencies**: T0.8, T3.6
- **Description**:
  - Each local row has `sync_status` (pending / synced / failed) and `server_id`
  - On reconnect: push pending writes (oldest first), then pull server-newer rows since `last_pulled_at`
  - Conflict policy: server wins for messages (immutable), last-write-wins for vehicles
  - Background sync via expo-task-manager when app foregrounded

#### T3.8: Conversation context manager

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T3.2, T3.6
- **Description**:
  - Track per-session token usage (input + cache + output)
  - When approaching the model's context limit, summarize older messages via a Haiku 4.5 call and replace them with a single "previous-conversation summary" turn
  - Always keep the system prompt, vehicle context, and last N turns verbatim
  - Persist the summary so reloads don't re-summarize

### Phase 4: AI Chat UI

#### T4.1: Chat screen

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 5 hours
- **Dependencies**: T0.2
- **Description**:
  - Message list with virtualization
  - Streaming text indicator, tool-call badges, markdown rendering

#### T4.2: Input bar and quick prompts

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 3 hours
- **Dependencies**: T4.1
- **Description**:
  - Send, abort buttons, character counter
  - Quick-prompt chips ("რა შეცდომა გვაქვს?", "ბატარეა როგორ არის?")

#### T4.3: Wire chat to backend stream

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 5 hours
- **Dependencies**: T4.1, T3.1, T3.2
- **Description**:
  - Subscribe to SSE / WS stream
  - Reconnect with replay of the last partial message

#### T4.4: Write-tool confirmation modal

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 2 hours
- **Dependencies**: T4.3, T3.4
- **Description**:
  - Modal shown when Claude proposes `clear_dtcs`
  - Backend only dispatches after explicit user OK

#### T4.5: Inline data widgets

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T4.3
- **Description**:
  - Render compact live-value card under message when Claude calls `read_pid`
  - Update card in place as the value refreshes

### Phase 5: DTC + History + i18n

#### T5.1: DTC reader and decoder

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T1.3
- **Description**:
  - Mode 0x03 reader
  - SAE generic codes bundled with en + ka human strings
  - Manufacturer-specific codes left to Claude

#### T5.2: DTC clear flow

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T5.1, T4.4
- **Description**:
  - Mode 0x04 write with user confirmation
  - Re-read after clear to verify

#### T5.3: Session history screen

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T0.8, T4.1
- **Description**:
  - List past sessions from local SQLite with summary
  - Drill-down to messages and data snapshot
  - Pull-to-refresh triggers sync (T3.7)

#### T5.4: i18n setup

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 3 hours
- **Dependencies**: T0.2
- **Description**:
  - `react-i18next` with ka + en locale files
  - Settings switcher, backend forwards locale to Claude

#### T5.5: Onboarding wizard

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T1.1, T5.4, T5.6
- **Description**:
  - First-run flow: BLE permission → adapter pair → VIN auto-read (fall back to manual entry) → language

#### T5.6: Extended OBD modes — VIN, freeze frame, permanent DTCs

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 5 hours
- **Dependencies**: T1.3, T5.1
- **Description**:
  - Mode 0x09 PID 0x02: read VIN from ECU; populate vehicle profile automatically
  - Mode 0x02: read freeze-frame snapshot captured at the moment a DTC was triggered — surface alongside the DTC for the AI
  - Mode 0x0A: read permanent DTCs (codes the ECU refuses to clear until it self-verifies a fix)
  - Expose all three to Claude as additional tools (extends T3.3)

#### T5.7: Account deletion flow

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T0.6, T0.7
- **Description**:
  - Settings → "Delete account" with confirmation copy in ka + en
  - Backend endpoint: hard-delete user + cascade sessions/messages/tool_calls/vehicles
  - Mobile: clear local SQLite + MMKV + secure-store on success
  - **App Store requirement** — submission rejected without this

### Phase 6: Polish + Release

#### T6.1: Crash reporting

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: T0.2, T0.3
- **Description**:
  - Sentry for mobile and backend
  - PII scrubbing on chat content before send

#### T6.2: Rate limiting and token budget

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T3.2
- **Description**:
  - Per-session request rate limit
  - Daily token budget per user; soft cutoff with friendly message

#### T6.3: Unit tests

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 11 hours
- **Dependencies**: T1.3, T3.4
- **Description**:
  - Jest: ELM327 parser, PID formulas, mock adapter
  - Pytest: tool dispatcher, prompt builder, SQLite repos

#### T6.4: E2E happy path

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 6 hours
- **Dependencies**: T1.6, T4.3, T5.2
- **Description**:
  - Detox or Maestro: mock adapter → chat → DTC clear flow
  - Run in CI on PR

#### T6.5: EAS build profiles

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T0.2
- **Description**:
  - dev, preview, production EAS profiles
  - TestFlight and Android internal-track submission scripts

#### T6.6: Privacy policy and data doc

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: None
- **Description**:
  - Document what OBD data and chat logs are stored and where
  - Draft App Store / Play Store privacy disclosures

### Phase 7: Critical Hardening (Post-Audit Bug Fixes)

> Discovered during the post-completion audit (2026-05-19). All six items below block production release.

#### T7.1: WebSocket session ownership check on reconnect

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 1 hour
- **Dependencies**: T3.1
- **Description**:
  - In `services/backend/src/app/ws/routes.py` at the `existing = await db.get(DiagnosticSession, session_id)` branch, reject when `existing.user_id != user_id`
  - Close the socket with code 4001 (policy violation) and a structured log line
  - Add a regression test that authenticates as User B and attempts to connect to User A's session_id — must close with 4001
  - **Severity**: CRITICAL — current behavior allows session hijack by any authenticated user who knows the UUID

#### T7.2: Wire ConversationContextManager into WS handler

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T3.8
- **Description**:
  - Instantiate `ConversationContextManager` per session in `ws/routes.py` alongside the existing `state` object
  - After every assistant turn, call `manager.maybe_compress(...)` with current message history
  - Persist `manager.last_summary` → `DiagnosticSession.context_summary` on each compression
  - On WS connect, hydrate the manager from `ds.context_summary` if present
  - Replace the scalar `state.tokens_used` budget gate with the manager's accurate input+cache+output accounting
  - **Severity**: CRITICAL — without this, long sessions hit the 200K context limit and fail with a 400 from Anthropic

#### T7.3: Vehicle context and supported PIDs in WS register frame

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T1.4, T3.5, T5.6
- **Description**:
  - Extend `register` frame schema (`packages/obd-protocol` + backend `ws/protocol.py`) with `vin`, `make`, `model`, `year`, `supported_pids: string[]`
  - Mobile: read these from the active vehicle profile + supported-PID cache when opening chat, pass via `useChatStore.connect({...})`
  - Backend: forward all five into `build_system_prompt` so Claude actually knows the vehicle and which PIDs are safe to call
  - Add backend validation: reject register frames missing `vin` if the session was created with a `vehicle_id`
  - **Severity**: CRITICAL — Claude currently sees "Vehicle: unknown" on every turn and may call PIDs the ECU doesn't support, producing `NO DATA` errors on every read

#### T7.4: Session token budget default and production env

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 1 hour
- **Dependencies**: T6.2
- **Description**:
  - Change `session_token_budget` default in `config.py` from `0` (unlimited) to `200000`
  - Document the var in `services/backend/.env.example` and `fly.toml`
  - Add a CI assertion that production environments set the var explicitly
  - **Severity**: CRITICAL — current default allows a single user to drive tens of millions of tokens in Anthropic spend

#### T7.5: Replace placeholder EAS production URLs

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 1 hour
- **Dependencies**: T6.5, T0.9
- **Description**:
  - Set real `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WS_URL` for `preview` and `production` profiles in `apps/mobile/eas.json`
  - Fill `submit.production` with `appleId` and `serviceAccountKeyPath`
  - Add a build-time check in `app.config.ts` that aborts when the URL contains `example.com`
  - **Severity**: CRITICAL — any production build today targets a nonexistent domain

#### T7.6: Production build guard against E2E bypass

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: T6.4, T6.5
- **Description**:
  - In `app.config.ts`, assert that `EXPO_PUBLIC_E2E` is never `'1'` when the EAS profile is `production`
  - Add a CI step in `.github/workflows/` that rejects PRs touching `.env*` files with `EXPO_PUBLIC_E2E=1`
  - In `src/store/auth.ts`, replace the runtime `isE2E()` check with a build-time constant injected via `EAS_BUILD_PROFILE`
  - **Severity**: CRITICAL — current bypass injects `'e2e-access-token'` into SecureStore and would be visible to real users if the env var leaks

### Phase 7B: High-Priority Hardening

#### T7.7: User-ID-based auth rate limiting

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 2 hours
- **Dependencies**: T0.6
- **Description**:
  - Refactor `services/backend/src/app/auth/rate_limit.py` to key by user ID (after JWT decode) for `/auth/refresh` and `/auth/me`
  - Keep IP-based limiting for `/auth/register` and `/auth/login` (no user ID yet at that point) but bump to `20/minute`
  - Document the dual strategy in the auth rate-limit module docstring
  - **Severity**: HIGH — carrier NAT means current 10/minute/IP can block an entire mobile carrier cell

#### T7.8: Access-token revocation on account deletion

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T5.7
- **Description**:
  - Add `revoked_tokens` table (`jti`, `user_id`, `revoked_at`, `expires_at`)
  - JWT issuance writes `jti` claim; middleware checks the denylist (cached in-process, refresh every 60s)
  - `DELETE /auth/me` inserts all of the user's active access-token `jti`s into the denylist
  - Add purge job (or cron) to delete denylist rows past `expires_at`
  - **Severity**: HIGH — currently a deleted user's last access token stays valid for up to 15 minutes

#### T7.9: vehicle_id persistence in backend sessions

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 2 hours
- **Dependencies**: T3.6, T3.7
- **Description**:
  - Add `vehicle_id` FK to `DiagnosticSession` model (nullable, `ON DELETE SET NULL`)
  - Update Alembic migration (after T9.1 lands) or schema upgrade path
  - Stop dropping `vehicle_id` in `sync/routes.py:144`; include it in pull responses
  - Add a sync test verifying `vehicle_id` survives push→pull round-trip across two devices
  - **Severity**: HIGH — multi-device users lose session↔vehicle links permanently today

#### T7.10: Complete i18n coverage for auth and dashboard screens

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T5.4
- **Description**:
  - Replace hard-coded English in `app/(auth)/sign-in.tsx`, `app/(auth)/sign-up.tsx`, `app/(app)/dashboard.tsx` with `t()` calls
  - Add the missing keys to `src/i18n/locales/en.json` and `ka.json`
  - Add an i18n-lint script: greps for English string literals in JSX (allow-listed terms via comment)
  - Wire the lint into CI
  - **Severity**: HIGH — Georgian-locale users see English on primary screens, breaking the i18n requirement from Phase 5

#### T7.11: Accessibility annotations across mobile app

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T2.1, T4.1, T4.2
- **Description**:
  - Add `accessibilityLabel`, `accessibilityRole`, `accessibilityHint` to every `Pressable`, icon-only button, and gauge
  - Send button (`↑`) and Stop button (`■`) must have descriptive labels
  - Run iOS VoiceOver and Android TalkBack smoke pass on Chat + Dashboard
  - Add a lint rule via `eslint-plugin-react-native-a11y` (or equivalent)
  - **Severity**: HIGH — App Store may reject; Play Store flags

#### T7.12: Persistent rate limiter for AI endpoints

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T6.2, T0.9
- **Description**:
  - Swap `MemoryStorage` for `RedisStorage` (slowapi) on the AI rate limiter
  - Provision a tiny Redis on Fly.io (Upstash or Fly's managed); store URL in secrets
  - Fall back to memory in dev/test when `REDIS_URL` is unset, with a startup warning
  - **Severity**: HIGH — Fly.io scale-to-zero resets the in-memory counter, abuse window opens on every cold start

#### T7.13: Persist conversation context summary

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: T7.2
- **Description**:
  - In `ws/routes.py` turn handler, after any compression event, write `ds.context_summary = manager.last_summary` and commit
  - On WS reconnect for an existing session, hydrate the manager with the stored summary
  - Test: simulate a compression, reconnect, verify the summary survives without re-running the summarizer
  - **Severity**: MEDIUM-HIGH — without this, every reconnect of a long session triggers a fresh Haiku summarization call (cost + latency)

### Phase 8: Comprehensive Testing (100% Coverage Pass)

> Existing test suite (T6.3) covers the basics. This phase brings it to production-grade with explicit assertions, boundary tests, and the integration + E2E layers that today's tests skip.

#### T8.1: Backend unit test expansion

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 8 hours
- **Dependencies**: T6.3, T7.1, T7.2
- **Description**:
  - `ConversationContextManager.maybe_compress`: threshold trigger, summarizer failure handled gracefully, `last_summary` updates, token accounting includes cache reads
  - `build_system_prompt`: assert `make`/`model`/`year`/`vin` render in output block when provided
  - `security.py`: reject JWTs with `alg: none`, with mismatched algorithm, with tampered payload, with expired `exp`
  - `service.py`: refresh token replay after rotation returns 401; concurrent refresh requests with same token serialize correctly
  - `auth/rate_limit.py`: user-ID isolation correctness for AI; IP isolation for register/login; verify counters reset at window boundary
  - `claude/dispatcher.py`: write-tool gate requires BOTH `confirmed: true` AND `confirmed_writes` allowlist; oversized `tool_result` content (>16KB) truncated with `[truncated]` marker; tool execution timeout produces `tool_call_error`
  - `sync` engine: LWW resolution with clock skew, cross-user `session_id` push returns 400, FK ordering enforced (session before messages before tool_calls)
  - `ws/protocol.py`: frame schema validation rejects unknown types, sequence monotonicity enforced, replay buffer evicts oldest at 256
  - Coverage target: ≥ 90% lines / 85% branches on `src/app/`

#### T8.2: Mobile unit test expansion

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 8 hours
- **Dependencies**: T6.3
- **Description**:
  - `ConnectionMachine`: every valid transition asserted; illegal transitions are no-ops; backoff timer correctness; teardown error surfaces instead of being swallowed
  - `DtcReader`: `'43 03 00'` decodes to `['P0300']` (currently only `Array.isArray` is checked); `clearDtcs` `verified: true` when re-read returns empty, `verified: false` when stale codes remain
  - `PidReader`: battery voltage 0x0000 → 0V and 0xFFFF → 65.535V; coolant temp signed offset (A - 40); RPM `((A*256)+B)/4`; speed direct; MAF `((A*256)+B)/100`
  - `parseDtcFrame`: multi-line CAN ISO-TP frame, compact no-space format, odd-byte-count truncation, malformed input returns `[]` instead of throwing
  - `parseVinFrame`: 17-char extraction, `NO DATA` → `null`, non-printable bytes → `null`
  - `CommandQueue`: `cancelAll` while in-flight (running completes, queued reject); priority-bypass for init commands; timeout cleanup releases the slot
  - `refreshAccessToken` in `api.ts`: concurrent 401s share one refresh promise; failure clears stored tokens and returns null
  - `Elm327Client.sendCommand`: returned frame is cleaned consistently (no trailing `\r`)
  - `mock-adapter`: full round-trip — init → readPid(RPM) → readDtcs → clearDtcs — asserts realistic value ranges
  - Coverage target: ≥ 85% lines on `apps/mobile/src/`

#### T8.3: Backend integration tests

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 8 hours
- **Dependencies**: T8.1, T7.1, T7.2, T7.3
- **Description**:
  - Full auth lifecycle: register → login → refresh → me → logout — assert tokens valid between steps
  - WS `/session/{id}` register with VIN + supported_pids → user_message → mocked Claude returns text + tool_use → dispatcher executes → `turn_complete` emitted with `stop_reason: end_turn`
  - WS abort mid-stream: `abort` frame during text stream → `turn_complete` with `stop_reason: aborted`, no further deltas
  - WS `clear_dtcs` confirmation loop: user_message → `tool_call_error` with `confirmation_required` → `confirm_write` → second user_message → tool executes
  - Sync cross-user isolation: User B pushes a session with User A's id → 400 rejected ack
  - Sync FK ordering: push messages before their session → service must buffer or reject cleanly
  - Token refresh integration: protected endpoint with expired token returns 401, mobile `apiFetch` refreshes and retries successfully
  - Context compression trigger after T7.2 lands: send N synthetic turns until threshold, assert summarizer called, `context_summary` persisted
  - `DELETE /auth/me` cascade: assert refresh_tokens, sessions, messages, tool_calls, vehicles all gone
  - Google Sign-In: mock Google ID token verifier (valid + `email_verified: true`), assert user auto-created + JWTs issued

#### T8.4: Mobile integration tests

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T8.2
- **Description**:
  - `ChatClient` protocol shape: register → user_message → text_delta → turn_complete, asserted against fixtures
  - Sync engine push → pull round-trip: every field preserved, deletes propagate via `deleted_at`
  - Foreground sync trigger: app state goes background → foreground, assert sync tick runs and pending messages push
  - 401 → refresh → retry: mock 401 on protected fetch, mock refresh success, assert original request replays with new token
  - Onboarding store: complete flow updates `onboardingComplete: true` and persists

#### T8.5: E2E flows (Maestro) — chat, onboarding, history

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 6 hours
- **Dependencies**: T6.4, T1.6, T4.3
- **Description**:
  - `happy-path-chat.yaml`: sign-in (mock backend) → home → connect mock adapter → open chat → type message → assert assistant response widget appears → assert tool-call card with PID value
  - `onboarding.yaml`: first launch → permissions modal → connect mock → VIN step → language pick → arrives at home
  - `history.yaml`: complete chat → navigate to history → tap session → messages render
  - `dtc-clear.yaml`: read DTCs → tap clear → confirmation modal → confirm → DTCs cleared with `verified: true` shown
  - All four run in CI on `apps/mobile` PR via Maestro Cloud or local emulator

#### T8.6: E2E flows — auth, offline, expiry

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 5 hours
- **Dependencies**: T8.5
- **Description**:
  - `auth-persistence.yaml`: sign-in → kill app → relaunch → still signed in (SecureStore hydration)
  - `offline-mode.yaml`: disable network → send chat → optimistic message visible + queued → re-enable network → assert sync happens
  - `token-expiry.yaml`: test helper expires the access token → resume app → background refresh fires → no sign-out, next request succeeds
  - `google-signin.yaml`: tap "Continue with Google" → mock OAuth response → land on home

#### T8.7: Hardware and device QA matrix

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 8 hours
- **Dependencies**: T8.5
- **Description**:
  - Live ELM327 dongle on a real vehicle: full init → RPM/speed/coolant read → DTC read → DTC clear with verification (allow up to 5s for mode 04)
  - Legacy protocol fallback: pre-2008 vehicle with ISO 9141-2 or KWP — verify ATSP3/4/5 path
  - BLE mid-session disconnect: unplug dongle, verify state machine recovers to `error` then reconnects with backoff
  - Android 12+ runtime BLE permissions: BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION prompts on first scan; meaningful error if denied
  - iOS background sync: app to background 5min, foreground, assert pending messages sync
  - SecureStore on Android emulator without Keystore: verify fallback does not silently store plaintext
  - Spam test: 5 rapid messages — only first triggers turn, others get `busy` error frame
  - Sign each test off in a markdown checklist committed to `docs/qa-matrix.md`

#### T8.8: Security pentest

- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 6 hours
- **Dependencies**: T7.1, T7.6, T7.8
- **Description**:
  - JWT algorithm confusion: send `alg: none`, send `alg: HS256` with public key as secret — must reject
  - Refresh token replay: use a refresh token twice — second use must 401 and not silently issue new pair
  - WS session hijack: User B reconnects to User A's session_id — must close with 4001 (verifies T7.1)
  - Sync cross-user push: User B pushes another user's session_id — 400 rejected
  - Oversized `tool_result` content (>16KB) — truncation gate fires, no API error
  - CORS: cross-origin fetch from disallowed origin rejected
  - SQL injection attempts in chat content and sync fields
  - XSS in chat content: markdown render must escape script tags and `javascript:` URLs
  - WS auth missing token: 4001 close, no session created
  - Production build sanity: confirm no E2E bypass UI, no `example.com`, no debug logging of PII
  - Document findings in `docs/security-audit.md`

### Phase 9: Production Readiness

#### T9.1: Alembic migration baseline

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T3.6
- **Description**:
  - Replace `Base.metadata.create_all` in `db.py:init_db()` with Alembic
  - Generate baseline migration matching current schema; commit `alembic/versions/0001_initial.py`
  - Add `make migrate` / `make migrate-create` scripts
  - CI runs `alembic upgrade head` against an ephemeral DB to verify migrations apply cleanly
  - All future schema changes (T7.8 denylist, T7.9 vehicle_id, T7.13 summary) ship as numbered migrations

#### T9.2: Production environment and secrets

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 3 hours
- **Dependencies**: T7.4, T7.5, T7.12
- **Description**:
  - Document every required env var in `services/backend/.env.example` and `apps/mobile/.env.example` with descriptions and safe defaults where applicable
  - Audit Fly.io secrets list against `.env.example` — flag any missing
  - Move Anthropic key, JWT secret, Google client IDs, Sentry DSN, Redis URL into platform secrets
  - Verify mobile builds via EAS use `EAS_SECRET_*` injection, not `.env` files committed to git
  - Add a `make verify-env` script that fails if required vars are unset

#### T9.3: Monitoring, logging, and crash reporting hardening

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T6.1, T9.2
- **Description**:
  - Backend: structured JSON logs via `structlog`, no PII (no full tokens, passwords, VIN, chat content beyond first 64 chars)
  - Mobile: Sentry release tagging from EAS build profile + `expo-application` version
  - Add `/health` endpoint that pings DB and Redis
  - Sentry: PII scrubber for chat content (configured rules, tested with a synthetic event)
  - Alerting: error-rate threshold + p95 latency thresholds defined in observability config (or documented for manual setup)

#### T9.4: CI/CD pipeline completeness

- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T8.1, T8.2, T8.3, T9.1
- **Description**:
  - `.github/workflows/ci.yml`: typecheck + lint + unit tests on every PR, both apps + backend
  - `.github/workflows/integration.yml`: backend integration tests with ephemeral DB on PR
  - `.github/workflows/e2e.yml`: Maestro E2E on PR (or nightly if cost-sensitive)
  - `.github/workflows/deploy-backend.yml`: on merge to main → run migrations → deploy to Fly
  - Branch protection on `main`: require all checks + 1 review
  - Coverage report uploaded as artifact

#### T9.5: Docs and onboarding

- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: T9.2, T9.4
- **Description**:
  - Update `README.md` with current commands (dev server, tests, e2e, deploy)
  - Write `ONBOARDING.md` for new contributors: setup, env vars, common workflows
  - Update `docs/privacy-policy.md` from T6.6 with anything new (Sentry, rate limits, retention)
  - Architecture diagram (mermaid) of mobile ↔ WS ↔ Claude ↔ DB flow

## Open Questions

- Cloud vs self-hosted backend for v1? (recommend cloud for cost/observability; self-host later if user demand exists)
- Multi-vehicle profile support in MVP, or single-vehicle?
- Voice input — Phase 6 stretch or out of scope?
- Monetization: free + paid AI quota, or fully paid? **Blocks T6.2 design** — decide before that task starts.
- **Session lifecycle**: when does a "session" end? App background, BLE disconnect, explicit user action, or idle timeout? Affects T3.1 WS routing and T5.3 history grouping — decide before T3.1.
