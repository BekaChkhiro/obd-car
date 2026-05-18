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

## Open Questions

- Cloud vs self-hosted backend for v1? (recommend cloud for cost/observability; self-host later if user demand exists)
- Multi-vehicle profile support in MVP, or single-vehicle?
- Voice input — Phase 6 stretch or out of scope?
- Monetization: free + paid AI quota, or fully paid? **Blocks T6.2 design** — decide before that task starts.
- **Session lifecycle**: when does a "session" end? App background, BLE disconnect, explicit user action, or idle timeout? Affects T3.1 WS routing and T5.3 history grouping — decide before T3.1.
